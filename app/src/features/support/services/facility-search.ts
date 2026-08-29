// 支援情報検索(TICKET-0015, FR-024〜FR-027)。
//
// D1(facilities × datasets × facility_tags)から相談窓口・支援制度・福祉ガイド・発達障害支援
// 資料を検索する。SQL の絞り込み(医療機関除外・年齢一致・区市町村一致 or 広域)は D1 側の
// WHERE で行い、フォールバック判定・タグ優先ソート・タブ別グループ化は D1 アクセスを含まない
// 純関数として切り出す(NFR-72: 純関数を単体テストで担保する)。
//
// SQL はすべてバインドパラメータ(`?`)を通じて値を渡し、ユーザー入力(区市町村・年齢区分・
// facility id)を文字列結合でクエリに埋め込まない(Zero Trust の方針)。

import type { D1Database } from "@cloudflare/workers-types";

import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import type { CategoryType } from "@/features/support/constants/category-types";
import type { AgeGroup } from "@/features/support/schema/age-group";
import { lifestageToOrdinal } from "@/features/support/services/lifestage-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import { BROAD_AREA_MUNICIPALITY_CODE, municipalityToCode } from "@/features/support/constants/municipality-codes";

/** 広域(都全域)窓口の municipality 値。区市町村データ欠損時のフォールバック先(FR-022)。 */
export const BROAD_AREA_MUNICIPALITY = "東京都";

/** D1 の SQL 変数上限を超えないよう、IN 句へ渡す ID 数の上限。 */
const MAX_IDS_PER_QUERY = 90;

/** 区市町村データ欠損時のフォールバック案内文言(FR-022)。 */
export const MUNICIPALITY_DATA_MISSING_MESSAGE =
  "お住まいの区市町村のデータが見つからないため、都の広域窓口を表示しています。";

/**
 * 不健全データセット(TICKET-0012 `getUnhealthyDatasets`)検知時、当該分野の縮退表示で
 * 表示する案内文言(TICKET-0033 AC-3)。広域窓口テーブルを新設せず、既存の
 * `municipality = '東京都'` 行(FR-022 の広域フォールバック機構)をそのまま縮退先として
 * 再利用する(オーケストレーター決定)。
 */
export const UNHEALTHY_DATASET_DEGRADE_MESSAGE =
  "この分野のデータで確認が必要な状態が続いているため、都の広域窓口のみを表示しています。最新情報は各リンク先でご確認ください。";

/**
 * 手動調査データ(個別許諾データ)の有効期限365日(src/lib/manual-data-expiration.ts)超過を
 * 検知した際の縮退表示で使う案内文言(2026-08是正)。オープンデータの再取込停止を示す
 * `UNHEALTHY_DATASET_DEGRADE_MESSAGE` とは原因が異なる(「確認が必要な状態」ではなく
 * 「調査データの有効期限が過ぎた」という事実)ため、別の文言として使い分ける。
 * 呼び出し側(src/app/support/results/page.tsx)は `getUnhealthyDatasets` の結果を
 * `kind`(open-data-unhealthy / manual-expired)で分割し、`degradeUnhealthyCategoriesToBroadArea`
 * を2回チェーン適用したうえで、2回目(手動期限切れ)の縮退カテゴリにのみこの文言を表示する。
 */
export const EXPIRED_MANUAL_DATA_DEGRADE_MESSAGE =
  "この自治体の調査データの有効期限が過ぎたため、都の広域窓口のみを表示しています。最新の情報は各リンク先でご確認ください。";

export interface FacilitySearchParams {
  ageGroup: AgeGroup;
  municipality: string;
  tags: SupportTag[];
  /** 任意。与えられた場合、age_range の粗い区分に加えて lifestage_min/max による細分絞り込みを適用する
   *  (migration 0016)。未指定(null/undefined)なら従来どおり age_range のみで判定する。 */
  lifestage?: Lifestage | null;
}

