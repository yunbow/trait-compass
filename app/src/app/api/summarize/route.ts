import { NextResponse, type NextRequest } from "next/server";

import { createLlmClient } from "@/lib/ai/llm-client";
import { isAiFeatureEnabled } from "@/lib/ai/ai-feature-flag";
import { containsPromptInjectionSignal } from "@/lib/ai/injection-detection";
import { consumeAiRateLimit } from "@/lib/ai/rate-limit";
import { aiDisabledResponse, aiRateLimitedResponse, apiErrorResponse, parseJsonRequest, validatedJsonResponse } from "@/lib/api/route-helpers";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { containsCrisisSignal } from "@/features/ai-summary/services/crisis-detection";
import { violatesOutputGuard, OUTPUT_GUARD_FALLBACK_TEXT } from "@/features/ai-summary/services/output-guard";
import {
  buildSummarizePrompt,
  CRISIS_GUIDANCE_TEXT,
  INJECTION_GUARD_FALLBACK_TEXT,
  NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
} from "@/features/ai-summary/services/prompt";
import { SummarizeRequestSchema, SummarizeResponseSchema } from "@/features/ai-summary/schema/summarize";
import type { SummarizeResponse } from "@/features/ai-summary/schema/summarize";

// `/api/summarize`(TICKET-0022)。結果画面の「AI に相談内容を要約してもらう(任意)」
// セクション(AiSummarySection)から、明示同意・送信内容プレビューを経たあとにのみ
// 呼び出される想定(FR-041)。POST のみを受け付ける(状態変更 API は
// POST/PUT/DELETE のみ許可、という方針に加え、本 API は生成 AI 呼び出しという副作用を持つため POST とする)。
//
// NFR-36(ログ非保存)に関する重要な注意: このファイル全体で自由記述テキスト・LLM 応答本文を
// console.log 等に一切出力しない。zod 検証エラー時・LLM 呼び出し失敗時のエラーハンドリングも
// 同様に、入力/出力テキストを含まない汎用メッセージのみを返す。

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseJsonRequest(request, SummarizeRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { freeText, topCategories } = parsed.data;

  // 危機介入ガード(FR-044 AC-4): 該当する場合は LLM を一切呼び出さず、
  // 一般相談窓口案内の定型文のみを返す。
  if (containsCrisisSignal(freeText)) {
    return buildValidatedJsonResponse({ summary: CRISIS_GUIDANCE_TEXT, isCrisisResponse: true });
  }

  // 注入検知ガード(FR-046): 該当する場合は LLM を一切呼び出さず、定型文のみを返す。
  // 危機介入とは別種の縮退のため isCrisisResponse は false のまま(偽らない)。
  // コストが発生しないため、危機介入ガードと同じく原価防衛ガードより先に評価する。
  if (containsPromptInjectionSignal(freeText)) {
    return buildValidatedJsonResponse({ summary: INJECTION_GUARD_FALLBACK_TEXT, isCrisisResponse: false });
  }

  // 危機介入は LLM を使わない定型文でコストが発生しないため、AI 停止中・レート制限中でも
  // 必ず返す(FR-044)。原価防衛ガードは危機介入ガードより後に評価する。
  // 原価防衛ガード(TICKET-0035)。LLM を呼ぶ前に、AI 機能キルスイッチ → レート制限の順で判定する。
  if (!isAiFeatureEnabled()) {
    return aiDisabledResponse();
  }
  const rateLimit = await consumeAiRateLimit(request);
  if (!rateLimit.allowed) {
    return aiRateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const topCategoryLabels = topCategories.map((key) => CATEGORY_LABELS[key]);
  const prompt = buildSummarizePrompt(freeText, topCategoryLabels);

  let generatedText: string;
  try {
    const llmClient = createLlmClient();
    // temperature は低め(0.3)にし、非診断ガードの指示に安定して従わせる。maxOutputTokens(512)は
    // 「3〜5文程度」という出力制約に対して十分な余裕を持たせた値。
    const result = await llmClient.generate(prompt, {
      systemInstruction: NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
      temperature: 0.3,
      maxOutputTokens: 512,
    });
    generatedText = result.text;
  } catch {
    // NFR-36: 例外オブジェクト・入力テキストをログに出力しない。呼び出し元にも詳細を返さない。
    return apiErrorResponse("UPSTREAM_ERROR", "要約の生成に失敗しました。しばらくしてから再度お試しください。", 502);
  }

  // 出力ガード(NFR-51): 禁止語・断定表現を含む応答はそのまま返さず定型文にフォールバックする。
  const summary = violatesOutputGuard(generatedText) ? OUTPUT_GUARD_FALLBACK_TEXT : generatedText;

  return buildValidatedJsonResponse({ summary, isCrisisResponse: false });
}

/**
 * レスポンスを zod で検証してから返す。検証に失敗した場合(実装バグ等で想定外の形になった
 * 場合)は本文を返さず 500 とする。
 */
function buildValidatedJsonResponse(body: SummarizeResponse): NextResponse {
  return validatedJsonResponse(body, SummarizeResponseSchema);
}
