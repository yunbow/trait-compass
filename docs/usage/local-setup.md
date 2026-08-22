# ローカル環境構築手順

本アプリをローカルで動かすための手順。このリポジトリは npm workspaces による
モノレポで、Next.js アプリ本体は `app/`、データ取込用の Worker・スクリプトは `batch/`
に分かれている。システム全体の構成は
[docs/designs/architecture-for-engineers.md](../designs/architecture-for-engineers.md)、
データ取込の詳細は
[docs/designs/data-pipelines-for-engineers.md](../designs/data-pipelines-for-engineers.md)
を参照。

## 前提

- **Node.js**: `package.json` の `devDependencies` が `@types/node` `^20` を前提としているため、
  Node.js 20 以上を用意する。
- **Docker Desktop**: R2 代替の MinIO(必須, P0)、および Qdrant/Ollama(任意, P1)を
  `docker compose` で起動するために必要。
- **npm**: リポジトリは npm(`package-lock.json`)を前提とする。

D1(支援窓口データ)は公式 Docker イメージが存在しないため、Docker ではなく
**wrangler/Miniflare のローカル SQLite** を使う(後述)。Docker のインストールは必須だが、
D1 用のコンテナは存在しない。

## 1. セットアップ手順

```bash
npm install                # リポジトリルートで実行(app/・batch/ 両ワークスペースを一括インストール)
cp app/wrangler.toml.example app/wrangler.toml
cp batch/wrangler.ingest.toml.example batch/wrangler.ingest.toml
cd app
cp .env.example .env       # ローカル用の値(minioadmin 等)は example に記載済みでそのまま使える
cd ..
docker compose up -d       # MinIO(+ minio-init でバケットを冪等に初期化)。Qdrant/Ollama も同時に起動する
cd app
npm run assets:upload      # トップ画面等で使う静的画像を MinIO(R2 代替)へ投入
npm run db:migrate:local   # app/db/schema.sql をローカル D1 に投入
npm run db:seed:local:manual  # app/db/seed/ 配下の手動シード(実在データ、後述)をローカル D1 に投入
node ../batch/scripts/ingest-manual-survey.mjs ../data/manual/examples/sample-municipality.yaml --local
                           # 動作確認用の架空サンプルデータ(後述)をローカル D1 に投入
npm run dev                # next dev を直接起動(Docker にも wrangler にも載せず、hot reload を維持する)
```

以降のコマンド例は、特に断りがなければ `app/` ディレクトリ内(`cd app` 済み)で実行するものとする。
`batch/` 配下のコマンドは都度 `cd batch` を明記する。

- `app/wrangler.toml.example`・`batch/wrangler.ingest.toml.example` は Cloudflare の設定
  テンプレートで、実際のアカウント固有の値(D1 の `database_id` 等)は `REPLACE_ME` の
  プレースホルダのままにしてある。**ローカル実行(`--local`)だけならこの値のままで問題ない**
  (`wrangler d1 execute --local` は Cloudflare の実際の D1 データベースへ接続せず、
  `database_id` をキーにローカル SQLite ファイルを作るだけのため、値の実在性は問われない)。
  Cloudflare へ実際にデプロイする場合のみ、`npx wrangler d1 create trait-compass` 等で
  発行された実際の値に差し替える(手順は各自の Cloudflare アカウント環境に依存するため、
  本ドキュメントの範囲外とする)。

- `docker compose up -d` は `minio` / `minio-init` / `qdrant` / `ollama` の4サービスを起動する。
  P0 の範囲で必須なのは `minio`(+ `minio-init`)のみで、`qdrant` / `ollama` は P1 のオプション機能
  (§5 参照)。まとめて起動しても問題ないが、起動対象を絞りたい場合は
  `docker compose up -d minio minio-init` のようにサービス名を指定する。
- `docker compose down` で全サービスを停止できる(データは named volume に残る)。
- MinIO の Web コンソール: `http://localhost:19001`(ユーザー名 `minioadmin` / パスワード `minioadmin`)。
  S3 互換 API 自体は `http://localhost:19000`(`.env` の `R2_ENDPOINT`)。
- `npm run assets:upload` は `.env` の `R2_*` を読み込み、`assets/images/self-understanding-map.png` を
  `images/self-understanding-map.png` として MinIO/R2 にアップロードする。公開 URL は
  `R2_PUBLIC_URL/images/self-understanding-map.png` になる。
- `app/src/lib/storage/r2.ts` は `R2_*` 環境変数の値だけでローカル(MinIO)/本番(R2)を切り替える。
  コード分岐はない。
