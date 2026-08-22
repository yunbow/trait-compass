import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";

/**
 * 検索エンジンに見つけてほしい静的ページのみを列挙する。以下は意図的に含めない:
 * - 個人の回答・相談メモ・設定等が絡む画面(/survey 配下の進行状態は含まないが、
 *   /result 配下・/settings・/history・/support/purpose・/support/results・
 *   /support/*-report)は各ページの `metadata.robots`(noindex)で制御する
 * - `/beta-gate`(認証ゲート)
 * - `/coverage`(通常の画面構成外・ハッカソンデモ用の直接アクセス専用ページ)
 */
const STATIC_ROUTES = [
  { path: "/", priority: 1 },
  { path: "/survey", priority: 0.8 },
  { path: "/support", priority: 0.8 },
  { path: "/guide", priority: 0.6 },
  { path: "/help", priority: 0.6 },
  { path: "/about", priority: 0.5 },
  { path: "/procedures-guide", priority: 0.5 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return STATIC_ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    priority,
  }));
}
