# Trait Compass — 発達特性と困りごとを整理し、支援への道しるべに

[![CI](https://github.com/yunbow/trait-compass/actions/workflows/ci.yml/badge.svg)](https://github.com/yunbow/trait-compass/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

発達特性(ADHD 傾向・ASD 傾向・感覚過敏など)と日常の困りごとを整理し、支援情報につなげる、ブラウザ完結型のセルフチェックアプリです。セルフチェックの回答・スコアリング・結果表示はすべてブラウザ内で完結し、サーバーには送信されません(詳細は後述「[プライバシーへの配慮](#プライバシーへの配慮)」)。本アプリは医学的な診断・判定を行うものではなく、あくまで自己理解と支援先探しのための目安を提供します。

支援情報には東京都・区市町村のオープンデータを活用しており、[東京都知事杯オープンデータ・ハッカソン 2026](https://odhackathon.metro.tokyo.lg.jp/) への応募作品として開発しています。開発チーム: [CivicUnknot](https://yunbow.github.io/civic-unknot/)。

## Trait Compass が解決すること

「困っているけれど、どこに相談すればよいのかわからない」——本アプリは、この状態から次の3ステップをひとつの流れでつなぎます。

1. **困りごとの整理**: セルフチェックで、自分の特性・困りごとの傾向をレーダーチャート等で見える化する
2. **支援制度・相談窓口の発見**: 年齢・地域・目的に合った、東京都内の相談窓口・支援制度・学校情報を探す
3. **相談の準備**: 窓口に相談するときに伝えたい内容を整理した「相談準備メモ」を作る

セルフチェックはあくまで入口であり、本質は行政・支援情報への橋渡しです。しくみの全体像は[docs/designs/technical-overview.md](./docs/designs/technical-overview.md)(非エンジニア向け)、セルフチェックの設計根拠(設問・スコア計算・しきい値の考え方)は[docs/designs/self-check-methodology.md](./docs/designs/self-check-methodology.md)を参照してください。

## オープンデータの活用

支援窓口・学校情報などは、東京都オープンデータカタログ等の公開データと、各自治体の公式ページをもとにしています。データはライセンス区分の監査を経て取得し、原本を保存したうえで正規化してデータベース(Cloudflare D1)へ投入します。パイプラインの詳細は[docs/designs/data-pipelines-for-engineers.md](./docs/designs/data-pipelines-for-engineers.md)、データの出所・鮮度管理・利用者からの訂正報告のしくみは[docs/designs/data-governance.md](./docs/designs/data-governance.md)を参照してください。

## AIの使いどころ・使わないところ

AI(生成AI)は「結果のやさしい解説」「困りごとの整理」「合いそうな支援先の理由の説明」など、**利用者が明示的に選んだ場合のみ**動く補助機能に限定しています。一方で、AIに判断を丸投げしない設計を徹底しています。

- 施設名・住所・連絡先などの**事実情報は常にD1(データベース)由来の値のみ**を表示し、AIの生成テキストで事実情報を上書きする経路は存在しません(fact-guard 方針)。
- 施設・学校についての質問への回答は、D1の事実情報から**決定的に**組み立て、LLMを使いません。RAG(検索拡張生成)でも、ベクトル検索で得たIDをD1へ引き直して事実情報を再取得し、LLMが生成するのは「合いそうな理由」の短文だけです。
- 深刻な危機を示すシグナルを検知した場合は、**AIを一切使わず**、定型の案内を表示します。

詳細は[docs/designs/architecture-for-engineers.md](./docs/designs/architecture-for-engineers.md) §5 を参照してください。

## プライバシーへの配慮

- **セルフチェックの回答・スコアはブラウザ内で処理し、サーバーには送信しません。** 結果の共有URL(`#r=...`)もサーバーに送られない形式(URLフラグメント)です。
- **通常閲覧時には、個人を識別しない画面到達数の集計通信が発生します**(下記「利用計測について」)。
- **支援情報検索やAI機能を利用した場合は、その機能に必要な情報のみサーバーへ送信します。** AI機能は送信前に「何を送るか・送らないか」を画面上で確認したうえで利用します(回答そのもの・スコアの数値は送信されません)。
- **不正送信防止のレート制限では生のIPアドレスを保存せず**、時間窓ごとに変化するSHA-256ハッシュ(IP + 時間窓 + サーバー側シークレットのソルト)のみを一時的に保存します。

### 利用計測について(プライバシー配慮のアナリティクス)

本アプリは、Cookie不使用・個人特定不可能な形で、画面到達数のみを計測しています。
Cloudflare Web Analytics・Counterscale・Plausible 等の外部アナリティクスSaaSは使用せず、
ファーストパーティの Cloudflare D1 集計カウンタ(`POST /api/track` → `usage_counts` テーブル)
として自前で実装しています。

- **計測している内容**: トップ / アンケート / 結果(および結果配下の要約・提案・準備メモ)/
  支援情報検索の各画面について、それぞれの画面が「表示された(到達した)」という事実のみ。
  ブラウザの `navigator.doNotTrack` が有効な場合は送信されません。
- **計測していない内容**: セルフチェックの回答・スコア・自由記述・年齢・地域・共有URL
  (`#r=...`)の内容・IPアドレス・User-Agent・個人を識別しうるあらゆる情報は、計測エンドポイントに
  一切送信されません(送信できるのは定義済みの画面名のいずれか1つだけで、それ以外の値を受け付けない
  型・検証(zod)になっています)。
- **保存単位**: 「日付 × 画面」ごとの到達回数の合計値のみを D1 に保存します。個々のアクセス
  ログ(いつ・誰が・何回)は保持しません。

## AI・RAGの品質評価

「AIを使っている」だけでなく、**AIをどこまで信用してよいかを測るしくみ**を実装しています。検索精度(Precision@K / Recall@K / MRR)・生成品質(事実情報の捏造検知)・安全性(診断表現の排除・危機表現テストケースに対する見逃しゼロゲート)の3レイヤーを、ゴールデンデータとCIで継続評価し、任意でLLM-as-judge(第4レイヤー)も実行できます。詳細は[app/eval/README.md](./app/eval/README.md)を参照してください。

## 技術構成・フォルダ構成

本プロジェクトは、ユーザー向けの**アプリ本体**(`app/`: Next.js を OpenNext で Cloudflare Workers 上で実行)と、支援情報データを取り込む**バッチ処理**(`batch/`)の2つの npm workspace、および `docs/`・`data/` に大きく分かれています。

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

## クイックスタート

依存関係のインストールはリポジトリルートで一度だけ行い、各コマンドは `-w app`(アプリ)/
`-w batch`(バッチ)でワークスペースを指定して実行します。

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

## ドキュメント

- しくみの説明(非エンジニア向け): [docs/designs/technical-overview.md](./docs/designs/technical-overview.md)
- セルフチェックの設計根拠: [docs/designs/self-check-methodology.md](./docs/designs/self-check-methodology.md)
- セルフチェック設問の参考資料一覧(カテゴリ単位): [docs/designs/self-check-sources.md](./docs/designs/self-check-sources.md)
- アーキテクチャ概要(エンジニア向け): [docs/designs/architecture-for-engineers.md](./docs/designs/architecture-for-engineers.md)
- データ取込パイプライン(エンジニア向け): [docs/designs/data-pipelines-for-engineers.md](./docs/designs/data-pipelines-for-engineers.md)
- データガバナンス(出所・鮮度・訂正報告のしくみ): [docs/designs/data-governance.md](./docs/designs/data-governance.md)
- 運用ポリシー(体制・監視頻度・引き継ぎ方針): [docs/designs/operations-policy.md](./docs/designs/operations-policy.md)
- DB全体像(まず読む1枚): [docs/designs/db-overview.md](./docs/designs/db-overview.md)
- DBテーブル定義(全カラムのリファレンス): [docs/designs/db-tables.md](./docs/designs/db-tables.md)
- AI・RAGの品質評価(検索精度・生成品質・安全性): [app/eval/README.md](./app/eval/README.md)
- ローカル環境構築手順: [docs/usage/local-setup.md](./docs/usage/local-setup.md)
- 地図表示(Google Maps API)の設定手順: [docs/usage/google-maps-api-setup.md](./docs/usage/google-maps-api-setup.md)
- ライセンス: [LICENSE](./LICENSE)(MIT)

このリポジトリは、実際に運用しているアプリのソースコードを公開したものです。区市町村ごとの
個別調査データ(住所・電話番号などの実データ)や、Cloudflare の本番デプロイ設定は含まれていません。
