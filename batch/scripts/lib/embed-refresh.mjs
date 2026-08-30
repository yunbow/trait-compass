/**
 * ローカル取込スクリプト(ingest-open-data.mjs / ingest-manual-survey.mjs)向けの、
 * D1 SQL 適用に伴う Qdrant 埋め込みリフレッシュの共通処理(2026-08、Vectorize/Qdrant 削除同期対応)。
 *
 * `.mjs` から batch/ingest/*.ts(runEmbedPipeline 等)を直接 import できないため、ローカルでは
 * 既存の `POST /embed`(`npm run ingest:dev` で起動する wrangler dev ワーカー、
 * batch/ingest/index.ts の handleManualEmbed)を HTTP 経由で再利用する方針(design方針、変更不可)。
 *
 * 呼び出し元(ingest-open-data.mjs / ingest-manual-survey.mjs)の想定フロー:
 *   1. SQL 適用前に `captureFacilityIdsBeforeApply` で対象 dataset の既存 facility ID を控える。
 *   2. 既存の SQL 適用処理(wrangler d1 execute --local/--remote)をそのまま実行する。
 *   3. --local かつ SQL 適用が全て成功した場合のみ `finishLocalEmbedRefresh` を呼ぶ
 *      (事後 ID 取得 → 差分計算 → POST /embed → 結果ログ/失敗時の案内)。
 *   4. --remote の場合は SQL 成功後に `buildRemoteEmbedGuidance` のメッセージを表示するのみ
 *      (D1 への追加クエリは行わない)。
 *
 * このモジュールの関数はいずれも「埋め込みリフレッシュの失敗で呼び出し元スクリプトの
 * exit code を汚さない」設計(finishLocalEmbedRefresh は内部で例外を握りつぶし、常に
 * 案内メッセージのログ出力で completes する)。SQL 適用自体の成否判定は呼び出し元の責務。
 */
