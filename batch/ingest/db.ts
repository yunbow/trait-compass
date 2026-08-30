// D1 UPSERT ヘルパー(datasets / facilities)。
//
// D1Database バインディングへの実アクセスを伴うため、vitest ではテストしない
// (統合テストは `wrangler dev` のローカル D1 で行う。テスト観点は TICKET-0011 の
// テスト観点「統合テスト」を参照)。SQL 文の組み立てはシンプルな UPSERT のみに留め、
// 分岐ロジックは workers/ingest/transform.ts・workers/ingest/ckan.ts 側の純関数に寄せている。

import type { DatasetConfig } from "./datasets.config";
import type { LicenseClassification } from "../../app/src/features/data-ingest/services/licenseClassifier";
import type { NormalizedFacility } from "./transform";

export interface DatasetRow {
  id: string;
  ckanPackageId: string | null;
  title: string;
  sourceOrg: string;
  license: string;
  riskLevel: "low" | "medium" | "high";
  sourceUrl: string | null;
  fetchedAt: string;
  freshnessNote: string | null;
  /** 0 = 死活監視で不達を検知(FR-029)。 */
  isAlive: 0 | 1;
  /** 1 = 更新終了データセット(FR-034 AC-6、TICKET-0033)。DatasetConfig.frozen と対応する。 */
  frozen: 0 | 1;
}

/** dataset の UPSERT 用の行データを組み立てる(純関数)。 */
export function buildDatasetRow(params: {
  dataset: DatasetConfig;
  license: LicenseClassification;
  fetchedAt: string;
  sourceUrl: string | null;
  notes: string[];
  isAlive: 0 | 1;
}): DatasetRow {
  const { dataset, license, fetchedAt, sourceUrl, notes, isAlive } = params;
  return {
    id: dataset.id,
    ckanPackageId: dataset.ckanPackageId,
    title: dataset.title,
    sourceOrg: dataset.sourceOrg,
    license: dataset.license,
    riskLevel: license.riskLevel,
    sourceUrl,
    fetchedAt,
    freshnessNote: notes.length > 0 ? notes.join(" ") : null,
    isAlive,
    // frozen-meta-only / license-hold / 通常取込のどの経路でも、datasets.config.ts の
    // frozen 指定をそのまま D1 に反映する(支援情報案内画面の更新終了注記の表示判定に使う)。
    frozen: (dataset.frozen ?? false) ? 1 : 0,
  };
}