/** D1 の facilities × datasets JOIN 1行分(facility_tags 突合前)。 */
export interface FacilityRow {
  id: string;
  datasetId: string;
  name: string;
  categoryType: CategoryType;
  municipality: string;
  municipalityCode: string;
  address: string | null;
  phone: string | null;
  url: string | null;
  ageRange: "child" | "adult" | "both";
  description: string | null;
  datasetTitle: string;
  sourceOrg: string;
  license: string;
  riskLevel: "low" | "medium" | "high";
  sourceUrl: string | null;
  /** CSV の「大分類」列由来の行単位サブタイプ。空・未設定時はデータセット既定値へフォールバックし、対象外の取込元は NULL。 */
  facilitySubtype: string | null;
  /** ジオコーディング済みの緯度経度(FR-02A、TICKET-0028)。未ジオコーディング・住所無しは null。 */
  lat: number | null;
  lng: number | null;
  /** データセットの取得(fetch)日時(ISO 8601)。鮮度注記の算出に使う(TICKET-0033 AC-1)。 */
  fetchedAt: string;
  /** true の場合、データセットの更新が終了している(FR-034 AC-6、TICKET-0033 AC-2)。 */
  frozen: boolean;
  /**
   * 「診断がなくても相談できる」フラグ(TICKET-0050)。住所・電話等の事実情報とは異なり
   * 相談可否の性質情報のため、リスク区分による出し分け(FR-027)の対象外として扱う
   * (facility-display.ts の toFacilityDisplayData は mode によらずそのまま引き継ぐ)。
   */
  noDiagnosisOk: boolean;
  /**
   * 電話以外の連絡手段(TICKET-0051)。メール・フォーム・来所予約の有無等の軽量なテキスト。
   * 値が無い(未取込・空)場合は null。「連絡手段なし」の意味ではないため、表示側(FacilityCard)
   * は null の場合に何も描画しない(「無い」と誤読させない、AC-4)。
   */
  contactMethods: string | null;
}

/** facility_tags 突合済み。タグ一致有無を保持する(FR-024 の優先表示に使用)。 */
export interface FacilityWithTags extends FacilityRow {
  tags: string[];
  matchesTags: boolean;
}

export interface FacilitySearchResult {
  /** true の場合、区市町村データが欠損しており広域窓口のみを表示している(FR-022, AC-3)。 */
  isFallback: boolean;
  /** isFallback=true の場合のみ表示する案内文言。false の場合は null。 */
  fallbackMessage: string | null;
  /** category_type ごとにグループ化・タグ一致優先ソート済みの一覧(FR-028)。 */
  facilitiesByCategory: Record<CategoryType, FacilityWithTags[]>;
}

/**
 * facility_tags と選択タグの一致判定(純関数)。
 * タグ未指定(空配列 = 「全般」、FR-023)の場合は常に false を返す(2026-08是正: 「全般」は
 * 何にも一致していないという意味であり、タグ一致として扱うと表示側(FacilityCard の
 * 「相談分野に関連」バッジ・FacilityListSection の「まず相談する候補」区分)がすべての施設を
 * タグ一致扱いにしてしまい、実際には何も絞り込んでいないのに誤解を招く。全件を検索結果に
 * 含めること自体は searchFacilities 側の WHERE 句(タグでは絞り込まない)で既に保証されて
 * おり、本関数の返り値は表示上の優先度・バッジ判定にのみ使われるため、この変更で検索結果の
 * 件数は変わらない)。
 */
export function matchesSelectedTags(facilityTags: readonly string[], selectedTags: readonly SupportTag[]): boolean {
  if (selectedTags.length === 0) return false;
  return facilityTags.some((tag) => (selectedTags as readonly string[]).includes(tag));
}

/**
 * タグ一致を優先して安定ソートする純関数(FR-024「タグ一致を優先表示」)。
 * `Array.prototype.sort` は ES2019 以降 stable と規定されているため、一致内・不一致内の
 * 相対順序(呼び出し側の SQL `ORDER BY category_type, name`)はそのまま維持される。
 * タグ不一致の行を除外しない点が重要(「タグ不一致でも広域窓口は残す」の一般化)。
 */
