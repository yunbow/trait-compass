import {
  buildClientKey as sharedBuildClientKey,
  createFixedWindowRateLimiter,
  isOverLimit as sharedIsOverLimit,
  readClientIp as sharedReadClientIp,
  resolveWindowStart as sharedResolveWindowStart,
} from "@/lib/rate-limit/fixed-window";

// TICKET-0035 AC-1。WAF レートリミットルール(外周、IP 単位 60 req/分、ダッシュボード設定)と
// この Worker 内カウンタ(最終防衛線、IP 単位 10 req/600 秒)の二層構成とする。設定手順は
// docs/usage/cloudflare-setup.md §3.3 を参照する。5 本の AI API で共有する 1 本のクォータとし、
// エンドポイント切替による上限回避を防ぐ。固定ウィンドウカウンタの実装本体(IP抽出・ハッシュ化・
// D1カウント・fail-open方針)は `lib/rate-limit/fixed-window.ts` のファクトリに委譲する。
// ここでは ai_rate_limits テーブル・閾値(10 req/600秒)を注入するのみ。

export const AI_RATE_LIMIT_WINDOW_SECONDS = 600;
export const AI_RATE_LIMIT_MAX_REQUESTS = 10;

export interface AiRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function resolveWindowStart(nowMs: number, windowSeconds = AI_RATE_LIMIT_WINDOW_SECONDS): number {
  return sharedResolveWindowStart(nowMs, windowSeconds);
}

export function isOverLimit(count: number, max = AI_RATE_LIMIT_MAX_REQUESTS): boolean {
  return sharedIsOverLimit(count, max);
}

export const readClientIp = sharedReadClientIp;

export const buildClientKey = sharedBuildClientKey;

const rateLimiter = createFixedWindowRateLimiter({
  tableName: "ai_rate_limits",
  windowSeconds: AI_RATE_LIMIT_WINDOW_SECONDS,
  maxRequests: AI_RATE_LIMIT_MAX_REQUESTS,
});

export async function consumeAiRateLimit(
  request: Request,
  nowMs = Date.now(),
): Promise<AiRateLimitResult> {
  return rateLimiter.consume(request, nowMs);
}