- **本番のシークレット(`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` 等)はコードや `.env` に書かず、
  `npx wrangler secret put <NAME>` で設定する。** `.env.example` に記載されているのはローカル
  MinIO 用の固定値のみ(本番環境の構築手順は各自の Cloudflare アカウント環境に依存するため、
  本ドキュメントの範囲外とする)。
- `app/db/seed/no-diagnosis-facilities.sql`・`app/db/seed/adult-benefit-cards.sql` は実在の公的機関
  情報を手動投入するシード(詳細は各ファイル冒頭コメント参照)。`DELETE` を行わない
  一度きりの `INSERT` のため、`npm run db:seed:local:manual` を2回連続で実行すると
  `UNIQUE constraint failed` になる(再実行したい場合は `npm run db:reset:local` で
  ローカル D1 ごと作り直すこと)。`db:reset:local` は上記2ファイルの投入まで含めて自動で行う。
- `data/manual/examples/sample-municipality.yaml` は公開リポジトリでの動作確認用の**架空データ**
  である(学校名・窓口名・住所・電話番号等はすべて創作。区市町村コード/名称のみ、アプリの
  区市町村選択が解決できるよう実在の値(13106/台東区)を使っている)。実運用では、区市町村別の
  手動調査データ `data/manual/municipalities/*.yaml`(実在の連絡先を含むため公開リポジトリには
  含まれない)を同じコマンドパターンで投入する。
- `batch/scripts/ingest-manual-survey.mjs` は上記の調査データYAML(学校・固定学級・特別支援教室・
  高校進学先・学級編制・自治体調査メタ)を読み込み、`schools` 系
  7テーブルへ、`programs`(就学相談・制度等)は `facilities` へ変換して投入する。ライセンス許諾状況
  (`licenseAudit`)による投入可否のゲートを含め、パイプライン全体の詳細は
  [docs/designs/data-pipelines-for-engineers.md](../designs/data-pipelines-for-engineers.md) を参照。
  対象自治体の既存行を `DELETE` してから `INSERT` するため、同一YAMLを何度実行しても冪等
  (`app/db/seed/*.sql` と異なり `UNIQUE constraint failed` にはならない)。自治体YAMLは
  `app/` から `node ../batch/scripts/ingest-manual-survey.mjs <YAMLファイルへのパス> --local`
  のパターンで投入できる(本番投入時は `--local` を `--remote` に置き換える。`wrangler` が
  `app/wrangler.toml` の D1 バインディングを解決するため、必ず `app/` ディレクトリから実行すること)。
  サンプルと実データは同じ区市町村コードを共有するため、後から投入したYAMLの内容で上書きされる。
  **`npm run db:reset:local` にはこのステップは含まれていない**(`package.json` の `db:reset:local` は
  `db:migrate:local` → `db:seed:local:manual` のみで `ingest-manual-survey.mjs` を呼ばない)ため、
  ローカル D1 をリセットした場合は上記コマンドを都度手動で再実行すること。
- `schools` 系7テーブルは migration
  `app/db/migrations/0006-add-manual-survey-tables.sql`
  (`CREATE TABLE IF NOT EXISTS`)で追加された。0006適用前にセットアップ済みの既存ローカル D1 には
  `npm run db:migrate:local` を再実行するだけで追加できる(`app/db/schema.sql` 自体が
  `CREATE TABLE IF NOT EXISTS` のため再実行しても安全)。個別に適用したい場合は次のコマンドでもよい
  (`app/` から実行)。

  ```bash
  npx wrangler d1 execute trait-compass --local --file=./db/migrations/0006-add-manual-survey-tables.sql
  ```

- **(任意)`data/open-data/sources.yaml` のオープンデータをローカルD1へ直接投入する場合**
  (`batch/` から実行):

  ```bash
  (cd ../batch && npm run data:fetch-open)   # 原本を data/open-data/<source-id>/ へキャッシュ
  npm run db:migrate:local                  # school_registry 等、未適用分を反映(app/ から実行)
  (cd ../batch && npm run data:ingest-open -- --all --local)   # ライセンス許可済みsourceをD1へ投入(license-holdはメタのみ)
  ```

  ライセンス未許可の source は `datasets` のメタ情報のみが入り、`facilities`/`school_registry`
  への実データ投入は行われない。実行方法・source一覧は
  [batch/scripts/README.md](../../batch/scripts/README.md) を参照。

## 2. 検証方法