import { spawnSync as defaultSpawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const DEFAULT_WRANGLER_PATH = join(projectRoot, "node_modules", ".bin", "wrangler");
// `wrangler d1 execute <database-name>` は cwd から wrangler.toml/wrangler.jsonc を探索するが、
// batch/ にはそれらが無い(wrangler.ingest.toml のみ)ため既定探索では見つからない(batch/ から
// 素の `wrangler d1 execute trait-compass --local` を叩くと "Couldn't find a D1 DB with the
// name or binding 'trait-compass'" で失敗することを実機確認済み)。report-review.mjs と同じく
// database_name="trait-compass" を宣言している wrangler.ingest.toml を明示的に指定する。
export const DEFAULT_WRANGLER_CONFIG_PATH = join(projectRoot, "batch", "wrangler.ingest.toml");

/** `npm run ingest:dev`(wrangler dev -c wrangler.ingest.toml)の既定ポート(wrangler の既定値)。 */
export const DEFAULT_INGEST_DEV_URL = "http://127.0.0.1:8787";

/** ローカル dev ワーカーの URL を環境変数 `INGEST_DEV_URL` で上書き可能にする。 */
export function resolveIngestDevUrl(env = process.env) {
  return env.INGEST_DEV_URL || DEFAULT_INGEST_DEV_URL;
}

/** SQL リテラルとして安全に扱える文字列へ変換する(他スクリプトの `value()` と同じ方針)。 */
function sqlStringLiteral(input) {
  return `'${String(input).replaceAll("'", "''")}'`;
}

/**
 * 指定した dataset ID群に紐づく facility の id を取得する SELECT 文を組み立てる純関数。
 * `datasetIds` が空の場合は null を返す(呼び出し元でクエリ自体をスキップする合図)。
 */
export function buildFacilityIdsSelectSql(datasetIds) {
  if (!datasetIds || datasetIds.length === 0) return null;
  const placeholders = datasetIds.map(sqlStringLiteral).join(", ");
  return `SELECT id FROM facilities WHERE dataset_id IN (${placeholders})`;
}

/**
 * `wrangler d1 execute --json` の標準出力をパースし、facility id の配列を取り出す純関数。
 * wrangler の `--json` 出力は `[{ results: [...], success: true, meta: {...} }, ...]` 形式
 * (複数 SQL 文を1回で投げた場合は配列の要素が増える)。各 `results` 行の `id` 列(このモジュールの
 * SELECT は `SELECT id` のため列名は常に `id`)を集約する。
 */
export function parseWranglerSelectIds(rawStdout) {
  let parsed;
  try {
    parsed = typeof rawStdout === "string" ? JSON.parse(rawStdout) : rawStdout;
  } catch (error) {
    throw new Error(`wrangler --json 出力の JSON 解析に失敗しました: ${error instanceof Error ? error.message : error}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("wrangler --json 出力の形式が不正です(トップレベルが配列ではありません)。");
  }

  const ids = [];
  for (const entry of parsed) {
    const results = entry && Array.isArray(entry.results) ? entry.results : [];
    for (const row of results) {
      if (row && typeof row.id === "string") ids.push(row.id);
    }
  }
  return ids;
}

/**
 * `wrangler d1 execute trait-compass --local --json --command "..."` を実行し、
 * 対象 dataset 群に紐づく既存 facility id を取得する(副作用関数、spawnSync 差し替え可能)。
 * `datasetIds` が空の場合は spawnSync を呼ばず空配列を返す。
 * spawnSync 自体の失敗(バイナリ不在等)・非0終了・JSON 解析失敗はいずれも例外を投げる
 * (呼び出し元でこの関数を try/catch し、埋め込みリフレッシュ全体を失敗させずに握りつぶす)。
 */
export function queryFacilityIds({
  datasetIds,
  wranglerPath = DEFAULT_WRANGLER_PATH,
  wranglerConfigPath = DEFAULT_WRANGLER_CONFIG_PATH,
  spawnSyncImpl = defaultSpawnSync,
}) {
  const sql = buildFacilityIdsSelectSql(datasetIds);
  if (sql === null) return [];

  const result = spawnSyncImpl(
    wranglerPath,
    ["d1", "execute", "trait-compass", "--local", "-c", wranglerConfigPath, "--json", "--command", sql],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `wrangler d1 execute --json が失敗しました(status=${result.status}): ${result.stderr ?? ""}`.trim(),
    );
  }
  return parseWranglerSelectIds(result.stdout);
}

/**
 * SQL 適用前後の facility id 一覧を比較し、削除された(before にはあるが after にない)id を返す純関数。
 */
export function computeStaleIds(beforeIds, afterIds) {
  const afterSet = new Set(afterIds);
  return beforeIds.filter((id) => !afterSet.has(id));
}

/**
 * SQL 適用**前**に、対象 dataset 群の既存 facility id を控える(失敗しても例外を投げず、
 * 警告ログを出して空配列を返す)。ここで取得に失敗した場合、事後比較で「削除ゼロ」と
 * 判定される(= 今回の削除同期を見逃す)だけで、誤って無関係な id を削除対象にはしない
 * 安全側のフォールバック。
 */
export function captureFacilityIdsBeforeApply({
  datasetIds,
  wranglerPath = DEFAULT_WRANGLER_PATH,
  wranglerConfigPath = DEFAULT_WRANGLER_CONFIG_PATH,
  spawnSyncImpl = defaultSpawnSync,
  warn = console.warn,
}) {
  try {
    return queryFacilityIds({ datasetIds, wranglerPath, wranglerConfigPath, spawnSyncImpl });
  } catch (error) {
    warn(
      `埋め込み削除同期用の事前 facility ID 取得に失敗したため、今回は削除同期をスキップします: ${error instanceof Error ? error.message : error}`,
    );
    return [];
  }
}

/** `POST {devUrl}/embed` を呼び出す(fetch 差し替え可能)。非OKレスポンスは例外を投げる。 */
export async function postEmbedRefresh({ devUrl, deleteFacilityIds = [], fetchImpl = fetch }) {
  const response = await fetchImpl(`${devUrl}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deleteFacilityIds }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`POST ${devUrl}/embed failed: ${response.status} ${response.statusText} ${detail}`.trim());
  }
  return response.json();
}

/**
 * dev ワーカー未起動・POST 失敗時にユーザーへ表示する案内メッセージを組み立てる純関数。
 * 削除対象 ID があれば、それを含む curl コマンド例を出力する。
 */
export function buildEmbedRefreshFailureGuidance({ devUrl, deleteFacilityIds = [] }) {
  const body = JSON.stringify({ deleteFacilityIds });
  return [
    "埋め込みが更新されていません。`npm run ingest:dev` でワーカーを起動後、以下を実行してください:",
    `  curl -X POST ${devUrl}/embed -H 'content-type: application/json' -d '${body}'`,
  ].join("\n");
}

