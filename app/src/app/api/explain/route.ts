import { NextResponse, type NextRequest } from "next/server";

import { createLlmClient } from "@/lib/ai/llm-client";
import { isAiFeatureEnabled } from "@/lib/ai/ai-feature-flag";
import { consumeAiRateLimit } from "@/lib/ai/rate-limit";
import { aiDisabledResponse, aiRateLimitedResponse, apiErrorResponse, parseJsonRequest, validatedJsonResponse } from "@/lib/api/route-helpers";

import { violatesOutputGuard, OUTPUT_GUARD_FALLBACK_TEXT } from "@/features/ai-summary/services/output-guard";
import { containsCausalAssertion } from "@/features/recommend/services/fact-guard";
import { buildCategoryEvidence } from "@/features/explain/services/category-evidence";
import { buildCategoryExplainPrompt, EXPLAIN_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION } from "@/features/explain/services/prompt";
import { ExplainRequestSchema, ExplainResponseSchema } from "@/features/explain/schema/explain";
import type { ExplainResponse } from "@/features/explain/schema/explain";
import { getAllQuestions } from "@/features/survey/services/questions";

// `/api/explain`(TICKET-0023)。結果画面のレーダーチャート/ベン図の「上位カテゴリ解説」
// セクションから、明示同意・送信内容プレビュー(カテゴリ名のみ)を経たあとにのみ呼び出される
// 想定(FR-041, FR-043)。POST のみを受け付ける(summarize route と同じ方針)。
//
// AC-3(FR-043): fact-checked 242件のうち対象カテゴリに属する質問文(抜粋)を根拠として
// プロンプトに含め、LLM にはそれらを踏まえた一般的な傾向解説のみを生成させる
// (buildCategoryEvidence / buildCategoryExplainPrompt を参照)。
//
// 送信される情報はカテゴリ key(ホワイトリスト)のみで、個人の回答・スコア・年齢・地域は
// 一切含まない(危機介入ガード対象となる自由記述も存在しないため、summarize route と異なり
// containsCrisisSignal は適用しない)。
//
// NFR-36(ログ非保存)に関する注意: このファイル全体で LLM 応答本文を console.log 等に
// 一切出力しない。zod 検証エラー時・LLM 呼び出し失敗時のエラーハンドリングも同様に、
// 汎用メッセージのみを返す。

function buildValidatedJsonResponse(body: ExplainResponse): NextResponse {
  return validatedJsonResponse(body, ExplainResponseSchema);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseJsonRequest(request, ExplainRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  // 原価防衛ガード(TICKET-0035)。LLM を呼ぶ前に、AI 機能キルスイッチ → レート制限の順で判定する。
  if (!isAiFeatureEnabled()) {
    return aiDisabledResponse();
  }
  const rateLimit = await consumeAiRateLimit(request);
  if (!rateLimit.allowed) {
    return aiRateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const { topCategories } = parsed.data;
  const evidence = buildCategoryEvidence(topCategories, getAllQuestions());
  const prompt = buildCategoryExplainPrompt(evidence);

  let generatedText: string;
  try {
    const llmClient = createLlmClient();
    const result = await llmClient.generate(prompt, {
      systemInstruction: EXPLAIN_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
      cacheable: true,
    });
    generatedText = result.text;
  } catch {
    // NFR-36: 例外オブジェクトをログに出力しない。
    return apiErrorResponse("UPSTREAM_ERROR", "解説の生成に失敗しました。しばらくしてから再度お試しください。", 502);
  }

  // 出力ガード(NFR-51)+ 因果断定文型ガード(TICKET-0060, SNS-D05)。fact-guard.ts の
  // 元docコメントで「今後explain側でも組み込むこと」と明示されていた配線ギャップを解消し、
  // recommend/route.ts と同じ判定に揃える。禁止語・断定表現・因果断定のいずれかを含む応答は
  // そのまま返さず定型文にフォールバックする。
  const explanation =
    violatesOutputGuard(generatedText) || containsCausalAssertion(generatedText)
      ? OUTPUT_GUARD_FALLBACK_TEXT
      : generatedText;

  return buildValidatedJsonResponse({ explanation });
}
