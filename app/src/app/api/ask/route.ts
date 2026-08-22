import { NextResponse, type NextRequest } from "next/server";

import { createLlmClient } from "@/lib/ai/llm-client";
import { isAiFeatureEnabled } from "@/lib/ai/ai-feature-flag";
import { consumeAiRateLimit } from "@/lib/ai/rate-limit";
import { aiRateLimitedResponse, apiErrorResponse, getDbOrErrorResponse, parseJsonRequest, validatedJsonResponse } from "@/lib/api/route-helpers";

import { violatesOutputGuard, OUTPUT_GUARD_FALLBACK_TEXT } from "@/features/ai-summary/services/output-guard";
import { containsCausalAssertion } from "@/features/recommend/services/fact-guard";
import { formatSourceCredit } from "@/features/support/services/facility-display";
import { fetchFacilityById } from "@/features/support/services/facility-search";
import { fetchSchoolById } from "@/features/support/services/school-info";

import { AskRequestSchema, AskResponseSchema } from "@/features/ask-ai/schema/ask";
import type { AskResponse } from "@/features/ask-ai/schema/ask";
import { buildFacilityAnswer } from "@/features/ask-ai/services/facility-answer";
import { buildSchoolAnswer } from "@/features/ask-ai/services/school-answer";
import { buildInstitutionAnswerPrompt, INSTITUTION_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION } from "@/features/ask-ai/services/institution-prompt";
import { fetchInstitutionKnowledge } from "@/features/ask-ai/services/knowledge";
import { findPresetQuestion } from "@/features/ask-ai/services/preset-questions";

// `/api/ask`(TICKET-0048)。窓口カード(FacilityCard)の「AIに質問する」導線から、明示同意・
// 送信内容プレビューを経たあとにのみ呼び出される想定(FR-041、summarize/prepare route と同じ
// 方針)。POST のみを受け付ける(security.md「状態変更 API は POST/PUT/DELETE のみ許可」)。
//
// **入力は選択式のみ(AC-2、危機介入回避構造の維持)**: このルートには自由記述フィールドが
// 一切存在しない(AskRequestSchema 参照)。定型質問マスタ(services/preset-questions.ts)自体が
// 危機介入を誘発しない質問のみで構成されている「簡易な許可リスト方式」(実装方針 §5)を採用し、
// 生成結果には既存の出力ガードを必ず適用する(TICKET-0046 と同じ多層防御)。
//
// **回答の3経路(AC-3)**:
// - targetType="facility": 対象施設の D1 事実情報のみから決定的に回答を組み立てる
//   (services/facility-answer.ts。LLM を介さないため捏造の余地が構造的に無い)。
// - targetType="school": 対象学校の D1 手動調査データのみから決定的に回答を組み立てる
//   (services/school-answer.ts。facility 経路と同じくLLMを介さない。学校情報は
//   risk_level/サマリーモードの概念を持たないため facility 経路のような出し分けは行わない)。
// - targetType="institution": 低リスクデータ(risk_level='low')の説明文を根拠として LLM で
//   回答を生成する(services/knowledge.ts + services/institution-prompt.ts)。根拠データが
//   1件も無い場合は LLM を呼び出さずグレースフルフォールバックする(AC-4、TICKET-0049 と対応)。
//
// **出典表示必須(AC-3)**: `isFallback=false` の場合、`sources` に最低1件を必ず詰める
// (facility 経路は対象施設1件、school 経路は対象学校の出典、institution 経路は根拠に使った
// 低リスクデータ全件)。
//
// NFR-36(ログ非保存)に関する注意: このファイル全体で facilityId・questionId・LLM 応答本文を
// console.log 等に一切出力しない。zod 検証エラー時・LLM 呼び出し失敗時のエラーハンドリングも
// 同様に、汎用メッセージのみを返す。

