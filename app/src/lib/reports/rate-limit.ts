import {
  buildClientKey as sharedBuildClientKey,
  createFixedWindowRateLimiter,
  isOverLimit as sharedIsOverLimit,
  readClientIp as sharedReadClientIp,
  resolveWindowStart as sharedResolveWindowStart,
} from "@/lib/rate-limit/fixed-window";

// 掲載情報の誤り報告(TICKET-0064)専用のレート制限。`src/lib/ai/rate-limit.ts`(AI原価防衛、
// TICKET-0035)とは意図的に別モジュール・別テーブル(report_rate_limits)にする。報告は
// LLM 呼び出しを伴わずコストは小さいが、1件あたり安価なぶんスパム投稿の閾値は低く抑える必要が
// あるため、AI エンドポイント(IP単位 10 req/600秒)より厳しい IP単位 5 req/600秒とし、
// AI 利用枠と競合しないようにする。固定ウィンドウカウンタの実装本体(IP抽出・ハッシュ化・
// D1カウント・fail-open方針)は `lib/rate-limit/fixed-window.ts` のファクトリに委譲する
// (cf-connecting-ip のみを使う、SHA-256(ip:windowStart:salt) で平文保存しない、D1 障害時は
// フェイルオープンして送信をブロックしない、NFR-36 により例外詳細はログに出さない、は AI 版と同じ)。

export const REPORT_RATE_LIMIT_WINDOW_SECONDS = 600;
export const REPORT_RATE_LIMIT_MAX_REQUESTS = 5;

export interface ReportRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function resolveReportWindowStart(nowMs: number, windowSeconds = REPORT_RATE_LIMIT_WINDOW_SECONDS): number {
  return sharedResolveWindowStart(nowMs, windowSeconds);
}

export function isReportOverLimit(count: number, max = REPORT_RATE_LIMIT_MAX_REQUESTS): boolean {
  return sharedIsOverLimit(count, max);
}

export const readReportClientIp = sharedReadClientIp;

export const buildReportClientKey = sharedBuildClientKey;

const rateLimiter = createFixedWindowRateLimiter({
  tableName: "report_rate_limits",
  windowSeconds: REPORT_RATE_LIMIT_WINDOW_SECONDS,
  maxRequests: REPORT_RATE_LIMIT_MAX_REQUESTS,
});

export async function consumeReportRateLimit(
  request: Request,
  nowMs = Date.now(),
): Promise<ReportRateLimitResult> {
  const result = await rateLimiter.consume(request, nowMs);
  if (result.allowed) return { allowed: true };
  return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
}
