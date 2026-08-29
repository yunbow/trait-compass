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
 */
async function deleteStaleFacilities(
  db: D1Database,
  datasetId: string,
  currentIds: readonly string[],
): Promise<void> {
  const { results } = await db
    .prepare(`SELECT id AS id FROM facilities WHERE dataset_id = ?1`)
    .bind(datasetId)
    .all<{ id: string }>();

  const currentIdSet = new Set(currentIds);
  const staleIds = (results ?? []).map((row) => row.id).filter((id) => !currentIdSet.has(id));
  if (staleIds.length === 0) return;

  for (let start = 0; start < staleIds.length; start += MAX_IDS_PER_QUERY) {
    const chunk = staleIds.slice(start, start + MAX_IDS_PER_QUERY);
    const placeholders = chunk.map(() => "?").join(", ");
    await db.batch([
      db.prepare(`DELETE FROM facility_tags WHERE facility_id IN (${placeholders})`).bind(...chunk),
      db.prepare(`DELETE FROM facilities WHERE id IN (${placeholders})`).bind(...chunk),
    ]);
  }
}

/**
 * db/schema.sql の facilities テーブルへ UPSERT する(バッチ実行)。
 * facility_tags(相談分野タグ)は TICKET-0013 でタグ語彙確定後に投入する想定のため、
 * 本 Worker では扱わない(意図的なスコープ外。ただし削除同期(上記 deleteStaleFacilities)は
 * facility_tags の外部キー制約に抵触しないよう先に消す必要があるため例外的に扱う)。
 */
export async function upsertFacilities(
  db: D1Database,
  datasetId: string,
  facilities: readonly NormalizedFacility[],
): Promise<void> {
  if (facilities.length === 0) return;

  await deleteStaleFacilities(db, datasetId, facilities.map((facility) => facility.id));

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
