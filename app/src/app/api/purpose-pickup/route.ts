import type { NextRequest, NextResponse } from "next/server";

import { isAiFeatureEnabled } from "@/lib/ai/ai-feature-flag";
import { containsPromptInjectionSignal } from "@/lib/ai/injection-detection";
import { createLlmClient } from "@/lib/ai/llm-client";
import { consumeAiRateLimit } from "@/lib/ai/rate-limit";
import { aiRateLimitedResponse, parseJsonRequest, validatedJsonResponse } from "@/lib/api/route-helpers";

import { containsCrisisSignal } from "@/features/ai-summary/services/crisis-detection";
import { violatesOutputGuard } from "@/features/ai-summary/services/output-guard";

import {
  PurposePickupRequestSchema,
  PurposePickupResponseSchema,
} from "@/features/purpose-pickup/schema/purpose-pickup";
import type { PurposePickupResponse } from "@/features/purpose-pickup/schema/purpose-pickup";
import {
  buildPurposePickupPrompt,
  parsePurposePickupOutput,
  PURPOSE_PICKUP_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
} from "@/features/purpose-pickup/services/prompt";

import { PURPOSE_OPTIONS_BY_LIFESTAGE } from "@/features/support/constants/purpose-options";

// `/api/purpose-pickup`。目的選択画面(`/support/purpose`)の「それ以外」ボタン選択時の
// 自由記述から、利用者のライフステージに応じた「目的」の選択肢リスト
// (`PURPOSE_OPTIONS_BY_LIFESTAGE`)の中で最も近いものの id を LLM に選ばせる。
// 状態変更を伴わないが、生成 AI 呼び出しという副作用を持つため recommend/summarize route と
// 同じく POST のみを受け付ける(security.md)。
//
// ガードの順序は `/api/recommend` と同一の並びに揃える:
// 1. 危機介入ガード(FR-044): containsCrisisSignal に該当する場合、LLM を一切呼ばず
//    isCrisisResponse=true・matchedPurposeId=null を返す(定型文でコストが発生しないため、
//    AI 停止中・レート制限中でも必ず返す)。
// 2. 注入検知ガード(FR-046): containsPromptInjectionSignal に該当する場合、LLM を一切呼ばず
//    isCrisisResponse=false・matchedPurposeId=null を返す(非AI体験への縮退)。
// 3. AI キルスイッチ(TICKET-0035 AC-3): isAiFeatureEnabled() が false の場合、
//    matchedPurposeId=null・isAiEnabled=false を返す(非AI体験への縮退)。
// 4. 原価防衛レート制限(TICKET-0035 AC-1): 5つの AI 機能で共有の1クォータ
//    (consumeAiRateLimit)を消費し、超過時は 429 を返す。
// 5. LLM 呼び出し。例外時は recommend の個別施設エラー処理と同じ「落とさず縮退」方針で、
//    matchedPurposeId=null・isAiEnabled=false を返す。
// 6. 出力ガード(NFR-51、violatesOutputGuard)+ 選択肢実在チェック(parsePurposePickupOutput)
//    の2段構え。マッチしてもしなくても isAiEnabled=true(AI 経路は正常に動作したため)。
//
// **NFR-36(ログ非保存)**: このファイル全体で自由記述(freeText)・LLM 応答本文・例外詳細を
// console.log/console.error 等に一切出力しない。

function buildValidatedJsonResponse(body: PurposePickupResponse): NextResponse {
  return validatedJsonResponse(body, PurposePickupResponseSchema);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseJsonRequest(request, PurposePickupRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { freeText, lifestage } = parsed.data;

  // 危機介入ガード(FR-044): 該当する場合は LlmClient を一切呼び出さない。
  if (containsCrisisSignal(freeText)) {
    return buildValidatedJsonResponse({
      matchedPurposeId: null,
      isAiEnabled: false,
      isCrisisResponse: true,
    });
  }

  // 注入検知ガード(FR-046): 該当する場合は LlmClient を一切呼び出さず、非AI体験へ縮退する
  // (AI キルスイッチ時と同じ応答形)。危機介入とは別種の縮退のため isCrisisResponse は false。
  if (containsPromptInjectionSignal(freeText)) {
    return buildValidatedJsonResponse({
      matchedPurposeId: null,
      isAiEnabled: false,
      isCrisisResponse: false,
    });
  }

  // AI 機能停止中は LlmClient を一切呼ばず、非AI体験へ縮退する(TICKET-0035 AC-3/AC-4)。
  if (!isAiFeatureEnabled()) {
    return buildValidatedJsonResponse({
      matchedPurposeId: null,
      isAiEnabled: false,
      isCrisisResponse: false,
    });
  }

  const rateLimit = await consumeAiRateLimit(request);
  if (!rateLimit.allowed) return aiRateLimitedResponse(rateLimit.retryAfterSeconds);

  const options = PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage];
  // 定義上は空配列になり得ないが、念のための防御的な早期リターン。
  if (options.length === 0) {
    return buildValidatedJsonResponse({
      matchedPurposeId: null,
      isAiEnabled: false,
      isCrisisResponse: false,
    });
  }

  let matchedPurposeId: string | null;
  try {
    const llmClient = createLlmClient();
    const result = await llmClient.generate(buildPurposePickupPrompt(freeText, options), {
      systemInstruction: PURPOSE_PICKUP_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
    });
    const text = result.text;
    // 出力ガード(NFR-51)+ 選択肢実在チェックの2段構え。
    matchedPurposeId = violatesOutputGuard(text) ? null : parsePurposePickupOutput(text, options);
  } catch {
    // NFR-36: 例外詳細をログに出力しない。落とさず縮退する(recommend の個別施設エラー処理と同じ方針)。
    return buildValidatedJsonResponse({
      matchedPurposeId: null,
      isAiEnabled: false,
      isCrisisResponse: false,
    });
  }

  return buildValidatedJsonResponse({
    matchedPurposeId,
    isAiEnabled: true,
    isCrisisResponse: false,
  });
}