1. `npm run dev` 実行後、`http://localhost:3000` にアクセスしてトップページが表示されることを確認する。
2. `http://localhost:3000/support/results` にアクセスし、手動シード(`app/db/seed/*.sql`)由来の支援窓口が
   表示されることを確認する。年齢区分・区市町村を指定した例:
   `http://localhost:3000/support/results?age=child&municipality=世田谷区`(`no-diagnosis-facilities.sql`
   の「せたがや若者サポートステーション」(実在データ)が表示される)
   `http://localhost:3000/support/results?age=adult&municipality=世田谷区`(上記に加え、
   `adult-benefit-cards.sql` の広域(municipality=東京都)成人向け制度カードが「支援制度」タブに
   表示される)
   `http://localhost:3000/support/results?age=adult&municipality=台東区`(§1 の
   `ingest-manual-survey.mjs` 実行が前提。「学校情報」タブを選ぶと、サンプルYAML由来の架空の
   小中学校(固定学級・特別支援教室・進学先を含む)が表示される。表示されるのは動作確認用の
   創作データであり、実在の台東区の学校情報ではない)
3. 必要なら D1 の中身を直接確認する。

   ```bash
   npx wrangler d1 execute trait-compass --local --command "SELECT count(*) FROM facilities;"
   ```

## 3. テスト実行

以下は `app/` から実行する(`batch/` 側の lint/type-check/test は本節末尾)。

| コマンド | 内容 | 前提 |
| --- | --- | --- |
| `npm run test` | Vitest(jsdom)によるユニットテスト | なし |
| `npm run test:e2e` | Playwright(chromium)による E2E テスト | **事前に `npm run db:reset:local` を実行しておくこと**。D1 が未セットアップの場合は空状態のフォールバック表示のみ検証され、実データの検証はスキップされる |
| `npm run eval` | RAG 定量評価パイプライン(検索精度・生成品質・安全性) | なし(既定の `mock` LLM 前提で完結する) |

- `npm run test:e2e` は `playwright.config.ts` の `webServer` 設定により `npm run dev` を自動起動する
  (`reuseExistingServer: true` のため、既に `npm run dev` を起動済みならそれを使い回す)。
- `npm run db:reset:local` は `.wrangler/state/v3/d1` を削除してから `db:migrate:local` →
  `db:seed:local:manual` を実行する。ローカル D1 をクリーンな状態に戻したい
  ときにも使う(手動シード分も含めて毎回同じ状態を再現できる)。
- その他のチェック(`app/` から): `npm run lint`(ESLint)、`npm run type-check`(`tsc --noEmit`)。
  `batch/` 側も同様に `cd ../batch && npm run lint && npm run type-check && npm run test` で
  確認できる(取込 Worker・データ投入スクリプトのチェック)。

## 4. 取込 Worker のローカル実行

オープンデータ取込パイプライン(CKAN → R2 → toMarkdown → D1)は、Next.js アプリ本体
(`app/wrangler.toml`)とは別 Worker(`batch/wrangler.ingest.toml`)として動く
(`@opennextjs/cloudflare` が scheduled ハンドラを扱えないため。構成の詳細は
[architecture-for-engineers.md](../designs/architecture-for-engineers.md) §3参照)。

```bash
cd batch   # リポジトリルートから(app/ 内にいる場合は cd ../batch)
npm run ingest:dev   # = wrangler dev -c wrangler.ingest.toml (既定ポート 8787)
```

起動後、別ターミナルから以下を実行する。

```bash
# 手動発火(fetch 経由。対象データセットを絞り込みたい場合は body で指定)
curl -X POST http://localhost:8787/trigger
curl -X POST http://localhost:8787/trigger \
  -H "content-type: application/json" \
  -d '{"datasetIds":["ds-tokyo-fukushi-shisetsu"]}'

# 死活監視・鮮度チェック結果の確認
curl http://localhost:8787/health

# Cron 相当(scheduled ハンドラ)の手動発火。wrangler dev は Cron を自動発火しないため必須
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```

## 5. P1 のオプション: Qdrant / Ollama(埋め込み・ベクトル検索)

生成 AI(Vertex AI Gemini)・埋め込み(bge-m3)・ベクトル検索(Vectorize)は
`app/src/lib/ai/` の3抽象インターフェース(`LlmClient` / `Embedder` / `VectorStore`)で
ローカル実装/本番実装を環境変数だけで切り替える。詳細は
[architecture-for-engineers.md](../designs/architecture-for-engineers.md) §4(AIプロバイダ抽象化)
を参照。

初回セットアップ(モデル取得。イメージ pull・モデル pull ともに数百 MB〜GB 単位で重いため、
疎通確認が不要な場合はスキップしてよい):

```bash
docker compose up -d qdrant ollama
docker compose exec ollama ollama pull bge-m3
curl http://localhost:21434/api/tags     # モデルが一覧に出れば OK
curl http://localhost:16333/collections  # Qdrant の疎通確認(空の一覧が返れば OK)
```

埋め込み生成 → Qdrant への投入を手動発火する場合(取込 Worker が起動している前提)。