export function sortByTagPriority<T extends { matchesTags: boolean }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => Number(b.matchesTags) - Number(a.matchesTags));
}

/**
 * 区市町村データ欠損判定(純関数、FR-022 AC-3)。
 * 検索結果の中に入力区市町村そのものと一致する行が1件も無い(広域 `東京都` のみが残っている、
 * または該当が0件)場合に true を返す。
 */
export function isMunicipalityDataMissing(
  rows: readonly { municipalityCode: string }[],
  targetMunicipalityCode: string,
): boolean {
  return !rows.some((row) => row.municipalityCode === targetMunicipalityCode);
}

/**
 * category_type ごとにグループ化する純関数(FR-028)。
 * CATEGORY_TYPES の4キーすべてを持つオブジェクトを返す(該当0件のタブも空配列で存在する)。
 */
export function groupByCategoryType(rows: readonly FacilityWithTags[]): Record<CategoryType, FacilityWithTags[]> {
  const grouped = Object.fromEntries(CATEGORY_TYPES.map((type) => [type, [] as FacilityWithTags[]])) as Record<
    CategoryType,
    FacilityWithTags[]
  >;
  for (const row of rows) {
    grouped[row.categoryType].push(row);
  }
  return grouped;
}

/** {@link degradeUnhealthyCategoriesToBroadArea} の戻り値。 */
export interface DegradeToBroadAreaResult<T> {
  /** 縮退適用後の分類別一覧(縮退対象外の分類は入力のままコピーを返す)。 */
  facilitiesByCategory: Record<CategoryType, T[]>;
  /** 縮退表示(広域窓口のみ)に切り替わった分類の一覧(TICKET-0033 AC-3)。 */
  degradedCategories: CategoryType[];
}

/**
 * 不健全データセット(TICKET-0012 `getUnhealthyDatasets`)検知時、当該データセットが
 * 属する分野(category_type)について、広域窓口(`municipality = '東京都'`)以外の行を
 * 除外する純関数(TICKET-0033 AC-3)。
 *
 * 広域窓口テーブルを新設せず、区市町村データ欠損時のフォールバックと同じ `municipality =
 * '東京都'` 行(FR-022)をそのまま縮退先として再利用する(オーケストレーター決定)。
 * 医療機関・対象領域外施設は元の検索 SQL(`is_medical = 0`・`is_out_of_scope = 0`)で既に
 * 除外済みのため、本関数がそれらを再混入させることはない(FR-025 の回帰なし)。
 *
 * D1 アクセスを含まない純関数(すでに category_type ごとにグループ化済みの結果に対して
 * 適用する。呼び出し側は `searchFacilities` の戻り値と `getUnhealthyDatasets` の戻り値を
 * 組み合わせて呼び出す想定、`src/app/support/results/page.tsx`)。
 */
export function degradeUnhealthyCategoriesToBroadArea<T extends { datasetId: string; municipalityCode: string }>(
  facilitiesByCategory: Readonly<Record<CategoryType, readonly T[]>>,
  unhealthyDatasetIds: ReadonlySet<string>,
): DegradeToBroadAreaResult<T> {
  const degradedCategories: CategoryType[] = [];
  const result = {} as Record<CategoryType, T[]>;

  for (const type of CATEGORY_TYPES) {
    const rows = facilitiesByCategory[type];
    const hasUnhealthyDataset =
      unhealthyDatasetIds.size > 0 && rows.some((row) => unhealthyDatasetIds.has(row.datasetId));

    if (hasUnhealthyDataset) {
      degradedCategories.push(type);
      result[type] = rows.filter((row) => row.municipalityCode === BROAD_AREA_MUNICIPALITY_CODE);
    } else {
      result[type] = [...rows];
    }
  }

  return { facilitiesByCategory: result, degradedCategories };
}

/**
 * facility_tags の突合結果(facilityId → tags)を FacilityRow へ付与する純関数。
 */
export function attachTagMatches(
  rows: readonly FacilityRow[],
  tagsByFacilityId: ReadonlyMap<string, string[]>,
  selectedTags: readonly SupportTag[],
): FacilityWithTags[] {
  return rows.map((row) => {
    const tags = tagsByFacilityId.get(row.id) ?? [];
    return { ...row, tags, matchesTags: matchesSelectedTags(tags, selectedTags) };
  });
}

