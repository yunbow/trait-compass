import {
  buildClientKey as sharedBuildClientKey,
  createFixedWindowRateLimiter,
  isOverLimit as sharedIsOverLimit,
  readClientIp as sharedReadClientIp,
  resolveWindowStart as sharedResolveWindowStart,
} from "@/lib/rate-limit/fixed-window";

// クローズドベータのパスワードゲート(/api/beta-gate)専用のレート制限。`lib/ai/rate-limit.ts`・
// `lib/reports/rate-limit.ts` とは意図的に別モジュール・別テーブル(beta_gate_rate_limits)にする。
// このエンドポイントはパスワード総当たりの対象になり得るため、他の2つ(IP単位 10/5 req/600秒)
// より厳しい IP単位 5 req/600秒とする。固定ウィンドウカウンタの実装本体(IP抽出・ハッシュ化・
// D1カウント)は `lib/rate-limit/fixed-window.ts` のファクトリに委譲する。
//
// `failClosed: true`(セキュリティレビュー指摘): AI/報告用の2つと異なり、ここは
// パスワード認証ゲートそのものを守るレート制限のため、IP不明・D1障害時にフェイルオープン
// (無制限許可)してしまうと本末転倒になる。D1障害時は 503 相当としてパスワード判定自体を
// 行わず拒否する(route.ts 側で /beta-gate?error=1 へのリダイレクトに統一)。

export const BETA_GATE_RATE_LIMIT_WINDOW_SECONDS = 600;
export const BETA_GATE_RATE_LIMIT_MAX_REQUESTS = 5;

export interface BetaGateRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function resolveBetaGateWindowStart(
  nowMs: number,
  windowSeconds = BETA_GATE_RATE_LIMIT_WINDOW_SECONDS,
): number {
  return sharedResolveWindowStart(nowMs, windowSeconds);
}

export function isBetaGateOverLimit(count: number, max = BETA_GATE_RATE_LIMIT_MAX_REQUESTS): boolean {
  return sharedIsOverLimit(count, max);
}

export const readBetaGateClientIp = sharedReadClientIp;

export const buildBetaGateClientKey = sharedBuildClientKey;

const rateLimiter = createFixedWindowRateLimiter({
  tableName: "beta_gate_rate_limits",
  windowSeconds: BETA_GATE_RATE_LIMIT_WINDOW_SECONDS,
  maxRequests: BETA_GATE_RATE_LIMIT_MAX_REQUESTS,
  failClosed: true,
});

export async function consumeBetaGateRateLimit(
  request: Request,
  nowMs = Date.now(),
): Promise<BetaGateRateLimitResult> {
  const result = await rateLimiter.consume(request, nowMs);
  if (result.allowed) return { allowed: true };
  return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
}
