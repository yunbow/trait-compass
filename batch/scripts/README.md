# scripts/data/

`data/`(手動調査データ・オープンデータ原本・変換成果物)を扱うスクリプト群。既存の `scripts/`(`build-questions.mjs` 等)と同じルート直下フォルダ内に、目的別のサブフォルダとして置く。

## 実装済みのスクリプト

| スクリプト | 役割 | 実行方法 |
|---|---|---|
| [`ingest-manual-survey.mjs`](./ingest-manual-survey.mjs) | `data/manual/municipalities/*.yaml` をD1へ投入する(学校系データは `schools` 系7テーブルへ、`programs` は `facilities`/`datasets` へ変換。自治体単位でDELETE→INSERTする冪等な設計)。 | `node scripts/data/ingest-manual-survey.mjs <yamlファイル> [--local\|--remote]` |
| [`fetch-open-data.mjs`](./fetch-open-data.mjs) | `data/open-data/sources.yaml` に列挙した一次情報を取得し `data/open-data/<source-id>/` へ保存する(`fetch: skip` の source はネットワークアクセスせず取得メタのみ記録)。取得のたびに SHA-256・バイト数を `fetch-meta.json` に記録し、前回との差分(`added`/`unchanged`/`changed`)を標準出力に表示する。ZIP(`extract: true`)は `unzip` コマンド(macOS/Linux標準)で `extracted/<zip名>/` に展開する | `npm run data:fetch-open`(全source)、`npm run data:fetch-open -- <source-id> [<source-id>...]`(絞り込み) |
| [`ingest-open-data.mjs`](./ingest-open-data.mjs) | `fetch-open-data.mjs` がキャッシュした原本を正規化し、D1(`datasets`/`facilities`/`school_registry`)へ投入する。ライセンス未許可(`classifyLocalLicense` で `allowed: false`)の source、または `ingest_target: none` の source は `datasets` のメタ情報のみ投入する(license-hold)。1,000文で SQL をチャンク分割(`splitSqlIntoChunks`)し、チャンクごとに一時SQLファイル経由で `wrangler d1 execute` を順に実行する(実行後は一時ファイルを削除) | `npm run data:ingest-open -- --all --local`(全source、ローカルD1)、`npm run data:ingest-open -- <source-id> [--local\|--remote]`(1source指定)。**事前に対象sourceで `fetch-open-data.mjs` の実行(`fetch-meta.json` の生成)が必要** |
| [`validate-manual.mjs`](./validate-manual.mjs) | `data/manual/municipalities/**.yaml` を `data/manual/schema/municipality.schema.ts` の Zod スキーマの意図に沿って検証する(必須フィールド・enum値・sources必須・正規表現)。`data/manual/municipalities/**` を変更するPRで GitHub Actions(`.github/workflows/validate-manual-data.yml`)から自動実行される(第三者からのYAML提出をPRで受け付ける経路、Phase 0 §3-3) | `npm run data:validate-manual`(引数省略時は `data/manual/municipalities/` 配下全件、`node scripts/data/validate-manual.mjs <yamlファイル> [<yamlファイル>...]` で対象を絞り込み可) |
| [`report-review.mjs`](./report-review.mjs) | 掲載情報の訂正・更新報告(`facility_reports`/`content_reports`)のレビュー運用CLI(手順のラッパー)。`wrangler d1 execute` の生SQLを暗記せずに新着一覧取得・ステータス更新ができる(Phase 0 §3-1) | `npm run report:list -- --remote`、`npm run report:done -- <id> --remote`、`npm run report:dismiss -- <id> --remote`(ローカルD1確認時は `--local`) |

## 学校住所の一回限りの補完

文部科学省の学校コード一覧 CSV を取得済みの場合、自治体ごとに一度だけ次のコマンドを実行すると、完全一致した小中学校へ住所と出典を追記する。既に `address` がある学校は変更しない。

`node scripts/data/enrich-school-addresses.mjs data/manual/municipalities/13106-taito.yaml`

## 未実装(以下は設計(計画)のみで、`npm run` からは呼び出せない)

| スクリプト | 役割 | 実行契機 |
|---|---|---|
| `build-processed.mjs` | `data/manual/` + `data/open-data/` を統合し `data/processed/` へ出力(JSON/Markdown)。`ingest-manual-survey.mjs` による直接D1投入方式を採用したことで優先度は低下している([data/README.md](../../data/README.md)「データフロー」) | `validate-manual.mjs` 成功後 |

## 定期実行について

本プロジェクトの本番オープンデータ取込(CKAN登録分)は `workers/ingest/`(Cloudflare Workflow、`wrangler.ingest.toml` の scheduled ハンドラ)が担っている。`data/` 側は CKAN 未登録の一次情報(自治体個別ページ、学校コード一覧等)が対象のため、同じ Cloudflare Workflow には乗らない。GitHub Actions の `schedule` トリガー(`.github/workflows/`、現時点では未作成)でのcron実行を想定するが、実装前に東京都・各自治体サイトへの機械的な定期アクセスがサイト側の利用規約・robots.txt上問題ないか確認すること。

## 依存関係

YAML パーサは `yaml`(`package.json` dependencies)を追加済みで、`ingest-manual-survey.mjs`・`fetch-open-data.mjs`・`ingest-open-data.mjs`・`validate-manual.mjs` が共通で利用する。`fetch-open-data.mjs` の ZIP 展開は npm パッケージを追加せず、OS の `unzip` コマンド(macOS/Linux 標準)を `spawnSync` で呼び出す(`ingest-manual-survey.mjs` 同様、依存追加を避ける方針)。
