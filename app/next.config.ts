import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // 開発時のみ MinIO(ローカル R2 代替)の画像を next/image で表示できるようにする。
    // 本番では R2_PUBLIC_URL(R2/カスタムドメイン)を使うため localhost は含めない。
    remotePatterns:
      process.env.NODE_ENV === "development"
        ? [{ protocol: "http", hostname: "localhost", port: "19000" }]
        : [],
  },
  async headers() {
    // クリックジャッキング対策を含むセキュリティヘッダー(NFR-38)。
    //
    // 地図表示(FR-02A、TICKET-0028)との両立について: MapView(src/features/support/components/
    // MapView.tsx)は Google Maps Platform(@vis.gl/react-google-maps)を使い、`https://maps.googleapis.com`
    // 等から script/img/connect を読み込む。CSPはGoogle公式の「Allowlist CSP」(nonce不要のドメイン
    // 許可リスト方式、https://developers.google.com/maps/documentation/javascript/content-security-policy)
    // に準拠する。公式の「Strict CSP」(nonceベース)は不採用: Next.js 16でProxyが常にNode.js
    // ランタイム必須になり `@opennextjs/cloudflare` が未対応のため本アプリはミドルウェア層を
    // 持たず(src/lib/beta-gate/require-unlock.ts 参照)、リクエスト単位のnonce発行・注入ができない。
    // R2/MinIOの画像配信先(NEXT_PUBLIC_ ではなくランタイムSecretのR2_PUBLIC_URL)は
    // ビルド時のnext.config.tsから値を参照できないため、img-src には `pub-*.r2.dev`
    // (既定のR2公開URL形式)を許可し、カスタムドメインに切り替えた場合はこのCSPも合わせて
    // 更新すること。ローカル開発はMinIO(localhost:19000)を使うため開発時のみ許可する。
    const isDev = process.env.NODE_ENV === "development";
    const cspDirectives = [
      "default-src 'self'",
      `img-src 'self' data: https://*.googleapis.com https://*.gstatic.com https://*.r2.dev${isDev ? " http://localhost:19000" : ""}`,
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com https://*.google.com blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.gstatic.com data: blob:",
      "frame-src https://*.google.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ];
    // また `Permissions-Policy: geolocation=(self)` により、自分自身のオリジン以外からの
    // Geolocation API 利用(iframe埋め込み等)をブラウザレベルで禁止している。自オリジンでの
    // 利用自体は禁止しない: 「現在地の利用」設定(src/features/history/services/settings.ts、
    // 既定オフ)をユーザーが明示的に有効化した場合のみ、useCurrentLocation フックが検索結果・
    // 地図表示時に1回限りの取得を行う(常時追跡はしない、NFR-33)。`geolocation=()`(空の許可
    // リスト)にすると自オリジンでの利用も含めて完全に禁止され、このオプトイン機能自体が
    // 動作しなくなるため、`(self)` を明記する。
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: `${cspDirectives.join("; ")};`,
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

// 開発時のみ Cloudflare バインディング(D1/R2/KV)へ getCloudflareContext() 経由でアクセス
// できるようにする公式パターン。本番ビルドには影響しない。
// 参考: https://opennext.js.org/cloudflare/bindings
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();