/** db/schema.sql の datasets テーブルへ UPSERT する。 */
export async function upsertDataset(db: D1Database, row: DatasetRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO datasets (
         id, ckan_package_id, title, source_org, license, risk_level,
         source_url, fetched_at, freshness_note, is_alive, frozen, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(id) DO UPDATE SET
         ckan_package_id = excluded.ckan_package_id,
         title = excluded.title,
         source_org = excluded.source_org,
         license = excluded.license,
         risk_level = excluded.risk_level,
         source_url = excluded.source_url,
         fetched_at = excluded.fetched_at,
         freshness_note = excluded.freshness_note,
         is_alive = excluded.is_alive,
         frozen = excluded.frozen,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(
      row.id,
      row.ckanPackageId,
      row.title,
      row.sourceOrg,
      row.license,
      row.riskLevel,
      row.sourceUrl,
      row.fetchedAt,
      row.freshnessNote,
      row.isAlive,
      row.frozen,
    )
    .run();
}

/** D1 の SQL 変数上限を超えないよう、IN 句へ渡す ID 数の上限(facility-search.ts の MAX_IDS_PER_QUERY と同じ方針)。 */
const MAX_IDS_PER_QUERY = 90;

/**
 * 2026-08是正(外部コードレビュー指摘): CKAN取込はこれまでUPSERTのみで、配信元で削除・
 * 名称変更(=IDが変わる、`transform.ts` の `stableFacilityId` は name+address のハッシュ)された
 * 施設が古いIDのままD1に残り続けていた。今回の取込で該当データセットの facilities に
 * 存在しなくなったIDを検出し、facility_tags → facilities の順で削除する(手動調査再投入
 * (`ingest-manual-survey.mjs`)・オープンデータ取込(`ingest-open-data.mjs`)の
 * DELETE→INSERT パターンと揃える)。呼び出し元(`processDataset`)は `facilities.length === 0`
 * の場合はこの関数自体を呼ばない(正規化が0件になった異常時に既存の正常なデータを
 * 巻き込んで全削除してしまわないため。その場合は `is_alive=0` で不健全扱いにするだけに留める)。
 *
 * 2026-08是正(外部コードレビュー指摘 項目1): 削除した facility_id は Vectorize 側のベクトルも
 * 削除対象になる(`workflow.ts` の `runEmbeddingStep` 参照)。この削除処理自体は D1 の
 * facilities/facility_tags 削除と同一の `db.batch`(アトミック)に含め、`pending_vector_deletions`
 * (outbox、migration 0036)へ記録する。VectorStore.delete が(リトライを使い果たすなどで)
 * 失敗しても、この outbox には残り続けるため、次回以降の埋め込みステップ実行時に自動的に
 * リトライされる(戻り値の `staleIds` を Workflow 実行結果の情報表示に使う従来の用途とは独立)。
 */
async function deleteStaleFacilities(
  db: D1Database,
  datasetId: string,
  currentIds: readonly string[],
): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT id AS id FROM facilities WHERE dataset_id = ?1`)
    .bind(datasetId)
    .all<{ id: string }>();

  const currentIdSet = new Set(currentIds);
  const staleIds = (results ?? []).map((row) => row.id).filter((id) => !currentIdSet.has(id));
  if (staleIds.length === 0) return [];

  for (let start = 0; start < staleIds.length; start += MAX_IDS_PER_QUERY) {
    const chunk = staleIds.slice(start, start + MAX_IDS_PER_QUERY);
    const placeholders = chunk.map(() => "?").join(", ");
    const pendingDeletionPlaceholders = chunk.map(() => "(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))").join(", ");
    await db.batch([
      db.prepare(`DELETE FROM facility_tags WHERE facility_id IN (${placeholders})`).bind(...chunk),
      db.prepare(`DELETE FROM facilities WHERE id IN (${placeholders})`).bind(...chunk),
      db
        .prepare(`INSERT OR IGNORE INTO pending_vector_deletions (facility_id, deleted_at) VALUES ${pendingDeletionPlaceholders}`)
        .bind(...chunk),
    ]);
  }
  return staleIds;
}

/**
 * 1回のWorkflow実行(埋め込みステップ)で処理する `pending_vector_deletions` 件数の上限。
 * `workflow.ts` の `runEmbeddingStep` は取得した ID を `VECTORIZE_DELETE_CHUNK_SIZE`(500件)
 * ごとのチャンクに分割して削除するため、上限を大きくし過ぎなければ何チャンクでも処理できるが、
 * `EMBED_STEP_CONFIG` のタイムアウト("2 minutes")内に収める安全弁として上限を設ける
 * (5,000件 ÷ 500件 = 10チャンク程度であれば十分収まる想定)。この上限を超えた分は今回の
 * Workflow 実行では処理されず、`pending_vector_deletions` に残ったままになるが、
 * 次回の Workflow 実行で `fetchPendingVectorDeletionIds` が再度呼ばれた際に続きから
 * 自動的に処理される(既存の自己修復設計と整合、`clearPendingVectorDeletions` が処理済み分
 * だけを都度取り除くため取りこぼしは無い)。
 */
const MAX_PENDING_DELETIONS_PER_RUN = 5000;

/**
 * `pending_vector_deletions`(Vectorize 削除同期用の outbox、migration 0036)の行の
 * facility_id を取得する(`workflow.ts` の `runEmbeddingStep` が毎回読み取り、リトライ対象
 * にする自己修復設計のため、今回のWorkflow実行に限らず過去の失敗分も含めて対象になる)。
 *
 * 2026-08是正(poison queue対策): 1回のWorkflow実行で処理する件数には `MAX_PENDING_
 * DELETIONS_PER_RUN` の上限があり、outbox の行数がそれを超える場合は `LIMIT` により
 * 一部のみを返す(全件返すわけではない)。超過分は次回以降のWorkflow実行で自動的に続きから
 * 処理されるため、取りこぼしにはならない(詳細は `MAX_PENDING_DELETIONS_PER_RUN` のコメント参照)。
 *
 * 2026-08是正(オーケストレーターレビュー指摘、クロス実行エッジケース): 「facilities に現存する
 * facility_id は削除済みではあり得ない」という不変条件(`ingest-manual-survey.mjs` の
 * buildSql 末尾で同様に使っている整理と同じ)を、Worker 側でも守る必要がある。
 *
 * 誤削除シナリオ: (1) 実行 N で facility X が削除され outbox に記録される。(2) `VectorStore.delete`
 * が失敗する(または outbox 反映後に別経路の取込が走る)ため outbox に X が残る。(3) 実行 N+1 で
 * 同一内容の facility X が同じ内容ハッシュ id で再作成される(`upsertFacilities` は outbox を
 * 一切触らない)。(4) 実行 N+1 の `runEmbeddingStep` が embed pipeline の全件 upsert
 * (facilities 全件を再 upsert、X の生きたベクトルもここで書き込まれる)の**後**に outbox 全行を
 * 削除対象として `VectorStore.delete` してしまうと、直前に upsert した X の生きたベクトルを
 * 削除してしまう(次回の全件再 upsert まで検索結果からベクトルが欠落する)。
 *
 * このため、SELECT の**前**に facilities に現存する facility_id の outbox 行を先に取り除く
 * (「復活」した facility を outbox から purge する)。この purge は何度実行しても結果が変わらない
 * (冪等)ため、Cloudflare Workflows のリプレイ安全性にも問題ない。purge を行わないと、
 * 一度でも復活した facility_id の outbox 行が永久に残り続け(`clearPendingVectorDeletions` は
 * 呼び出し元が明示的に渡した ID しか消さないため)outbox が肥大化する問題も同時に解消する。
 */
export async function fetchPendingVectorDeletionIds(db: D1Database): Promise<string[]> {
  await db
    .prepare(`DELETE FROM pending_vector_deletions WHERE facility_id IN (SELECT id FROM facilities)`)
    .run();

  const { results } = await db
    .prepare(`SELECT facility_id AS id FROM pending_vector_deletions LIMIT ?1`)
    .bind(MAX_PENDING_DELETIONS_PER_RUN)
    .all<{ id: string }>();
  return (results ?? []).map((row) => row.id);
}

/**
 * `VectorStore.delete` が成功した facility_id を `pending_vector_deletions` から取り除く
 * (呼び出し元は削除に成功した ID だけを渡すこと。失敗した ID を渡すと outbox からリトライ機会が
 * 失われてしまうため、成功が確認できた場合のみ呼ぶこと)。
 */
export async function clearPendingVectorDeletions(db: D1Database, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  for (let start = 0; start < ids.length; start += MAX_IDS_PER_QUERY) {
    const chunk = ids.slice(start, start + MAX_IDS_PER_QUERY);
    const placeholders = chunk.map(() => "?").join(", ");
    await db.prepare(`DELETE FROM pending_vector_deletions WHERE facility_id IN (${placeholders})`).bind(...chunk).run();
  }
}

/**
 * db/schema.sql の facilities テーブルへ UPSERT する(バッチ実行)。
 * facility_tags(相談分野タグ)は TICKET-0013 でタグ語彙確定後に投入する想定のため、
 * 本 Worker では扱わない(意図的なスコープ外。ただし削除同期(上記 deleteStaleFacilities)は
 * facility_tags の外部キー制約に抵触しないよう先に消す必要があるため例外的に扱う)。
 *
 * 戻り値は `deleteStaleFacilities` が削除した facility ID の一覧(削除なしなら空配列)。
 * 呼び出し元(workers/ingest/workflow.ts の `processDataset`)はこれを Vectorize 側の
 * ベクトル削除同期(`VectorStore.delete`)に使う。
 */
export async function upsertFacilities(
  db: D1Database,
  datasetId: string,
  facilities: readonly NormalizedFacility[],
): Promise<string[]> {
  if (facilities.length === 0) return [];

  const deletedFacilityIds = await deleteStaleFacilities(db, datasetId, facilities.map((facility) => facility.id));

  const statements = facilities.map((facility) =>
    db
      .prepare(
        `INSERT INTO facilities (
           id, dataset_id, name, category_type, municipality, municipality_code, address, phone, url,
           age_range, is_medical, is_out_of_scope, description, contact_methods, facility_subtype, lifestage_min, lifestage_max, lat, lng, raw_json, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           category_type = excluded.category_type,
           municipality = excluded.municipality,
           municipality_code = excluded.municipality_code,
           address = excluded.address,
           phone = excluded.phone,
           url = excluded.url,
           age_range = excluded.age_range,
           is_medical = excluded.is_medical,
           is_out_of_scope = excluded.is_out_of_scope,
           description = excluded.description,
           contact_methods = excluded.contact_methods,
           facility_subtype = excluded.facility_subtype,
           lifestage_min = excluded.lifestage_min,
           lifestage_max = excluded.lifestage_max,
           -- 緯度経度列を持たない既存データセットの再取込では、過去のジオコーディング結果を維持する。
           -- CSV で直接指定された有効な座標がある場合だけ、その値を優先して更新する。
           lat = COALESCE(excluded.lat, lat),
           lng = COALESCE(excluded.lng, lng),
           raw_json = excluded.raw_json,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .bind(
        facility.id,
        datasetId,
        facility.name,
        facility.categoryType,
        facility.municipality,
        facility.municipalityCode,
        facility.address,
        facility.phone,
        facility.url,
        facility.ageRange,
        facility.isMedical ? 1 : 0,
        facility.isOutOfScope ? 1 : 0,
        facility.description,
        facility.contactMethods,
        facility.facilitySubtype,
        facility.lifestageMin,
        facility.lifestageMax,
        facility.lat,
        facility.lng,
        facility.rawJson,
      ),
  );

  await db.batch(statements);
  return deletedFacilityIds;
}

