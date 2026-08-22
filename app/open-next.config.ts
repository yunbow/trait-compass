// OpenNext の Cloudflare Workers 向けビルド設定。
// `opennextjs-cloudflare build` / `preview` / `deploy`(package.json の cf:* スクリプト)が読む。
//
// `defineCloudflareConfig()` を引数なしで呼ぶと公式デフォルト構成になる:
//   - wrapper: "cloudflare-node"(Node.js ランタイム上で Next.js サーバーを実行)
//   - converter: "edge" / proxyExternalRequest: "fetch"
//   - incrementalCache / tagCache / queue / cdnInvalidation はすべて "dummy"
// 本アプリはセルフチェック本体がブラウザ内完結で ISR/タグ再検証を使わないため(NFR-21)、
// R2 バックエンドのキャッシュ実装は導入せず dummy のままにしている。
// ISR や on-demand revalidation を使う画面が今後増えたら
// `@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache` 等への切り替えを検討する。
// 参考: https://opennext.js.org/cloudflare/caching
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
