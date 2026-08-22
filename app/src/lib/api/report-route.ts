import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

import { apiErrorResponse, getDbOrErrorResponse, parseSimpleJsonBody, type ApiErrorBody } from "@/lib/api/route-helpers";
import { getDb } from "@/lib/db";
import { consumeReportRateLimit } from "@/lib/reports/rate-limit";

// report-and-track-route-preflight (Phase 2-2): facility-report/content-report の2ルートで
// 完全一致していた「parseSimpleJsonBody → ハニーポット → consumeReportRateLimit → getDb」の
// 前処理を統合する。track/ask/recommend/prepare はこのモジュールの対象外
// (docs/logic-consolidation/report-and-track-route-preflight.md 参照)。

export type ReportPreflight<T> =
  | { proceed: true; data: T; db: ReturnType<typeof getDb> }
  /** ハニーポット命中の偽200・400/403/413/429/502 のいずれか。呼び出し側はそのまま return する。 */
  | { proceed: false; response: Response };

/**
 * 報告系POSTルート(facility-report/content-report)の共通前処理。
 *
 * `parseSimpleJsonBody` → ハニーポット(`website` 非空 → 偽の200 `{ok:true}`) →
 * `consumeReportRateLimit`(429 `{error:"rate limited", retryAfterSeconds}`) →
 * `getDbOrErrorResponse`(502)の順序で評価する。この順序は変えない(ハニーポット判定が
 * レート制限より先 = ボット判定リクエストはレート制限枠を消費しない)。
 */
export async function preflightReportSubmission<T extends { website?: string }>(
  request: NextRequest,
  schema: z.ZodType<T>,
  options: { dbErrorMessage: string },
): Promise<ReportPreflight<T>> {
  const parsed = await parseSimpleJsonBody(request, schema);
  if (!parsed.ok) {
    return { proceed: false, response: parsed.response };
  }

  // ハニーポット: 非空ならbotとみなし、保存せず偽の成功を返す(挙動を学習させない)。
  if (parsed.data.website !== undefined && parsed.data.website.length > 0) {
    return { proceed: false, response: NextResponse.json({ ok: true }, { status: 200 }) };
  }

  const rateLimit = await consumeReportRateLimit(request);
  if (!rateLimit.allowed) {
    return {
      proceed: false,
      response: NextResponse.json(
        { error: "rate limited", retryAfterSeconds: rateLimit.retryAfterSeconds },
        { status: 429 },
      ),
    };
  }

  const dbResult = getDbOrErrorResponse(options.dbErrorMessage);
  if (!dbResult.ok) {
    return { proceed: false, response: dbResult.response };
  }

  return { proceed: true, data: parsed.data, db: dbResult.db };
}

/** INSERT 失敗時の共通応答(NFR-36: 例外詳細を出さない 500)。両ファイルで文言が完全一致する。 */
export function reportInsertFailureResponse(): NextResponse<ApiErrorBody> {
  return apiErrorResponse("INTERNAL_ERROR", "送信できませんでした。しばらくしてから再度お試しください。", 500);
}
