import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site-url";

/**
 * `/api/*` はページではなく Route Handler(データ取得・送信用エンドポイント)のため、
 * 検索エンジンのクロール対象から除外する。個人の回答・相談メモ等が絡む画面
 * (/result 配下・/settings・/history・/support/results 等)はページ単体の
 * `metadata.robots`(noindex)で個別に制御し、ここでは crawl 自体を止めない
 * (Disallow と noindex meta を併用すると noindex meta 自体が読まれず、検索結果からの
 * 除外が遅れるため)。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