function buildValidatedJsonResponse(body: AskResponse): NextResponse {
  return validatedJsonResponse(body, AskResponseSchema);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseJsonRequest(request, AskRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const dbResult = getDbOrErrorResponse("情報の取得に失敗しました。しばらくしてから再度お試しください。");
  if (!dbResult.ok) return dbResult.response;
  const { db } = dbResult;

  if (parsed.data.targetType === "facility") {
    const { questionId, facilityId } = parsed.data;
    const facility = await fetchFacilityById(db, facilityId);
    if (!facility) {
      return apiErrorResponse("NOT_FOUND", "窓口情報が見つかりませんでした。", 404);
    }

    // facility 経路は LLM を呼ばないため原価ガードの対象外。fact-guard 方針として D1 の事実情報
    // のみから決定的に回答を組み立てる。
    const { answer, sources } = buildFacilityAnswer(questionId, facility);
    return buildValidatedJsonResponse({ answer, sources, isFallback: false, fallbackMessage: null });
  }

  if (parsed.data.targetType === "school") {
    const { questionId, schoolId } = parsed.data;
    const school = await fetchSchoolById(db, schoolId);
    if (!school) {
      return apiErrorResponse("NOT_FOUND", "学校情報が見つかりませんでした。", 404);
    }

    // school 経路も facility 経路と同じく LLM を呼ばない。D1 の手動調査データのみから
    // 決定的に回答を組み立てる(services/school-answer.ts)。
    const { answer, sources } = buildSchoolAnswer(questionId, school);
    return buildValidatedJsonResponse({ answer, sources, isFallback: false, fallbackMessage: null });
  }

  // targetType === "institution"。
  const { questionId } = parsed.data;
  const question = findPresetQuestion(questionId);
  if (!question) {
    // zod(INSTITUTION_QUESTION_IDS)で事前に弾かれる想定のため、到達しない防御的分岐。
    return apiErrorResponse("VALIDATION_ERROR", "入力内容を確認してください。", 400);
  }

  if (!isAiFeatureEnabled()) {
    const fallbackMessage =
      "AI による回答は現在一時的に停止しています。お手数ですが、窓口へ直接お問い合わせください。";
    return buildValidatedJsonResponse({ answer: fallbackMessage, sources: [], isFallback: true, fallbackMessage });
  }
  const rateLimit = await consumeAiRateLimit(request);
  if (!rateLimit.allowed) return aiRateLimitedResponse(rateLimit.retryAfterSeconds);

  const evidence = await fetchInstitutionKnowledge(db);
  if (evidence.length === 0) {
    // AC-4: 低リスクデータが未整備(TICKET-0049 の hattatsu.go.jp 実データ未投入等)の場合でも
    // 例外を投げず、根拠不足を明示したうえで一般的な相談窓口への案内へグレースフルフォールバックする。
    const fallbackMessage =
      "この質問にお答えできる根拠データが現在整っていません。お手数ですが、窓口へ直接お問い合わせください。";
    return buildValidatedJsonResponse({ answer: fallbackMessage, sources: [], isFallback: true, fallbackMessage });
  }

  const prompt = buildInstitutionAnswerPrompt(question.label, evidence);

  let generatedText: string;
  try {
    const llmClient = createLlmClient();
    const result = await llmClient.generate(prompt, {
      systemInstruction: INSTITUTION_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
      cacheable: true,
    });
    generatedText = result.text;
  } catch {
    // NFR-36: 例外オブジェクトをログに出力しない。
    return apiErrorResponse("UPSTREAM_ERROR", "回答の生成に失敗しました。しばらくしてから再度お試しください。", 502);
  }

  // 出力ガード(NFR-51)+ 因果断定文型ガード(TICKET-0060, SNS-D05)。fact-guard.ts の
  // 元docコメントで「今後explain側でも組み込むこと」と明示されていた配線ギャップを、
  // institution経路(LLMを呼ぶ唯一の経路)にも解消する。facility/school経路はLLMを呼ばない
  // 決定的回答のため対象外(変更しない)。
  const answer =
    violatesOutputGuard(generatedText) || containsCausalAssertion(generatedText)
      ? OUTPUT_GUARD_FALLBACK_TEXT
      : generatedText;
  const sources = evidence.map((row) => ({ credit: formatSourceCredit(row), sourceUrl: row.sourceUrl }));

  return buildValidatedJsonResponse({ answer, sources, isFallback: false, fallbackMessage: null });
}
