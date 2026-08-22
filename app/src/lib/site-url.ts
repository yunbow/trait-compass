/**
 * TICKET-0031: サイトの本番 URL。robots.ts/sitemap.ts/layout.tsx の metadataBase など、
 * 絶対 URL 化が必要な箇所で共通利用する。本番ドメインが未確定の間(TICKET-0003 AC-6の
 * 実 Cloudflare デプロイ未実施の間)は `NEXT_PUBLIC_SITE_URL` が未設定でもビルド・実行が
 * 破綻しないよう、プレースホルダへフォールバックする。実デプロイでドメインが確定した際は
 * `NEXT_PUBLIC_SITE_URL`(wrangler.toml の [vars] 等)を設定すること。
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trait-compass.example.com";
