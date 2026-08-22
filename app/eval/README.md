# RAG 定量評価パイプライン(TICKET-0024)

NFR-73〜75・77 に基づき、RAG(TICKET-0021〜0023)の
検索精度・生成品質・安全性を定量的に継続監視するための自前ハーネス。`npm run eval` で
3レイヤー(検索精度・生成品質・安全性)を実行し、Markdown レポートを `eval/reports/`
(gitignore 対象)に出力する。`EVAL_JUDGE=1` を指定すると、実 LLM(Vertex AI Gemini)による
LLM-as-judge(`eval/judge.eval.ts`)を第4レイヤーとして追加実行できる(詳細は
「④ LLM-as-judge」参照)。

## 実行方法

```bash
# 前提: ローカル D1 が migrate/seed 済みであること
npm run db:migrate:local
npm run db:seed:local:manual
npm run db:seed:local:eval

npm run eval
```

- `npm run db:seed:local:eval`(実体: `wrangler d1 execute trait-compass --local --file=./eval/fixtures/eval-golden-seed.sql`)は、
  `eval/fixtures/retrieval-golden.json`(手書き12ケース)・`eval/fixtures/generation-samples.json`
  (Faithfulness 10ケース)が前提とする `fac-001`〜`fac-010`(架空データ、`fac-004` は医療機関除外
  ロジック検証用の `is_medical=1` ダミー)を D1 へ投入する。**`db:seed:local:manual` とは別の
  コマンドであり、どちらも実行しないとゴールデンデータ前提の検索精度・生成品質レイヤーが
  常に失敗する**(2026-08-21 発覚: このシード自体がリポジトリに存在しなかった不具合の是正)。
  `db/seed/`(実運用データの手動シード)とは意図的に投入経路を分離しており、
  `eval/fixtures/eval-golden-seed.sql` は eval 専用のテストフィクスチャである(実在の施設情報
  ではない)。**本番 D1(`--remote`)には投入しないこと。**

`eval/fixtures/retrieval-golden.generated.json`(検索精度①の生成ゴールデン、後述)を最新化したい場合は、`npm run eval` の前に以下を実行してコミットする(スナップショット方式、`npm run eval` 自体は D1 へ再アクセスして再生成することはしない):

```bash
npm run eval:golden:generate
```

個別のレイヤーだけを実行したい場合:

```bash
node --no-warnings --import ./eval/lib/register.mjs eval/retrieval.eval.ts
node --no-warnings --import ./eval/lib/register.mjs eval/generation.eval.ts
node --no-warnings --import ./eval/lib/register.mjs eval/safety.eval.ts
```

しきい値は `eval/thresholds.json` に集約している。CI のゲート条件を変える場合はこのファイルのみ変更すればよい。

### LLM-as-judge を含めて実行する(`EVAL_JUDGE=1`)

```bash
LLM_PROVIDER=vertex-gateway \
AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/<account>/<gateway> \
GOOGLE_VERTEX_PROJECT=<project-id> \
GOOGLE_VERTEX_LOCATION=<location> \
EVAL_JUDGE=1 npm run eval
```

- **既定(`EVAL_JUDGE` 未設定)では LLM 呼び出しは一切発生しない。** `npm run eval` を素の状態で
  実行しても課金・外部送信は起きない(下記「④ LLM-as-judge」参照)。
- 必要な環境変数は Vertex AI Gemini(Cloudflare AI Gateway 経由、BYOK 認証)を本番と同じ経路で
  呼び出すためのもので、`LLM_PROVIDER=vertex-gateway`・`AI_GATEWAY_URL`・
  `GOOGLE_VERTEX_PROJECT`・`GOOGLE_VERTEX_LOCATION` が必須(BYOK 設定済みなら
  `GOOGLE_VERTEX_ACCESS_TOKEN` は不要)。Vertex AI / AI Gateway 側の設定手順は各自の
  Google Cloud・Cloudflare アカウント環境に依存するため、本リポジトリの範囲外とする
  (プロバイダ切り替えのしくみは
  [docs/designs/architecture-for-engineers.md](../../docs/designs/architecture-for-engineers.md) §4 を参照)。
- 個別に実行したい場合: `EVAL_JUDGE=1 node --no-warnings --import ./eval/lib/register.mjs eval/judge.eval.ts`
- **コスト試算**: Gemini 2.5 Flash(Google Cloud 公表の従量課金レート)、
  各ケースのプロンプト・レスポンスは数百トークン程度の短文。ケース数は現状 relevancy 14件 +
  Faithfulness 意味層 12件(単一 judge)+ 診断表現 13件×3回(多数決)= 約65回の judge 呼び出し。
  1回あたり入出力合計 1,000 トークン程度と見積もっても Standard ティア(入力 $0.30/1M、出力
  $2.50/1M)換算で **実行1回あたり数円未満**の見込み。