/**
 * `--remote` 実行時、SQL 適用成功後に表示する案内メッセージを組み立てる純関数
 * (D1 への追加クエリは行わない。本番の埋め込み更新方法・削除ベクトルの同期を案内する)。
 *
 * 2026-08是正(外部コードレビュー指摘 項目1): 削除された施設のベクトルは、以前は
 * 「Vectorize に残留するため手動削除が必要」という誤った(=実際には自動化されていない)
 * 案内をしていた。ingest-open-data.mjs / ingest-manual-survey.mjs が生成する SQL は、
 * facilities を削除する箇所で `pending_vector_deletions`(outbox、migration 0036)へ
 * 削除対象 facility_id を記録するようになったため、本番の CKAN 取込 Worker
 * (EMBEDDINGS_ENABLED=true)の次回実行時に `runEmbeddingStep` がこの outbox を読み取り、
 * 自動的に Vectorize から削除する(手動削除は不要になった)。
 */
export function buildRemoteEmbedGuidance({ deleteFacilityIds = [] } = {}) {
  const lines = [
    "本番の埋め込み(Vectorize)はこのスクリプトでは自動更新されません。",
    "本番埋め込みは CKAN 取込 Worker(EMBEDDINGS_ENABLED)の次回実行時に facilities が全件再 upsert されます。",
    "既存の `POST /embed` は Ollama + Qdrant 専用のローカル開発用エンドポイントであり、Workers AI / Vectorize には使用できません。",
    // --remote では D1 への追加クエリ(事前/事後の facility ID 比較)を行わないため、このスクリプトの
    // 実行で施設が削除されたかどうかはこのメッセージ自体からは特定できない
    // (deleteFacilityIds が判明している場合のみ、具体的な ID を追記する)。削除同期自体は
    // D1 側の pending_vector_deletions への記録により既に完了している。
    "このスクリプトの実行で削除された施設がある場合も、削除IDは pending_vector_deletions テーブルに記録済みのため、CKAN 取込 Worker の次回実行時に自動的に Vectorize から削除されます(手動削除は不要です)。",
  ];
  if (deleteFacilityIds.length > 0) {
    lines.push(
      `今回削除された ${deleteFacilityIds.length} 件の施設 ID: ${deleteFacilityIds.join(", ")}`,
    );
  }
  return lines.join("\n");
}

/**
 * `--local` 実行時、SQL 適用が全て成功した後に呼ぶ(SQL 適用**後**の事後 facility ID 取得 →
 * 削除同期 ID の算出 → `POST /embed` → 結果ログ出力までを行う)。
 *
 * この関数自体は例外を投げない(dev ワーカー未起動・fetch 失敗・事後 ID 取得失敗のいずれも
 * 案内メッセージのログ出力に倒す)。埋め込みリフレッシュの失敗によって、既に成功している
 * D1 側の取込結果を exit code レベルで失敗扱いにしないための設計(呼び出し元スクリプトの
 * 既存の exit code 管理を壊さない)。
 */
export async function finishLocalEmbedRefresh({
  datasetIds,
  beforeIds,
  wranglerPath = DEFAULT_WRANGLER_PATH,
  wranglerConfigPath = DEFAULT_WRANGLER_CONFIG_PATH,
  spawnSyncImpl = defaultSpawnSync,
  devUrl,
  fetchImpl = fetch,
  log = console.log,
  warn = console.warn,
}) {
  const resolvedDevUrl = devUrl ?? resolveIngestDevUrl();

  let deleteFacilityIds = [];
  try {
    const afterIds = queryFacilityIds({ datasetIds, wranglerPath, wranglerConfigPath, spawnSyncImpl });
    deleteFacilityIds = computeStaleIds(beforeIds, afterIds);
  } catch (error) {
    warn(
      `埋め込み削除同期用の事後 facility ID 取得に失敗したため、今回は削除同期をスキップします(埋め込み自体の更新は続行します): ${error instanceof Error ? error.message : error}`,
    );
  }

  try {
    const result = await postEmbedRefresh({ devUrl: resolvedDevUrl, deleteFacilityIds, fetchImpl });
    log(
      `埋め込みを更新しました(facilityCount=${result.facilityCount ?? "?"}, batchCount=${result.batchCount ?? "?"}, deletedVectors=${result.deletedVectors ?? 0})。`,
    );
    return { ok: true, result };
  } catch (error) {
    warn(buildEmbedRefreshFailureGuidance({ devUrl: resolvedDevUrl, deleteFacilityIds }));
    return { ok: false, error: error instanceof Error ? error.message : String(error), deleteFacilityIds };
  }
}
