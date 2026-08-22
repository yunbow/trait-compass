import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

// D1(支援窓口・データセットメタ)への接続ヘルパー。
// `next dev`(initOpenNextCloudflareForDev 経由のローカル SQLite)・本番(Cloudflare Workers)の
// 両方で同一コードパス(`getCloudflareContext().env.DB`)を使う。

/**
 * D1 バインディング(`env.DB`)を取得する。
 *
 * Route Handler / Server Component / Server Action など、リクエストに紐づく
 * 同期コンテキスト内から呼び出すことを想定する(`getCloudflareContext()` の既定動作)。
 *
 * @throws バインディングが未設定の場合(`wrangler.toml` の `[[d1_databases]]` 未設定、
 *         または `initOpenNextCloudflareForDev()` 未実行のローカル環境)。
 */
export function getDb(): D1Database {
  const { env } = getCloudflareContext();
  if (!env.DB) {
    throw new Error(
      "D1 binding 'DB' is not configured. Check wrangler.toml [[d1_databases]] and " +
        "(local dev) that initOpenNextCloudflareForDev() has run.",
    );
  }
  return env.DB;
}
