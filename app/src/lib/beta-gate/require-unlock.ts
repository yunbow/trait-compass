import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BETA_GATE_COOKIE_NAME } from "@/lib/beta-gate";
import { verifyBetaGateSessionToken } from "@/lib/beta-gate/session-token";

/**
 * クローズドベータ用のパスワードゲート(トップ画面 `/` のみ、TICKET番号なし・臨時対応)。
 * `CLOSED_BETA_PASSWORD` が設定されている間だけ有効になり、未設定の通常運用では
 * 一切分岐せずそのまま通す(メンテナンスモードパターンに倣う)。対象ページの Server Component から呼び出す。
 *
 * 従来は `src/proxy.ts`(Next.js Proxy)で判定していたが、Next.js 16 で Proxy が常に
 * Node.js ランタイムで実行される仕様になり、`@opennextjs/cloudflare` が Edge Middleware
 * 形式にしか対応していない(2026-08-07時点の最新1.20.2でも)ため `cf:build` が
 * "Node.js middleware is not currently supported" で失敗するようになった。Proxy を
 * 使わず、対象ページの Server Component から直接呼び出す方式に変更している
 * (`src/proxy.ts` は今後追加しないこと)。
 */
export async function requireBetaGateUnlocked(): Promise<void> {
  const password = process.env.CLOSED_BETA_PASSWORD;
  if (!password) {
    return;
  }

  const token = (await cookies()).get(BETA_GATE_COOKIE_NAME)?.value;
  const isUnlocked = await verifyBetaGateSessionToken(token, password);
  if (isUnlocked) {
    return;
  }

  redirect("/beta-gate");
}