```bash
curl -X POST http://localhost:8787/embed
```

**`Cloudflare` へログイン(`wrangler login`)していない場合の起動方法**: `npm run ingest:dev`(`wrangler dev -c wrangler.ingest.toml`)は `[ai]` バインディング(Workers AI)が常にリモート接続を要求するため、`CLOUDFLARE_API_TOKEN` 未設定・未ログインの環境では `Could not start remote dev session` で起動自体が失敗する。`POST /embed` は `env.AI` を参照しない(Ollama + Qdrant のみで完結する)ため、この場合は `--local`(`-l`、リモートバインディングを無効化するオプション)を付けて起動すればよい:

```bash
# batch/ から実行(app/wrangler.toml とは別の設定ファイル)
npx wrangler dev -c wrangler.ingest.toml --port 8787 --local
```

`batch/wrangler.ingest.toml` には `compatibility_flags = ["nodejs_compat"]` が必要
(`app/wrangler.toml` と同じ理由。`process.env.OLLAMA_BASE_URL`/`process.env.QDRANT_URL` を
参照するため、未設定だと workerd に `process` グローバルが存在せず
`"process is not defined"` で失敗する)。

### 環境変数(`LLM_PROVIDER` 等)の切り替え

`.env` に以下を設定することで実装を切り替えられる(既定値は mock/ローカル実装で、
クラウド課金や外部送信は発生しない)。

| 環境変数 | 既定値 | 説明 |
| --- | --- | --- |
| `LLM_PROVIDER` | `mock` | `mock` \| `vertex-direct` \| `vertex-gateway`。通常開発ではクラウド課金・外部送信のない `mock` を使う |
| `EMBEDDER_PROVIDER` | `ollama` | `ollama`(ローカル)\| `workers-ai`(Workers 上でのみ動作) |
| `VECTOR_PROVIDER` | `qdrant` | `qdrant`(ローカル)\| `vectorize`(Workers 上でのみ動作) |
| `QDRANT_URL` | `http://localhost:16333` | docker-compose の Qdrant(ホスト公開ポートを他プロジェクトと衝突しにくい値にずらしている) |
| `OLLAMA_BASE_URL` | `http://localhost:21434` | docker-compose の Ollama(同上) |
| `AI_GATEWAY_URL` | (空) | Cloudflare AI Gateway のベース URL(`vertex-gateway` 使用時のみ必須) |
| `CLOSED_BETA_PASSWORD` | (未設定) | 設定すると `/` へのアクセス時にパスワード入力画面を挟む。クローズドベータ運用時のみ設定する |

- **重要(混在禁止)**: ローカルの Qdrant インデックスはローカルの Ollama 埋め込みでのみ構築し、
  本番(Workers AI `@cf/baai/bge-m3`)由来のベクトルと混在させないこと
  (`app/src/lib/ai/embedder.ts` の doc コメント参照)。
- `EMBEDDER_PROVIDER=workers-ai` / `VECTOR_PROVIDER=vectorize` は `env.AI` / `env.VECTORIZE`
  バインディングが必要なため、Workers 上(本番 / `wrangler dev`)からのみ指定すること。

## 6. トラブルシューティング

- **`@cloudflare/workerd-darwin-arm64` / `@esbuild/darwin-arm64` が見つからず `cf:build` 等が失敗する**:
  darwin-arm64 環境で optional dependency が `node_modules` に入っていないことがある(原因未特定)。
  `npm install` を再実行すると解消する(既知事象)。
- **`.wrangler/state` に起因する不可解なエラー(`_cf_ALARM` のスキーマ不一致で crash 等)**:
  wrangler/workerd のバージョンが変わると、古い Miniflare 永続化ディレクトリ
  (`.wrangler/state`)と非互換になることがある。`rm -rf app/.wrangler/state` で削除すれば復旧する
  (D1 のデータも消えるため、削除後は `app/` で `npm run db:reset:local` を実行すること)。
- **ポート衝突**: 他プロジェクトと同時に Docker サービスを起動していると `port is already allocated`
  で失敗することがある。本プロジェクトは MinIO(`19000`/`19001`)・Qdrant(`16333`)・
  Ollama(`21434`)のホスト公開ポートを一般的な既定値からずらしているが、それでも衝突する場合は
  競合しているコンテナを停止するか、`docker-compose.yml` のポートマッピングを変更する。
- **`Compatibility date "..." is in the future and unsupported`**: `app/wrangler.toml` /
  `batch/wrangler.ingest.toml` の `compatibility_date` がローカルの `workerd` バイナリの対応上限日付を
  超えている。日付を下げるか `npm install` で wrangler/workerd を更新する。
