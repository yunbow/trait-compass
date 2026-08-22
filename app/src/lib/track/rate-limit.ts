import { createFixedWindowRateLimiter } from "@/lib/rate-limit/fixed-window";

// 利用計測(POST /api/track、TICKET-0034)専用のレート制限(セキュリティレビュー指摘対応)。
// `lib/ai/rate-limit.ts`・`lib/reports/rate-limit.ts`・`lib/beta-gate/rate-limit.ts` とは
// 意図的に別モジュール・別テーブル(track_rate_limits)にする。このエンドポイントはコスト・
// 認証の防衛ではなく、連続POSTによる usage_counts 汚染(集計値の水増し)の防止が目的のため、
// 他の3つ(IP単位 5〜10 req/600秒)より緩い IP単位 30 req/600秒とする(正規利用は1セッションで
// TRACKABLE_SCREENS 7画面程度の到達、複数回のページ遷移・戻る操作を考慮しても十分な余裕を持たせる)。
// 固定ウィンドウカウンタの実装本体は `lib/rate-limit/fixed-window.ts` のファクトリに委譲する。

export const TRACK_RATE_LIMIT_WINDOW_SECONDS = 600;
export const TRACK_RATE_LIMIT_MAX_REQUESTS = 30;

export interface TrackRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

const rateLimiter = createFixedWindowRateLimiter({
  tableName: "track_rate_limits",
  windowSeconds: TRACK_RATE_LIMIT_WINDOW_SECONDS,
  maxRequests: TRACK_RATE_LIMIT_MAX_REQUESTS,
});

export async function consumeTrackRateLimit(
  request: Request,
  nowMs = Date.now(),
): Promise<TrackRateLimitResult> {
  const result = await rateLimiter.consume(request, nowMs);
  if (result.allowed) return { allowed: true };
  return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
}
