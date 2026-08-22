import { getDb } from "@/lib/db";

// 固定ウィンドウ・レートリミッタのファクトリ。AI 原価防衛(TICKET-0035, `lib/ai/rate-limit.ts`)、
// 掲載情報の誤り報告スパム防止(TICKET-0064, `lib/reports/rate-limit.ts`)、クローズドベータの
// パスワード総当たり対策(`lib/beta-gate/rate-limit.ts`)の3箇所で共用する実装骨格(IP抽出→
// ハッシュ化キー生成→D1カウント→閾値判定)を一本化したもの。テーブル名・ウィンドウ秒数・
// 上限リクエスト数は呼び出し側が config で注入し、テーブル分離と閾値差はそのまま維持する。
// IP は平文保存せず(NFR-31〜33)、ウィンドウごとに変わるハッシュのみ保存する。
//
// IP不明時・D1障害時の既定動作はフェイルオープン(allowed: true)。外周 WAF・AI Gateway
// 支出上限があること、および D1 未設定のローカル開発で常時 503 にしないための選択。
// ただし `failClosed: true` を指定した場合はフェイルクローズ(allowed: false)にする
// (セキュリティレビュー指摘: パスワード等の認証ゲートを守るレート制限は、D1障害時に
// 無制限の試行を許してしまうと本末転倒なため。beta_gate_rate_limits で使用する)。

export interface FixedWindowRateLimiterConfig {
  // SQL に直接埋め込むため、呼び出し側から任意文字列を渡せないようリテラルunionで縛る。
  tableName: "ai_rate_limits" | "report_rate_limits" | "beta_gate_rate_limits" | "track_rate_limits" | "feedback_rate_limits";
  windowSeconds: number;
  maxRequests: number;
  /** IP不明・D1障害時にフェイルクローズ(拒否)するか。既定 false(フェイルオープン)。 */
  failClosed?: boolean;
}

export interface FixedWindowRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function resolveWindowStart(nowMs: number, windowSeconds: number): number {
  const nowSeconds = Math.floor(nowMs / 1000);
  return nowSeconds - (nowSeconds % windowSeconds);
}

export function isOverLimit(count: number, max: number): boolean {
  return count > max;
}

export function readClientIp(request: Request): string | null {
  // x-forwarded-for はクライアントから詐称でき、レート制限を無効化されるため絶対に使わない。
  const ip = request.headers.get("cf-connecting-ip");
  return ip === null || ip === "" ? null : ip;
}

export async function buildClientKey(ip: string, windowStart: number, salt = ""): Promise<string> {
  const encoded = new TextEncoder().encode(`${ip}:${windowStart}:${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createFixedWindowRateLimiter(config: FixedWindowRateLimiterConfig): {
  consume(request: Request, nowMs?: number): Promise<FixedWindowRateLimitResult>;
} {
  const { tableName, windowSeconds, maxRequests, failClosed = false } = config;
  const failureResult: FixedWindowRateLimitResult = failClosed
    ? { allowed: false, retryAfterSeconds: windowSeconds }
    : { allowed: true, retryAfterSeconds: 0 };

  async function consume(request: Request, nowMs = Date.now()): Promise<FixedWindowRateLimitResult> {
    const ip = readClientIp(request);
    if (ip === null) return failureResult;

    const windowStart = resolveWindowStart(nowMs, windowSeconds);
    try {
      const db = getDb();
      const clientKey = await buildClientKey(ip, windowStart, process.env.RATE_LIMIT_SALT ?? "");
      const batchResults = await db.batch<{ count: number }>([
        db.prepare(`DELETE FROM ${tableName} WHERE window_start < ?`).bind(windowStart),
        db.prepare(
          `INSERT INTO ${tableName} (client_key, window_start, count) VALUES (?, ?, 1)
           ON CONFLICT(client_key, window_start) DO UPDATE SET count = count + 1`,
        ).bind(clientKey, windowStart),
        db.prepare(`SELECT count FROM ${tableName} WHERE client_key = ? AND window_start = ?`)
          .bind(clientKey, windowStart),
      ]);
      const rawCount = batchResults[2]?.results?.[0]?.count;
      const count = typeof rawCount === "number" ? rawCount : 0;
      if (!isOverLimit(count, maxRequests)) return { allowed: true, retryAfterSeconds: 0 };
      const retryAfterSeconds = Math.max(
        1, windowStart + windowSeconds - Math.floor(nowMs / 1000),
      );
      return { allowed: false, retryAfterSeconds };
    } catch {
      // NFR-36: 例外詳細をログに出力しない。
      return failureResult;
    }
  }

  return { consume };
}
