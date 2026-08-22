# Trait Compass — 発達特性と困りごとを整理し、支援への道しるべに

発達特性(ADHD 傾向・ASD 傾向・感覚過敏など)と日常の困りごとを整理し、支援情報につなげる、ブラウザ完結型のセルフチェックアプリです。回答・スコアリング・結果表示はすべてブラウザ内で完結し、サーバーが必要なのは支援情報検索や AI 機能などの明示的にオプトインした機能のみです。本アプリは医学的な診断・判定を行うものではなく、あくまで自己理解と支援先探しのための目安を提供します。

支援情報には東京都・区市町村のオープンデータを活用しており、[東京都知事杯オープンデータ・ハッカソン 2026](https://odhackathon.metro.tokyo.lg.jp/) への応募作品として開発しています。開発チーム: [CivicUnknot](https://yunbow.github.io/civic-unknot/)。

- アプリのしくみを非エンジニア向けに説明したページ: [docs/designs/technical-overview.md](./docs/designs/technical-overview.md)
- コードベースの構成をエンジニア向けに説明したページ: [docs/designs/architecture-for-engineers.md](./docs/designs/architecture-for-engineers.md)、[docs/designs/data-pipelines-for-engineers.md](./docs/designs/data-pipelines-for-engineers.md)

## クイックスタート

本プロジェクトは npm workspaces によるモノレポ構成です。依存関係のインストールは
リポジトリルートで一度だけ行い、各コマンドは `-w app`(アプリ)/`-w batch`(バッチ)で
ワークスペースを指定して実行します。

```bash
npm install                             # リポジトリルートで一度だけ(workspaces 全体の依存解決)
cp app/wrangler.toml.example app/wrangler.toml
cp batch/wrangler.ingest.toml.example batch/wrangler.ingest.toml
cp app/.env.example app/.env
docker compose up -d                    # R2 代替の MinIO 等を起動
npm run db:reset:local -w app           # app/db/schema.sql + app/db/seed/ 配下の手動シードをローカル D1 に投入
npm run dev -w app                      # http://localhost:3000
```

詳細な手順(検証方法・テスト実行・取込 Worker のローカル実行・トラブルシューティング等)は
[docs/usage/local-setup.md](./docs/usage/local-setup.md) を参照してください。

## フォルダ構成

本プロジェクトは、ユーザー向けの**アプリ本体**(`app/`)と、支援情報データを取り込む
**バッチ処理**(`batch/`)の2つの npm workspace、および `docs/`・`data/` に大きく分かれています。

```
app/                … アプリ本体(Next.js)。設定ファイル一式・UI・API ルート・
                       ビジネスロジックに加え、E2E テスト(app/e2e/)・AI 機能の評価ツール
                       (app/eval/)・D1 スキーマ(app/db/)を含む
batch/               … バッチ処理。設定ファイル一式に加え、
  batch/ingest/      … オープンデータ(CKAN)取り込み用の Cloudflare Worker
  batch/scripts/     … データ取得・投入スクリプト(手動実行)
docs/                … ドキュメント
data/                … 手動収集データ・オープンデータソース定義
```

`batch/ingest/` は `app/src/lib/ai/embedder.ts`・`app/src/lib/ai/vector-store.ts`・
`app/src/features/data-ingest/` など、アプリ側のコードの一部を相対パスで再利用しています。

`app/wrangler.toml`・`batch/wrangler.ingest.toml`(Cloudflare の実デプロイ設定)は、
各自の Cloudflare アカウント固有の識別子を含むためこのリポジトリでは管理していません。
同名の `.example` ファイルをコピーして使ってください([クイックスタート](#クイックスタート)参照)。

## 利用計測について(プライバシー配慮のアナリティクス)

本アプリは、Cookie不使用・個人特定不可能な形で、画面到達数のみを計測しています。
Cloudflare Web Analytics・Counterscale・Plausible 等の外部アナリティクスSaaSは使用せず、
ファーストパーティの Cloudflare D1 集計カウンタ(`POST /api/track` → `usage_counts` テーブル)
として自前で実装しています。

- **計測している内容**: トップ / アンケート / 結果 / 支援情報検索の4画面について、それぞれの
  画面が「表示された(到達した)」という事実のみ。ブラウザの `navigator.doNotTrack` が有効な
  場合は送信されません。
- **計測していない内容**: セルフチェックの回答・スコア・自由記述・年齢・地域・共有URL
  (`#r=...`)の内容・IPアドレス・User-Agent・個人を識別しうるあらゆる情報は、計測エンドポイントに
  一切送信されません(送信できるのは4つの画面名のいずれか1つだけで、それ以外の値を受け付けない
  型・検証(zod)になっています)。
- **保存単位**: 「日付 × 画面」ごとの到達回数の合計値のみを D1 に保存します。個々のアクセス
  ログ(いつ・誰が・何回)は保持しません。

## ドキュメント

- しくみの説明(非エンジニア向け): [docs/designs/technical-overview.md](./docs/designs/technical-overview.md)
- アーキテクチャ概要(エンジニア向け): [docs/designs/architecture-for-engineers.md](./docs/designs/architecture-for-engineers.md)
- データ取込パイプライン(エンジニア向け): [docs/designs/data-pipelines-for-engineers.md](./docs/designs/data-pipelines-for-engineers.md)
- ローカル環境構築手順: [docs/usage/local-setup.md](./docs/usage/local-setup.md)
- 地図表示(Google Maps API)の設定手順: [docs/usage/google-maps-api-setup.md](./docs/usage/google-maps-api-setup.md)
- ライセンス: [LICENSE](./LICENSE)(MIT)

このリポジトリは、実際に運用しているアプリのソースコードを公開したものです。区市町村ごとの
個別調査データ(住所・電話番号などの実データ)や、Cloudflare の本番デプロイ設定は含まれていません。