`EVAL_JUDGE=1` を指定しない限り `eval/judge.eval.ts` は「スキップしました」という結果を返すのみで
`eval/lib/llm-judge.ts` の `assertRealLlmProvider()`/`runJudge()` にも到達しない。

### 本番 Vectorize/Workers AI を対象にした検索精度評価(`EVAL_TARGET=production`)

既定(`EVAL_TARGET` 未設定 = `auto`)では、`eval/retrieval.eval.ts` はローカルの Qdrant/Ollama へ
疎通できるかを確認し、できなければタグベース検索経路にフォールバックする(下記「① 検索精度」参照)。
これとは別に、本番と同じ Workers AI(`@cf/baai/bge-m3`)埋め込み + Vectorize(インデックス名
`trait-compass-facilities`)の経路そのものを検証したい場合は `EVAL_TARGET=production` を指定する。

```bash
CLOUDFLARE_ACCOUNT_ID=xxxx CLOUDFLARE_API_TOKEN=xxxx EVAL_TARGET=production \
  node --no-warnings --import ./eval/lib/register.mjs eval/retrieval.eval.ts
```

- 必要な環境変数: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`。**どちらか一方でも未設定だと
  即座にエラーで停止する**(ローカル Qdrant/Ollama 未疎通時にタグ検索へグレースフルフォールバックする
  `auto`/`local` の設計思想とは意図的に異なる扱いにしている。本番経路の検証を明示的に要求した以上、
  黙って別経路にフォールバックしてしまうと「評価したつもりで実際には本番経路を検証できていない」
  事故につながるため)。
- **APIトークンは Vectorize Read + Workers AI 実行の最小権限で新規発行すること。** 既存の広い権限を
  持つトークン(デプロイ用等)を使い回さない。
- 実装は `eval/lib/rest-workers-ai-embedder.ts`・`eval/lib/rest-vectorize-store.ts`(Cloudflare REST API
  を直接叩く `Embedder`/`VectorStore` 実装)。バインディング(`env.AI`/`env.VECTORIZE`)ではなく REST
  直叩き方式にしたのは、eval が Next.js/Workers のリクエストコンテキスト外の単なる Node プロセスであり、
  `wrangler.toml` の `remote: true` バインディングより単純だから。
- 経路の選択ロジックは `eval/lib/eval-target.ts` に集約している(`EVAL_TARGET=production|local|auto`)。

### リモート(本番)D1 を対象にした評価(`EVAL_D1_REMOTE=1`)

`eval/lib/d1.ts` は既定でローカル D1(`wrangler d1 execute --local`)のみを対象にするが、
`EVAL_D1_REMOTE=1` を指定するとリモート(本番)D1(`--remote`)を対象にする。

```bash
EVAL_D1_REMOTE=1 npm run eval
```

- `wrangler` のリモート認証(`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`、または `wrangler login`
  済みのセッション)が別途必要。
- `eval/lib/d1.ts` 経由で発行されるのは **SELECT のみ**(`searchFacilities`/`fetchFacilitiesByIds` の
  読み取り専用クエリ)という前提を維持すること。リモート指定時に書き込み系 SQL を渡すと本番データを
  直接変更してしまうため、このモジュールの用途を増やす場合は SELECT 限定を崩さないこと。

## CI統合

`npm run eval` を CI に組み込む2つのワークフロー(`.github/workflows/`)を用意している。役割が異なるため使い分ける。

| | `.github/workflows/ci.yml`(既存、`lint-typecheck-test` ジョブに追加) | `.github/workflows/rag-eval-production.yml`(新規) |
| --- | --- | --- |
| トリガー | 全 PR・push(`pull_request` / `push`) | `workflow_dispatch`(手動)、週次 cron(毎週月曜 9:00 JST)、RAG 関連パス(`app/src/features/*/services/prompt.ts`・`app/src/features/support/services/facility-vector-search.ts`・`app/eval/**`)変更時の PR |
| 対象経路 | ローカル D1(`--local`)+ タグベース検索経路(ベクトル未構築環境へのグレースフルフォールバック) | 本番 Vectorize/Workers AI(`EVAL_TARGET=production`)+ リモート D1(`EVAL_D1_REMOTE=1`)+ 実 LLM-as-judge(`EVAL_JUDGE=1`、Vertex AI Gemini) |
| シークレット | **不要**(`EVAL_TARGET`/`EVAL_JUDGE` は未設定のまま実行する) | 必要(下記) |
| 外部課金 | ゼロ | あり(Vectorize/Workers AI の実行コスト、Gemini の judge 呼び出し。詳細は本 README「④ LLM-as-judge」の試算参照) |
| PR ブロック | **しない**(`continue-on-error: true`。Qdrant/Ollama へ疎通できないタグベース検索経路では①手書きゴールデンの検索精度しきい値が構造的に達成できないため、毎回のPR・pushをブロックしないこの方針にしている) | **しない**(`continue-on-error: true`。外部サービス起因の一時的な障害でPRやマージを止めない設計) |
| レポート出力先 | ジョブログ(`npm run eval` の標準出力) | GitHub Actions job summary(`$GITHUB_STEP_SUMMARY` に `eval/reports/latest.md` を出力)+ artifact(`eval/reports/` 一式) |

`ci.yml` 側は `app` ワークスペースのジョブでのみ、`lint`/`type-check`/`test` の後に
`npm run db:migrate:local && npm run db:seed:local:manual && npm run db:seed:local:eval` で
ローカル D1(実運用データの手動シード + 本 README 上部で追加した eval 用ゴールデンシード
`eval/fixtures/eval-golden-seed.sql`)を用意してから `npm run eval` を実行する。`EVAL_TARGET`/
`EVAL_JUDGE` を明示的に設定しないため、`retrieval.eval.ts` はローカル Qdrant/Ollama への疎通を
試みて失敗し、タグベース検索経路にグレースフルフォールバックする(このリポジトリの通常の
開発環境と同じ経路)。

`rag-eval-production.yml` に必要な GitHub Actions Secrets(値の設定自体は本ワークフロー追加の
スコープ外。別途 GitHub リポジトリ設定で登録すること):

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`: **Vectorize Read + Workers AI 実行の最小権限で新規発行したトークンを
  使うこと。** `cf:deploy` 等で使う既存の広い権限を持つトークンを使い回さない(上記「本番
  Vectorize/Workers AI を対象にした検索精度評価」節と同じ注意)。トークンは Cloudflare
  ダッシュボードの API Tokens 画面から上記の最小権限で発行する。
- `AI_GATEWAY_URL` / `AI_GATEWAY_AUTH_TOKEN`(認証済みゲートウェイが有効な場合のみ)
- `GOOGLE_VERTEX_PROJECT` / `GOOGLE_VERTEX_LOCATION` / `GOOGLE_VERTEX_MODEL`(任意)

これらは本番デプロイ用の secrets(`npx wrangler secret put` で Worker に設定するもの)とは別に、
**GitHub Actions 専用の secrets として個別に登録する**運用とする(CI ランナーから本番 Worker の
secrets ストアへ直接アクセスすることはできないため、GitHub 側にも同じ値を登録する必要がある。
値そのものを使い回すこと自体は構わないが、`CLOUDFLARE_API_TOKEN` だけは上記のとおり
デプロイ用と混同せず、CI からの読み取り専用アクセスに限定した新規トークンを使うこと)。

## なぜ promptfoo / DeepEval を使わず自前ハーネスにしたか

TICKET-0024 の実装方針に基づき検討した結果、本チケットの段階では **promptfoo / DeepEval の導入を見送り、自前の CLI ハーネスとして同等機能を実装した**。理由:

- 現段階では `LlmClient` が `mock` 既定であり、実 LLM 呼び出しを前提にした judge 機能(promptfoo/DeepEval の主要な付加価値)を今使っても意味のある評価にならない。
- 検索精度(Precision@K/Recall@K/MRR)・Faithfulness のエンティティ突合は、SQL 由来の正解データとの機械的な集合演算であり、promptfoo/DeepEval のような LLM judge 中心のフレームワークを介する必然性が薄い。
- 危機介入ガードの見逃しゼロ(NFR-74)というプロジェクト固有の強いゲート条件は、汎用フレームワークの assert 機能より、本リポジトリの `containsCrisisSignal` を直接呼び出す専用スクリプトの方が単純明快。
- 導入・学習コストと将来のメンテナンスコストが、現時点で得られる価値(主に LLM judge のオーケストレーション)に見合わない(コスト対効果が薄い)。

実 LLM(Vertex AI 等)を本格導入する段階になったら、LLM-as-judge のオーケストレーション部分だけ promptfoo/DeepEval への切り替えを再検討する余地がある(下記「実 LLM 導入時の判定規約」を参照)。

## レイヤーの構成(①〜③は常時実行、④は `EVAL_JUDGE=1` 指定時のみ)

### ① 検索精度(`eval/retrieval.eval.ts`, NFR-73①)

`eval/fixtures/retrieval-golden.json`(クエリ → 正解 facility_id 集合、seed データに対して手書き、12ケース)に対して Precision@K / Recall@K / MRR(`eval/metrics.ts`)を算出する。LLM judge は使わない。

評価対象経路の解決は `eval/lib/eval-target.ts`(`resolveRetrievalDeps()`)に集約している(`EVAL_TARGET` 環境変数、既定 `auto`)。

**ベクトル未構築環境でのフォールバック(`EVAL_TARGET` 未設定 = `auto`、既定)**: ローカルの Qdrant(`http://localhost:6333`)・Ollama(`http://localhost:11434`)への疎通を確認し、両方到達可能な場合のみ本番と同じロジックのベクトル検索経路(`queryFacilityIds` + ローカル `createEmbedder("ollama")`/`createVectorStore("qdrant")`)で評価する(レポート上は `usedPath: vector-local`)。どちらかに疎通できない場合(このリポジトリの通常の開発・CI 環境を含む)は、タグベース検索経路(`searchFacilities` + `buildFallbackFacilities`。`/api/recommend` のグレースフルフォールバックと同一のロジック、`usedPath: tag-fallback`)にフォールバックし、その旨をレポートに明記する。この既定動作は `EVAL_TARGET` 導入前と完全互換。

**本番 Vectorize/Workers AI そのものを評価したい場合**: `EVAL_TARGET=production` を指定する(`usedPath: vector-production`)。ローカル Qdrant/Ollama とは別モデル・別ベクトル空間であり疎通有無で切り替える対象ではないため、明示的なオプトインが必要。詳細・必要な環境変数は上記「本番 Vectorize/Workers AI を対象にした検索精度評価」を参照。

タグベース経路は意味的なランキングを行わない(タグ一致の有無のみで並べ替える)ため、この経路での評価は「自由文クエリへの意味的な検索精度」そのものではなく、「構造的フィルタ(医療機関除外・年齢一致・区市町村一致 or 広域フォールバック)+ タグ優先ソートが正しく機能しているか」の回帰検知が主目的になる。広域窓口(`fac-008`/`fac-009`)は区市町村・年齢を問わず常に検索対象に含まれる設計のため、ゴールデンデータの正解集合にも「クエリの意図(相談窓口を探しているか/ガイドを探しているか)に応じて広域窓口を含めるかどうか」を都度判断して反映している(`retrieval-golden.json` の `description` に判断根拠を記載)。

**しきい値の根拠**(`eval/thresholds.json` の `retrieval`): このリポジトリの既定環境(ベクトル未構築、タグベース経路)での実測値(Precision@5 ≈ 0.56, Recall@5 = 1.0, MRR ≈ 0.83)に基づき、若干のマージンを見て `precisionAtKMin: 0.5` / `recallAtKMin: 0.9` / `mrrMin: 0.6` を初期値とした。ベクトル検索経路が実際に稼働するようになったら、その経路での実測値を踏まえて再度見直すこと。

#### ゴールデンデータの2種類と役割分担

`eval/retrieval.eval.ts` の `run()` は手書き(`runHandwritten`)・生成(`runGeneratedGolden`)の両方を実行し、1つの Markdown レポートに統合する。`passed`(CI ゲート判定)は**手書きゴールデンの結果のみ**で決まる(生成ゴールデンは非ゲート、後述)。

| | 手書き(`retrieval-golden.json`) | 生成(`retrieval-golden.generated.json`) |
| --- | --- | --- |
| 件数 | 12件(固定) | 実行のたびに変動(D1 の実データに追随、目安100〜150件) |
| 前提データ | 初期シードデータ(`fac-001` 等の少数施設) | 本番/ローカル D1 の実データ(現在23〜数十自治体分の施設) |
| 正解の形 | 単一の `expectedFacilityIds` | 2層(`requiredFacilityIds`/`acceptableFacilityIds`、後述) |
| 主目的 | **意味的ランキング検証**(自由文クエリと施設の意味的な対応が正しくランキングされているか) | **自治体網羅の構造的取りこぼし検証**(ある区市町村で検索結果が構造的に0件・薄くなっていないか) |
| CI ゲート | あり(`eval/thresholds.json` の `retrieval`) | **なし**(`retrievalGenerated` は記録のみ、`passed` に影響しない) |
| 生成方法 | 手書き(レビュー・変更は都度手動) | `npm run eval:golden:generate` でスナップショット生成 → コミット |

**なぜ2種類が必要か**(2026-08-20 発覚の問題が背景): 本番で「千代田区・障害があり就労移行支援を受けたい」を投げたところ、Vectorize 検索の top-10 に千代田区の施設が1件も入らず、新宿区・足立区等の施設ばかりが返っていた。原因は `queryFacilityIds`(`facility-vector-search.ts`)が区市町村によるメタデータフィルタを一切かけず、全施設からの意味的類似度だけで top-K を取っているため。手書きゴールデン(12件、少数自治体のみ)ではこの種の「特定の区市町村だけが構造的に取りこぼされる」問題を検出できない。生成ゴールデンは全区市町村 × 年齢区分を横断的に(層化抽出で)網羅することで、この種の回帰を検知できるようにする。

#### `npm run eval:golden:generate`(生成ゴールデンのスナップショット生成)

```bash
# 前提: ローカル D1 が migrate/seed 済みであること
npm run eval:golden:generate
```

- 実体は `eval/lib/generate-golden.ts`。D1(`eval/lib/d1.ts` の `queryD1()`)から `facilities`/`facility_tags` を取得し、`eval/fixtures/query-templates.json`(手書きの自由文クエリテンプレート集、`SUPPORT_TAGS` 6種 × `service_category` 8種にそれぞれ1〜2パターン)と組み合わせて `eval/fixtures/retrieval-golden.generated.json` を書き出す。
- **都度自動生成ではなくスナップショット方式**: `npm run eval`(`retrieval.eval.ts`)は生成済みの `.generated.json` を読むだけで、評価のたびに D1 へアクセスして再生成することはしない。**生成後の `.generated.json` はコミットして使う**。D1 のデータが変わったら(自治体データの追加・入れ替え等)`npm run eval:golden:generate` を再実行して再生成し、差分をコミットする運用とする。
- **自由文クエリは機械生成できない**: 自由文クエリとその意味的な正解対応は SQL からは決定できないため、`eval/fixtures/query-templates.json` は手書きのレビュー可能な fixture として維持する(既存の `SUPPORT_TAGS` のコメント方針と同じく、診断・症状を想起させる語彙は使わない)。
- **正解集合の決定ロジック(SQL 由来データからの機械的導出、LLM 不使用)**: 対象区市町村コード一致・`is_medical=0`・`is_out_of_scope=0`・年齢一致(`age_range='both'` または対象年齢)・(facility_tags 経由のタグ一致 OR `service_category` 一致)を満たす施設を `requiredFacilityIds` とする。同じ条件を広域窓口(`municipality_code = '13000'`、`BROAD_AREA_MUNICIPALITY_CODE`)に対して評価したものを `acceptableFacilityIds` とする(Precision では正解扱いするが、Recall の分母には含めない。「広域窓口は常に検索対象に含まれる」という既存の企画・実装方針を踏襲)。判定はすべて決定的(`Math.random()` 不使用、区市町村コード順 × テンプレート配列のインデックスによる巡回選択)であり、再実行しても(D1 の内容が同じなら)同じ結果になる。
- 対象区市町村は D1 の実データから機械的に導出する(固定の23件等をハードコードしない)。**このため、ローカル D1 の状態によって生成される自治体数・ケース数は変動する**(このリポジトリのローカル D1 の実測: 54自治体・108ケース。本番想定の23自治体であれば46組み合わせ×3テンプレート=138ケース程度になる)。1組み合わせあたりのテンプレート件数は「合計100〜150ケース程度」を狙って組み合わせ数から動的に算出する(`resolveTemplatesPerCombo`)。
- `EVAL_D1_REMOTE=1 npm run eval:golden:generate` で本番 D1 から生成できる(`eval/lib/d1.ts` の既存の仕組みをそのまま使う)。**このリポジトリのサンドボックス環境ではリモート D1 への認証が通らず失敗する可能性がある**ため、失敗する場合はローカル D1 での生成で構わない(ローカル D1 が未 migrate/seed の場合は `npm run db:migrate:local && npm run db:seed:local:manual` を先に実行すること)。
- **既知の制約(このリポジトリのローカル D1 のデータ完全性に依存)**: ローカル D1 に `facility_tags` が投入されていない場合、タグベースのテンプレートはすべて `requiredFacilityIds: []` になる(タグでの突合ができないため)。この場合も `service_category` ベースのテンプレートは機能する。正解が空のケースも「取りこぼしようがない」有効なケースとして扱う(`recallAtKCapped`/`municipalityHitRateAtK` の空集合規約、後述)。本番 D1(`facility_tags` が投入済み)で生成すればタグベースのケースにも正解が入る。

#### 生成ゴールデン専用の指標(`eval/metrics.ts`)

- **`recallAtKCapped`/`meanRecallAtKCapped`**: 既存の `recallAtK` は分母が常に正解集合のサイズ(`relevantIds.size`)であるため、正解集合が K を超える場合は原理的に Recall@K=1.0 を達成できない(例: 正解50件・K=10なら最大でも10/50=0.2)。生成ゴールデンは「区市町村内の該当施設全件」を `requiredFacilityIds` とするため、都市部の区市町村ではこの状況が頻繁に起こりうる。`recallAtKCapped` は分母を `min(正解集合のサイズ, K)` にすることでこれを解消する。**既存の `recallAtK` は変更していない**(手書きゴールデンのしきい値・挙動に影響させないため)。
- **`municipalityHitRateAtK`/`meanMunicipalityHitRateAtK`**: 2026-08-20 発覚の「自治体単位での取りこぼし」(千代田区クエリで千代田区の施設が上位10件に0件)を直接検知するための指標。上位 K 件の中に同一区市町村内の施設(`requiredIds`)が1件でも含まれていれば1、1件も含まれなければ0を返す二値判定(Precision@K/Recall@K のような按分ではない)。この値が低い区市町村・年齢区分の組み合わせがあれば、`facility-vector-search.ts` の `queryFacilityIds` に区市町村メタデータフィルタが必要、という直接的なシグナルになる。

#### 循環評価のリスクに関する注記

生成ゴールデンの正解(`requiredFacilityIds`/`acceptableFacilityIds`)は、`searchFacilities`(`facility-search.ts`)の WHERE 句と同じ SQL 構造条件(区市町村一致・年齢一致・医療機関/対象外除外・タグ or `service_category` 一致)から機械的に導出している。つまり本評価は **`searchFacilities` のフィルタロジックが正しいことを暗黙の前提にしてしまっている**(そのロジック自体にバグがあれば、正解データにも同じバグが伝播する)。

したがって生成ゴールデンで測れるのは「検索結果が正解自治体・正解カテゴリの施設を構造的に含んでいるか(自治体単位のカバレッジ)」であり、**自由文クエリとランキングの意味的な妥当性そのものではない**。意味的な検索品質は、引き続き手書きゴールデン(意味的ランキング検証)と、将来導入予定の Answer Relevancy LLM judge(`eval/README.md` 冒頭「実 LLM 導入時の判定規約」参照)が担う。この役割分担のため、生成ゴールデンのしきい値は初回は非ゲート(`retrievalGenerated`、記録のみ)としている。

### ② 生成品質: Faithfulness(`eval/generation.eval.ts`, NFR-73②)

`eval/fixtures/generation-samples.json`(D1 の実施設情報を対象にした mock LLM 出力サンプル 5件 + 意図的な捏造サンプル 5件)に対し、「テキスト中の電話番号・施設名・URL が D1 由来集合に含まれるか」のエンティティ突合で判定する。判定ロジックは `src/features/recommend/services/fact-guard.ts` の `containsFabricatedPhone`(既存)を、本チケットで追加した `containsFabricatedUrl`/`containsFabricatedFacilityName` で拡張したもの。

ラベル(誠実/捏造)と判定結果の一致率を「検知精度」として算出し、しきい値(`faithfulnessMin`)以上、かつ見逃し(捏造なのに誠実と誤判定)0件を要求する。誤検知(誠実なのに捏造と誤判定、過剰ブロック)は警告のみ。

**Answer Relevancy(NFR-73②のもう一方の観点)は本チケットの対象外**。意味的な妥当性判断が必要で、LLM judge 抜きには機械的に測れないため、実 LLM judge 導入時に追加する(下記参照)。

### ③ 安全性(`eval/safety.eval.ts`, NFR-73③, NFR-74, NFR-77)

- **診断表現排除**: `src/lib/copy/banned-words.ts`(禁止語リストを共通定数化したもの。従来 `copy-lint.test.ts`・`explanation.test.ts` に重複定義されていたものを1箇所に集約)を `eval/fixtures/safety-output-samples.json`(AI 出力サンプル10件)に適用する。
- **危機介入ガード**: `containsCrisisSignal`(`src/features/ai-summary/services/crisis-detection.ts`)を `eval/fixtures/crisis-cases.json`(危機表現バリエーション24件 + 紛らわしい非危機表現6件)に適用する。**見逃し(false negative)が1件でもあれば `npm run eval` は exit 1**(NFR-74)。誤検知(false positive)は警告のみでゲートしない(危機介入ガードは見逃しゼロを優先する、という NFR-74 の方針どおり)。
- **注入検知ガード**: `containsPromptInjectionSignal`(`src/lib/ai/injection-detection.ts`, FR-046)を `eval/fixtures/injection-cases.json`(注入表現バリエーション20件 + 紛らわしい非注入表現8件)に適用する。**見逃し(false negative)が1件でもあれば `npm run eval` は exit 1**(NFR-77: 危機介入ガード(NFR-74)と同方針で見逃しゼロを優先し、誤検知は警告のみでゲートしない)。

本チケットの評価で発覚した見逃し12件(「死んでしまいたい」「飛び降りたい」「首を吊りたい」「オーバードーズ」等の表現バリエーション)は `crisis-detection.ts` の `CRISIS_KEYWORDS` に語彙を追加し、見逃しゼロを達成済み(`src/features/ai-summary/__tests__/crisis-detection.test.ts` に回帰テストを追加)。

### ④ LLM-as-judge(`eval/judge.eval.ts`, NFR-75 AC-4, `EVAL_JUDGE=1` 指定時のみ)

Vertex AI Gemini(Cloudflare AI Gateway 経由、BYOK 認証)が本番で稼働するようになったため、下記
「実 LLM 導入時の判定規約」に従い実装済み。**`process.env.EVAL_JUDGE === "1"` のときのみ意味のある
処理をする。既定(未設定)では `eval/lib/llm-judge.ts` の `assertRealLlmProvider()`/`runJudge()` に
到達すらせず、LLM 呼び出しは一切発生しない**(「スキップしました」という結果を返すのみ)。

3つの judge を実装している:

1. **Answer Relevancy**(`eval/fixtures/relevancy-samples.json`, 14件、単一 judge): ユーザーの
   クエリ + 施設の事実情報(D1由来、名前・カテゴリ等)+ aiNote相当のテキストが意味的に対応して
   いるかを `relevant`/`partially_relevant`/`irrelevant` の3値で判定する。①の生成ゴールデンが
   測れなかった「自由文クエリとランキングの意味的な妥当性そのもの」を補う位置づけ。
2. **Faithfulness 意味層**(`eval/fixtures/faithfulness-semantic-samples.json`, 12件、単一
   judge): ②の機械的エンティティ突合(電話番号・施設名・URL)を**すり抜ける**言い換え型の
   捏造(「無料で利用できます」「即日対応可能です」等、D1 に無い属性の断定)を検知する追加の
   検知網。②の機械層はそのまま維持し、本 judge は別ファイル(`eval/judge.eval.ts`)に実装した
   (機械層を置き換えるものではない)。
3. **診断表現の意味的評価**(`eval/fixtures/diagnostic-semantic-samples.json`, 13件、
   **3judge多数決**): `banned-words.ts` の禁止語リストをすり抜ける言い換え表現(「〜の傾向が
   強く出ています」「〜の可能性が高いと考えられます」等)を `diagnostic`/`non-diagnostic` で
   判定する。**安全性クリティカルな判定のため、プロンプトを3種類の言い回しに変奏して3回判定させ
   多数決を取る**(下記規約4)。他の2つの judge は単一判定(コスト対効果の判断)。

**危機介入ガード(`containsCrisisSignal`)・注入検知ガード(`containsPromptInjectionSignal`)には
LLM judge を一切追加していない。** これらは②の安全性評価(`eval/safety.eval.ts`)の機械的ゲート
(見逃しゼロ必須、NFR-74/77)のまま維持する設計判断を維持している。非決定的な判定器(LLM judge)を
見逃しゼロが要求されるゲートに混ぜると、judge 自体の誤判定でゲートが不安定になり「見逃しゼロを
機械的に保証する」という NFR-74/77 の趣旨が崩れるため。

**しきい値は初期段階では非ゲート**(`eval/thresholds.json` の `judge` セクション、`retrievalGenerated`
と同じ考え方)。実測値を見てから閾値・ゲート化を再検討する運用とする。判定不能(Structured Output
が2回とも zod パースに失敗)なケースも `passed: true` 扱いとし、1ケースの判定不能で評価全体を
止めない。

## 実 LLM 導入時の判定規約(NFR-75, `eval/judge.eval.ts` に実装済み)

実 LLM(Vertex AI Gemini、Cloudflare AI Gateway 経由、BYOK 認証)が本番で稼働するようになったため、上記④として実装済み。以下は導入時に守った規約(引き続き変更時の指針とする)。

1. **temperature = 0**: judge の出力を再現可能にする(サンプリングのランダム性を排除する)。`eval/lib/llm-judge.ts` の `runJudge()` が固定で渡す。
2. **Chain-of-Thought(CoT)**: judge プロンプトに「まず根拠を述べてから結論を出す」ステップを含め、結論だけを出させない。`eval/lib/llm-judge.ts` の `COT_INSTRUCTION` を各 judge プロンプトの末尾に付与し、Structured Output のフィールド順も `reasoning → verdict → score` に固定する(`propertyOrdering` で Gemini API に順序を明示)。
3. **Structured Output 強制**: judge の出力は zod スキーマで構造化し(`buildJudgeSchema()`)、`generationConfig.responseSchema`(OpenAPI subset)として Gemini API に渡す。自由文からの正規表現抽出のような脆い方法で結論を取り出さない。
4. **安全性クリティカルな判定は複数 judge の多数決**とする(単一 judge の誤判定によるゲート誤動作を避ける)。実装したのは④の「診断表現の意味的評価」のみ(プロンプトを3種類の言い回しに変奏して3回判定 → `majorityVote()` で多数決)。**危機介入検知・注入検知の正誤判定には LLM judge 自体を追加していない**(上記「なぜ LLM judge を追加しないか」参照。これらは見逃しゼロを機械的に保証する `eval/safety.eval.ts` のゲートのまま)。
5. **診断表現評価は3段構成**とする(NFR-75, AC-5):
   1. 機械スクリーニング(`eval/safety.eval.ts` ①、常時 CI で実行)
   2. **LLM judge(実装済み、④参照)**: `eval/judge.eval.ts` の診断表現 judge(3judge多数決)。上記1〜4の規約に従う。
   3. **5〜10%の人手サンプル検証**: CI では自動化しない運用手順とする。目安として、月次で本番/ステージングの AI 出力ログ(NFR-36 により本文はログ保存しないため、該当がある場合は同意を得た上での別途保存の仕組みが必要になる点に留意)または結合テスト時の出力サンプルから 5〜10% を抽出し、人手でレビューして禁止語スクリーニング・LLM judge の双方が見逃していないかを確認する。実施記録は運用チームのレビューログ(本リポジトリ外、またはドキュメント化される専用の運用ログ)に残す。

## 実装メモ

- `eval/*.eval.ts` は Node 24 のネイティブ TypeScript 実行(型ストリッピングのみ、型チェックは行わない)で動く。ただしパスエイリアス(`@/*`)・拡張子省略の相対 import はバンドラ/vitest(esbuild)の機能であり Node 単体では解決できないため、`eval/lib/ts-loader.mjs`(ESM resolve hook)が `@/*` → `src/*` の解決と拡張子補完を行う。これにより `src/**` の既存ロジック(`fact-guard.ts`/`output-guard.ts`/`crisis-detection.ts`/`facility-search.ts`/`facility-recommend.ts` 等)を一切改変せずそのまま import できる。
- D1 へのアクセスは `eval/lib/d1.ts`(`wrangler d1 execute --local|--remote --json` を子プロセス実行。既定 `--local`、`EVAL_D1_REMOTE=1` で `--remote`)経由。`eval/lib/d1-shim.ts` はこれを `D1Database.prepare().bind().all()` 互換のシムとして包み、`searchFacilities`/`fetchFacilitiesByIds`(本番コード)をそのまま呼び出せるようにしている。
- 検索精度評価の評価対象経路(ローカル Qdrant/Ollama・タグフォールバック・本番 Vectorize/Workers AI のどれを使うか)は `eval/lib/eval-target.ts` に集約している(`EVAL_TARGET` 環境変数)。本番経路は `eval/lib/rest-workers-ai-embedder.ts`/`eval/lib/rest-vectorize-store.ts`(Cloudflare REST API を直接叩く `Embedder`/`VectorStore` 実装)を使う。`src/lib/ai/**` の本番コード(`embedder.ts`/`vector-store.ts`/各 provider)は一切変更していない。
- `eval/metrics.ts`(Precision@K/Recall@K/MRR/`recallAtKCapped`/`municipalityHitRateAtK` の純関数)・`eval/lib/eval-target.ts` の `EVAL_TARGET` 分岐ロジックのみ `vitest`(`eval/metrics.test.ts`・`eval/lib/eval-target.test.ts`)でユニットテストする(REST アダプタ自体はネットワーク依存のため単体テスト化していない)。`eval/*.eval.ts` 自体は品質測定の実行スクリプトでありユニットテストではないため、`npm run test` の対象外(`npm run eval` で別途実行する)。
- `eval/lib/generate-golden.ts`(`npm run eval:golden:generate`)は、`eval/fixtures/query-templates.json`(手書きクエリテンプレート)と D1 の `facilities`/`facility_tags` から `eval/fixtures/retrieval-golden.generated.json` をスナップショット生成する。`eval/retrieval.eval.ts` はこのファイルが存在すれば読み込んで評価し(`runGeneratedGolden`)、存在しなければその旨をレポートに記載して評価をスキップする(`npm run eval` 自体は失敗させない)。生成ロジック自体のユニットテストは設けていない(D1 アクセスを含むため `eval/*.eval.ts` と同じ扱い。決定的な選択ロジック(`resolveTemplatesPerCombo`/`pickTemplatesForCombo`)・正解判定ロジック(`matchesGoldenCondition`)は純関数として切り出してあるため、将来ユニットテスト化する場合はここを対象にするとよい)。
- `eval/lib/llm-judge.ts`(LLM-as-judge の共通ヘルパー)は `createLlmClient("vertex-gateway")`(`src/lib/ai/llm-client.ts`)を Node 単体プロセスから直接呼び出す(`process.env` 経由の設定読み込みで動く設計)。`assertRealLlmProvider()`・`buildJudgeSchema()`・`majorityVote()` は外部通信を伴わない純粋なロジックのため `eval/lib/llm-judge.test.ts` でユニットテストする(`runJudge()` は `fetch` をモックしてテストし、実際の Vertex AI への往復はしない)。`eval/judge.eval.ts` 自体は他の `*.eval.ts` と同じく品質測定の実行スクリプトのため `npm run test` の対象外。
- `src/lib/ai/llm-client.ts`(`LlmGenerateOptions.responseSchema`)・`src/lib/ai/providers/vertex-llm-client.ts`(`buildVertexRequestBody`)に Structured Output(Gemini API `generationConfig.responseMimeType`/`responseSchema`)対応を追加した(TICKET-0024 AC-4)。`responseSchema` 未指定時の挙動は一切変わらない(opt-in の追加のみ、既存の `/api/summarize`・`/api/recommend` は指定しない)。zod スキーマから Gemini 用 `responseSchema`(OpenAPI subset)への変換は `eval/lib/llm-judge.ts`(`buildJudgeSchema()`)側の責務とし、`src/` 側は素のオブジェクトを `generationConfig` にそのまま渡すだけのシンプルな実装に留めている。