/**
 * facility_tags 突合済み一覧から、フォールバック判定・タグ優先ソート・タブ別グループ化までを
 * まとめて行う純関数。SQL 実行を含まないため、D1 無しでユニットテストできる(NFR-72)。
 */
export function buildFacilitySearchResult(
  rows: readonly FacilityWithTags[],
  targetMunicipalityCode: string,
): FacilitySearchResult {
  const isFallback = isMunicipalityDataMissing(rows, targetMunicipalityCode);
  const sorted = sortByTagPriority(rows);

  return {
    isFallback,
    fallbackMessage: isFallback ? MUNICIPALITY_DATA_MISSING_MESSAGE : null,
    facilitiesByCategory: groupByCategoryType(sorted),
  };
}

/**
 * facilities × datasets の SELECT 句(searchFacilities / fetchFacilitiesByIds /
 * fetchFacilityById で共有)。列を追加する場合はここと `FacilityJoinRow` の
 * 両方を更新すること(WHERE 句は呼び出し側で連結する)。
 */
export const FACILITY_JOIN_SELECT = `
  SELECT
    f.id AS id,
    f.dataset_id AS dataset_id,
    f.name AS name,
    f.category_type AS category_type,
    f.municipality AS municipality,
    f.municipality_code AS municipality_code,
    f.address AS address,
    f.phone AS phone,
    f.url AS url,
    f.age_range AS age_range,
    f.description AS description,
    d.title AS dataset_title,
    d.source_org AS source_org,
    d.license AS license,
    d.risk_level AS risk_level,
    d.source_url AS source_url,
    f.facility_subtype AS facility_subtype,
    f.lat AS lat,
    f.lng AS lng,
    d.fetched_at AS fetched_at,
    d.frozen AS frozen,
    f.no_diagnosis_ok AS no_diagnosis_ok,
    f.contact_methods AS contact_methods
  FROM facilities f
  JOIN datasets d ON d.id = f.dataset_id`;

/** 全関数で共通の除外条件(FR-025 医療機関除外 / migration 0011 対象外除外)。 */
export const FACILITY_BASE_WHERE = "f.is_medical = 0 AND f.is_out_of_scope = 0";

/**
 * lifestage_min/max による細分絞り込み句(migration 0016)。
 * `null`(lifestage 未指定)なら空文字を返し、句自体を付けない。
 */
export function lifestageFilterClause(lifestageOrdinal: number | null): string {
  return lifestageOrdinal != null
    ? "AND (f.lifestage_min IS NULL OR (? BETWEEN f.lifestage_min AND f.lifestage_max))"
    : "";
}

/** D1 `facilities JOIN datasets` の生の行(SQLite の列名は snake_case)。 */
interface FacilityJoinRow {
  id: string;
  dataset_id: string;
  name: string;
  category_type: CategoryType;
  municipality: string;
  municipality_code: string;
  address: string | null;
  phone: string | null;
  url: string | null;
  age_range: "child" | "adult" | "both";
  description: string | null;
  dataset_title: string;
  source_org: string;
  license: string;
  risk_level: "low" | "medium" | "high";
  source_url: string | null;
  facility_subtype: string | null;
  lat: number | null;
  lng: number | null;
  fetched_at: string;
  frozen: 0 | 1;
  no_diagnosis_ok: 0 | 1;
  contact_methods: string | null;
}

/**
 * `FacilityJoinRow`(D1 の生の行、snake_case)を `FacilityRow`(camelCase)へ変換する純関数。
 * export しているのは、TICKET-0048(`/api/ask`)の `fetchFacilityById` のように、本モジュール外の
 * 単発 SELECT でも同じ変換ロジックを再利用するため(新規の変換ロジックを増やさない方針)。
 */
