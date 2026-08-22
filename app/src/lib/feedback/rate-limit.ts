import {
  buildClientKey as sharedBuildClientKey,
  createFixedWindowRateLimiter,
  isOverLimit as sharedIsOverLimit,
  readClientIp as sharedReadClientIp,
  resolveWindowStart as sharedResolveWindowStart,
} from "@/lib/rate-limit/fixed-window";

// 支援先一覧「このページで、次に何をすればよいか分かりましたか?」フィードバック専用の
// レート制限。`lib/reports/rate-limit.ts`(掲載情報の誤り報告、TICKET-0064)・
// `lib/ai/rate-limit.ts`(AI原価防衛)・`lib/track/rate-limit.ts`(利用計測)とは意図的に
// 別モジュール・別テーブル(feedback_rate_limits)にする。フィードバックは LLM 呼び出しを
// 伴わず、3択評価・内訳は集計カウンタへの UPSERT のみで報告(自由記述の永続化)より
// スパムの実害が小さいため、report版(IP単位 5 req/600秒)より緩い IP単位 10 req/600秒とする。
// 固定ウィンドウカウンタの実装本体(IP抽出・ハッシュ化・D1カウント・fail-open方針)は
// `lib/rate-limit/fixed-window.ts` のファクトリに委譲する(cf-connecting-ip のみを使う、
// SHA-256(ip:windowStart:salt) で平文保存しない、D1 障害時はフェイルオープンして送信を
// ブロックしない、NFR-36 により例外詳細はログに出さない、は他版と同じ)。

export const FEEDBACK_RATE_LIMIT_WINDOW_SECONDS = 600;
export const FEEDBACK_RATE_LIMIT_MAX_REQUESTS = 10;

export interface FeedbackRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function resolveFeedbackWindowStart(nowMs: number, windowSeconds = FEEDBACK_RATE_LIMIT_WINDOW_SECONDS): number {
  return sharedResolveWindowStart(nowMs, windowSeconds);
}

export function isFeedbackOverLimit(count: number, max = FEEDBACK_RATE_LIMIT_MAX_REQUESTS): boolean {
  return sharedIsOverLimit(count, max);
}

export const readFeedbackClientIp = sharedReadClientIp;

export const buildFeedbackClientKey = sharedBuildClientKey;

const rateLimiter = createFixedWindowRateLimiter({
  tableName: "feedback_rate_limits",
  windowSeconds: FEEDBACK_RATE_LIMIT_WINDOW_SECONDS,
  maxRequests: FEEDBACK_RATE_LIMIT_MAX_REQUESTS,
});

export async function consumeFeedbackRateLimit(
  request: Request,
  nowMs = Date.now(),
): Promise<FeedbackRateLimitResult> {
  const result = await rateLimiter.consume(request, nowMs);
  if (result.allowed) return { allowed: true };
  return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
}