// ============================================================
// ジオコーディング(FR-02A、TICKET-0028)
// ============================================================
// D1Database バインディングへの実アクセスを伴うため、ファイル冒頭の方針どおり vitest では
// テストしない(workers/ingest/geocoding.ts 側の純関数でパース・スロットル処理をテストする)。

export interface FacilityGeocodeTarget {
  id: string;
  address: string;
}

/**
 * ジオコーディング対象(address はあるが lat が未設定 = 未ジオコーディングまたは前回失敗)の
 * facilities を取得する。lat/lng の両方が設定済みの行は直接マッピング済みまたは
 * ジオコーディング済みとして対象から外れるため、
 * 再取込(cron 実行)のたびに全件を叩き直すことはない。
 */
export async function fetchFacilitiesNeedingGeocode(db: D1Database): Promise<FacilityGeocodeTarget[]> {
  const { results } = await db
    .prepare(`SELECT id AS id, address AS address FROM facilities WHERE address IS NOT NULL AND (lat IS NULL OR lng IS NULL)`)
    .all<{ id: string; address: string }>();
  return results ?? [];
}

/**
 * ジオコーディング結果を facilities.lat/lng へ反映する。`latLng` が null(ジオコーディング失敗)の
 * 場合は何もしない(既存の NULL のまま据え置き、次回実行時に再度対象になる)。
 */
export async function updateFacilityLatLng(
  db: D1Database,
  id: string,
  latLng: { lat: number; lng: number } | null,
): Promise<void> {
  if (!latLng) return;
  await db
    .prepare(
      `UPDATE facilities SET lat = ?1, lng = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?3`,
    )
    .bind(latLng.lat, latLng.lng, id)
    .run();
}