export function toFacilityRow(row: FacilityJoinRow): FacilityRow {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    name: row.name,
    categoryType: row.category_type,
    municipality: row.municipality,
    municipalityCode: row.municipality_code,
    address: row.address,
    phone: row.phone,
    url: row.url,
    ageRange: row.age_range,
    description: row.description,
    datasetTitle: row.dataset_title,
    sourceOrg: row.source_org,
    license: row.license,
    riskLevel: row.risk_level,
    sourceUrl: row.source_url,
    facilitySubtype: row.facility_subtype,
    lat: row.lat,
    lng: row.lng,
    fetchedAt: row.fetched_at,
    frozen: row.frozen === 1,
    noDiagnosisOk: row.no_diagnosis_ok === 1,
    contactMethods: row.contact_methods,
  };
}

/**
 * facility_tags を `facilityId → tags[]` の Map として取得する。
 * `IN (...)` のプレースホルダー数は facilityIds の件数に応じて動的に組み立てるが、値自体は
 * すべて `bind()` 経由で渡すため、SQL 文字列にユーザー由来の値を直接埋め込むことはない。
 */
async function fetchTagsByFacilityId(db: D1Database, facilityIds: string[]): Promise<Map<string, string[]>> {
  const tagsByFacilityId = new Map<string, string[]>();
  if (facilityIds.length === 0) return tagsByFacilityId;

  for (let start = 0; start < facilityIds.length; start += MAX_IDS_PER_QUERY) {
    const facilityIdChunk = facilityIds.slice(start, start + MAX_IDS_PER_QUERY);
    const placeholders = facilityIdChunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT facility_id AS facility_id, tag AS tag FROM facility_tags WHERE facility_id IN (${placeholders})`,
      )
      .bind(...facilityIdChunk)
      .all<{ facility_id: string; tag: string }>();

    for (const row of results ?? []) {
      const existing = tagsByFacilityId.get(row.facility_id);
      if (existing) {
        existing.push(row.tag);
      } else {
        tagsByFacilityId.set(row.facility_id, [row.tag]);
      }
    }
  }
  return tagsByFacilityId;
}

/**
 * D1 から facilities × datasets(× facility_tags)を検索する(FR-024〜FR-027, FR-021, NFR-25)。
 *
 * WHERE 句で絞り込む条件:
 * - `is_medical = 0`: 医療機関除外(FR-025)
 * - `is_out_of_scope = 0`: 対象領域外施設除外(migration 0011)
 * - `age_range = 'both' OR age_range = ?`: 年齢一致(FR-021)
 * - `municipality = ? OR municipality = '東京都'`: 区市町村一致 or 広域(FR-022)
 *
 * 区市町村一致がゼロ件の場合、この WHERE 句により結果は自動的に広域窓口のみになる。
 * フォールバック判定(isMunicipalityDataMissing)はこの結果セットに対して行う。
 *
 * タグ一致の絞り込みは行わない(タグ不一致でも広域窓口・その他の窓口を残す、FR-024)。
 * タグは表示優先度(sortByTagPriority)としてのみ使う。
 */
export async function searchFacilities(db: D1Database, params: FacilitySearchParams): Promise<FacilitySearchResult> {
  const municipalityCode = municipalityToCode(params.municipality) ?? "";
  const lifestageOrdinal =
    params.lifestage != null ? lifestageToOrdinal(params.lifestage) : null;
  const lifestageClause = lifestageFilterClause(lifestageOrdinal);

  const statement = db.prepare(
    `${FACILITY_JOIN_SELECT}
       WHERE ${FACILITY_BASE_WHERE}
         AND (f.age_range = 'both' OR f.age_range = ?)
         ${lifestageClause}
         AND (f.municipality_code = ? OR f.municipality_code = ?)
       ORDER BY f.category_type, f.name`,
  );

  const bindValues =
    lifestageOrdinal != null
      ? [params.ageGroup, lifestageOrdinal, municipalityCode, BROAD_AREA_MUNICIPALITY_CODE]
      : [params.ageGroup, municipalityCode, BROAD_AREA_MUNICIPALITY_CODE];

  const { results } = await statement.bind(...bindValues).all<FacilityJoinRow>();

  const facilityRows = (results ?? []).map(toFacilityRow);
  const tagsByFacilityId = await fetchTagsByFacilityId(
    db,
    facilityRows.map((row) => row.id),
  );
  const withTags = attachTagMatches(facilityRows, tagsByFacilityId, params.tags);

  return buildFacilitySearchResult(withTags, municipalityCode);
}

/**
 * facility_id の配列(VectorStore 検索結果等)を起点に D1 から事実情報を再取得する
 * (TICKET-0023, FR-042)。`searchFacilities` と同じ絞り込み条件(is_medical・is_out_of_scope 除外・
 * 年齢一致・区市町村一致 or 広域、FR-025/FR-021/FR-022、任意の lifestage_min/max 細分絞り込み
 * migration 0016)を `f.id IN (...)` に組み合わせて適用することで、「facility-search の既存ロジック
 * 流用」の方針を満たす。
 *
 * 戻り値の順序は `ids` の順序と一致しない(SQL `IN` は順序を保証しない)ため、
 * 呼び出し側(ベクトル検索のスコア順を保ちたい場合)は別途 `id` で並べ替えること。
 */
export async function fetchFacilitiesByIds(
  db: D1Database,
  ids: readonly string[],
  params: {
    ageGroup: AgeGroup;
    municipality: string;
    /** 任意。与えられた場合、age_range の粗い区分に加えて lifestage_min/max による細分絞り込みを適用する
     *  (migration 0016、`searchFacilities` と同じ絞り込みパターン)。未指定(null/undefined)なら
     *  従来どおり age_range のみで判定する。 */
    lifestage?: Lifestage | null;
  },
): Promise<FacilityRow[]> {
  if (ids.length === 0) return [];
  const municipalityCode = municipalityToCode(params.municipality) ?? "";

  const lifestageOrdinal = params.lifestage != null ? lifestageToOrdinal(params.lifestage) : null;
  const lifestageClause = lifestageFilterClause(lifestageOrdinal);

  const facilityRows: FacilityRow[] = [];
  for (let start = 0; start < ids.length; start += MAX_IDS_PER_QUERY) {
    const idChunk = ids.slice(start, start + MAX_IDS_PER_QUERY);
    const placeholders = idChunk.map(() => "?").join(", ");
    const bindValues =
      lifestageOrdinal != null
        ? [...idChunk, params.ageGroup, lifestageOrdinal, municipalityCode, BROAD_AREA_MUNICIPALITY_CODE]
        : [...idChunk, params.ageGroup, municipalityCode, BROAD_AREA_MUNICIPALITY_CODE];
    const { results } = await db
      .prepare(
        `${FACILITY_JOIN_SELECT}
       WHERE f.id IN (${placeholders})
         AND ${FACILITY_BASE_WHERE}
         AND (f.age_range = 'both' OR f.age_range = ?)
         ${lifestageClause}
         AND (f.municipality_code = ? OR f.municipality_code = ?)`,
      )
      .bind(...bindValues)
      .all<FacilityJoinRow>();

    facilityRows.push(...(results ?? []).map(toFacilityRow));
  }

  return facilityRows;
}

/**
 * facility_id 1件分の事実情報を D1 から取得する(TICKET-0048、`/api/ask` の施設固有の定型質問用)。
 * `fetchFacilitiesByIds` と異なり年齢区分・区市町村での絞り込みは行わない(呼び出し元の
 * 窓口カードはすでに検索条件を通過した施設に対して表示されているため、再度の絞り込みは不要)。
 * 該当する行が無い場合は null を返す(is_medical=0・is_out_of_scope=0 の窓口のみを対象とする点は他の関数と同じ)。
 */
export async function fetchFacilityById(db: D1Database, id: string): Promise<FacilityRow | null> {
  const { results } = await db
    .prepare(`${FACILITY_JOIN_SELECT} WHERE f.id = ? AND ${FACILITY_BASE_WHERE}`)
    .bind(id)
    .all<FacilityJoinRow>();

  const row = (results ?? [])[0];
  return row ? toFacilityRow(row) : null;
}
