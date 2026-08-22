// データカバレッジ可視化(TICKET-0029, FR-02B)。
//
// D1(facilities/datasets)から区市町村別の取込状況を集計する。ハッカソン差別化案C
// 「区ごとのデータ分断・非統一の可視化」の裏付けとして、62区市町村(municipalities.ts)を
// 母数に固定し、データが存在しない区市町村もゼロ件の行として明示する(「一部の区市町村しか
// オープンデータカタログに窓口情報を公開していない」ことを可視化する狙い、FR-02B)。
//
// D1 アクセス(fetchFacilityCoverageRows/fetchDatasetCredits)と集計ロジック
// (aggregateCoverageByMunicipality/coverageLevel)を分離し、後者を純関数としてユニット
// テストする(NFR-72、project-structure.md §7 の「services/ はドメインロジック」方針)。

import type { D1Database } from "@cloudflare/workers-types";

import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import type { CategoryType } from "@/features/support/constants/category-types";
import { BROAD_AREA_MUNICIPALITY_CODE } from "@/features/support/constants/municipality-codes";
import { TOKYO_MUNICIPALITY_REGISTRY } from "@/features/support/constants/municipality-registry";
import type { Municipality } from "@/features/support/constants/municipalities";
import { isDatasetVisible } from "@/lib/dataset-visibility";

/** D1 `facilities` 1行分から集計に必要な最小データ(集計用に整形済み)。 */
export interface FacilityCoverageRow {
  /** 集計キー。 */
  municipalityCode: string;
  categoryType: CategoryType;
  /** lat/lng の両方が非 NULL の場合のみ true(TICKET-0028 と同じ判定基準)。 */
  hasLatLng: boolean;
  /** 由来データセットID(datasets.id)。共通データ/自治体独自データの判定に使う(§datasetScope参照)。 */
  datasetId: string;
}

/**
 * データセットの「範囲」区分。
 * - "common": 全facilitiesの中で2区市町村以上にまたがって登場するデータセット
 *   (東京都オープンデータカタログ・WAM NET 等、複数自治体で共通に使える出典)。
 * - "municipality-only": 1区市町村にしか登場しないデータセット(その自治体が独自に追加投入した
 *   オープンデータ。例: 台東区の「保育施設」「福祉施設」等)。
 *
 * この区分は区市町村間の登録データ数比較で重要になる: municipality-only データを多く持つ
 * 自治体は、他の自治体と同じ基準で「支援施設が多い」わけではなく、単に独自データの投入量が
 * 多いだけという場合がある(2026-08是正、実データ調査により確認)。
 */
export type DatasetScope = "common" | "municipality-only";

/**
 * 分類充足の判定・表示に使う3分類(CATEGORY_TYPESの4分類から発達障害支援資料を除いたもの)。
 * 発達障害支援資料はD1全体で数件(2026-08時点)しか登録が無く、ほぼ全区市町村で「未充足」に
 * 固定されるため、分類充足の母数に含めると「全分類充足」がほぼ到達不能になり判定として機能
 * しない(2026-08是正)。categoryCounts自体は引き続きCATEGORY_TYPESの4分類分を保持する。
 */
export const COVERAGE_CATEGORY_TYPES: readonly CategoryType[] = CATEGORY_TYPES.filter((type) => type !== "発達障害支援資料");

/** 区市町村1件分のカバレッジ集計結果。 */
export interface MunicipalityCoverage {
  code: string;
  municipality: Municipality;
  /** その区市町村に紐づく facilities の総件数。 */
  count: number;
  /** count のうち、共通データセット("common")由来の件数。 */
  commonDataCount: number;
  /** count のうち、この区市町村だけが独自に追加投入したデータセット("municipality-only")由来の件数。 */
  municipalityOnlyDataCount: number;
  /** category_type(4分類)ごとの件数。 */
  categoryCounts: Record<CategoryType, number>;
  /** COVERAGE_CATEGORY_TYPES(3分類)のうち1件以上データがある分類数(0〜3)。カバレッジレベル判定の基準。 */
  categoryTypesCovered: number;
  /** lat/lng が付与されている件数。 */
  geocodedCount: number;
  /** 座標付与率(0〜1)。count=0 の場合は算出不能として null(FR-017 のスコアリング仕様と同じ
   * 「分母0は null」の考え方を踏襲する)。 */
  geocodeRate: number | null;
}

/** カバレッジ全体のサマリー。 */
export interface CoverageSummary {
  /** 東京都62区市町村(municipalities.ts の全件数)。 */
  totalMunicipalities: number;
  /** 1件以上 facilities データがある区市町村数。 */
  municipalitiesWithData: number;
  /** 区市町村データが無く都全域窓口として登録されている facilities 件数(municipality='東京都')。 */
  broadAreaCount: number;
  /** facilities の総件数(都全域窓口を含む)。 */
  totalFacilities: number;
  /**
   * coverageLevel(3分類充足度)ごとの区市町村数(62区市町村の内訳、合計は必ず62)。
   * 2026-08是正: サマリーの主指標を「有データ市区町村数(municipalitiesWithData) / 62」という
   * 単一の比率から本フィールドの内訳表示に変更した。単一比率は「1分類のみのデータがある区市町村」
   * まで「整備済み」に見えてしまい、このページの目的(FR-02B「区ごとのデータ分断・非統一の可視化」)
   * と矛盾するため。
   */
  levelCounts: Record<CoverageLevel, number>;
}

export interface CoverageResult {
  rows: MunicipalityCoverage[];
  summary: CoverageSummary;
}

/** 集計元データが1件もない(D1 に facilities が0件)ことを表す判定に使う。 */
function createEmptyCategoryCounts(): Record<CategoryType, number> {
  return Object.fromEntries(CATEGORY_TYPES.map((type) => [type, 0])) as Record<CategoryType, number>;
}

/**
 * dataset_id ごとに、facilities 全体で何区市町村にまたがって登場するかを数え、
 * "common"(2区市町村以上)/"municipality-only"(1区市町村のみ)に分類する純関数。
 *
 * id のハードコード(例: 「WAM NET は common」)は行わない。実データから機械的に導出することで、
 * 将来データセットが増減しても分類が自動的に追従する(/data-sources の
 * `classifyDataSourceKind` と同じ「推測を挟まない」方針)。広域窓口
 * (municipalityCode='13000')の行もそのまま母数に含める(広域データセットを不当に
 * "municipality-only" 側へ倒さないため)。
 */
export function classifyDatasetScopes(rows: readonly FacilityCoverageRow[]): Map<string, DatasetScope> {
  const municipalitiesByDataset = new Map<string, Set<string>>();
  for (const row of rows) {
    const existing = municipalitiesByDataset.get(row.datasetId);
    if (existing) {
      existing.add(row.municipalityCode);
    } else {
      municipalitiesByDataset.set(row.datasetId, new Set([row.municipalityCode]));
    }
  }

  const scopes = new Map<string, DatasetScope>();
  for (const [datasetId, municipalities] of municipalitiesByDataset) {
    scopes.set(datasetId, municipalities.size > 1 ? "common" : "municipality-only");
  }
  return scopes;
}

/**
 * facilities の生データ(D1 から取得した1行=1施設の配列)を区市町村別に集計する純関数。
 *
 * 62区市町村すべてを行として返す(データが1件も無い区市町村は count=0 の行になる)ため、
 * 呼び出し側は「データがある区市町村だけの一覧」ではなく「62区市町村に対するカバレッジ」を
 * そのまま描画できる。municipality='東京都'(広域窓口、BROAD_AREA_MUNICIPALITY)は62区市町村の
 * 対象外のため rows には含めず、summary.broadAreaCount としてのみ集計する。
 */
export function aggregateCoverageByMunicipality(rows: readonly FacilityCoverageRow[]): CoverageResult {
  const byMunicipality = new Map<string, FacilityCoverageRow[]>();
  for (const row of rows) {
    const existing = byMunicipality.get(row.municipalityCode);
    if (existing) {
      existing.push(row);
    } else {
      byMunicipality.set(row.municipalityCode, [row]);
    }
  }

  const datasetScopes = classifyDatasetScopes(rows);

  const municipalityRows: MunicipalityCoverage[] = TOKYO_MUNICIPALITY_REGISTRY.map((entry) => {
    const facilityRows = byMunicipality.get(entry.code) ?? [];
    const categoryCounts = createEmptyCategoryCounts();
    let geocodedCount = 0;
    let commonDataCount = 0;
    let municipalityOnlyDataCount = 0;
    for (const row of facilityRows) {
      categoryCounts[row.categoryType] += 1;
      if (row.hasLatLng) geocodedCount += 1;
      if (datasetScopes.get(row.datasetId) === "common") {
        commonDataCount += 1;
      } else {
        municipalityOnlyDataCount += 1;
      }
    }
    const count = facilityRows.length;
    const categoryTypesCovered = COVERAGE_CATEGORY_TYPES.filter((type) => categoryCounts[type] > 0).length;

    return {
      code: entry.code,
      municipality: entry.name as Municipality,
      count,
      commonDataCount,
      municipalityOnlyDataCount,
      categoryCounts,
      categoryTypesCovered,
      geocodedCount,
      geocodeRate: count > 0 ? geocodedCount / count : null,
    };
  });

  const municipalitiesWithData = municipalityRows.filter((row) => row.count > 0).length;
  const broadAreaCount = (byMunicipality.get(BROAD_AREA_MUNICIPALITY_CODE) ?? []).length;
  const levelCounts = createEmptyLevelCounts();
  for (const row of municipalityRows) {
    levelCounts[coverageLevel(row)] += 1;
  }

  return {
    rows: municipalityRows,
    summary: {
      totalMunicipalities: TOKYO_MUNICIPALITY_REGISTRY.length,
      municipalitiesWithData,
      broadAreaCount,
      totalFacilities: rows.length,
      levelCounts,
    },
  };
}

/** カバレッジレベル(4段階)。テーブルの色分けバー・ヒートマップ表現の区分に使う。 */
export type CoverageLevel = "none" | "low" | "partial" | "full";

/** {@link CoverageLevel} の表示順(データなし→充足度が高い順)。サマリーの内訳表示に使う。 */
export const COVERAGE_LEVELS: readonly CoverageLevel[] = ["none", "low", "partial", "full"];

/** {@link CoverageSummary.levelCounts} の初期値(全レベル0件)。 */
function createEmptyLevelCounts(): Record<CoverageLevel, number> {
  return { none: 0, low: 0, partial: 0, full: 0 };
}

/**
 * 区市町村1件分のカバレッジレベルを判定する純関数。
 * 「件数」ではなく「COVERAGE_CATEGORY_TYPES(3分類)のうち何分類のデータがあるか」
 * (categoryTypesCovered)を主軸にする。件数が多くても1分類に偏っている区市町村と、少なくても
 * 分類が揃っている区市町村を区別するため(FR-02B が示したいのは「件数の多寡」以上に
 * 「分類の非統一・分断」であるため)。
 */
export function coverageLevel(row: Pick<MunicipalityCoverage, "count" | "categoryTypesCovered">): CoverageLevel {
  if (row.count === 0) return "none";
  if (row.categoryTypesCovered <= 1) return "low";
  if (row.categoryTypesCovered === 2) return "partial";
  return "full";
}

/** D1 `facilities` の生の行(SQLite の列名は snake_case)。 */
interface FacilityCoverageJoinRow {
  municipality_code: string;
  category_type: CategoryType;
  lat: number | null;
  lng: number | null;
  dataset_id: string;
}

/**
 * D1 の facilities から区市町村別集計に必要な最小列だけを取得する。
 * 医療機関除外(is_medical)・対象領域外施設除外(is_out_of_scope)は行わない: このページは
 * 「取込データ全体の分断状況」を示す啓発・提案用途であり、facility-search.ts のような
 * エンドユーザー向け絞り込みとは目的が異なるため、全件(医療機関・対象領域外施設を含む)を
 * 対象にする。
 */
export async function fetchFacilityCoverageRows(db: D1Database): Promise<FacilityCoverageRow[]> {
  const { results } = await db
    .prepare(
      `SELECT municipality_code AS municipality_code, category_type AS category_type, lat AS lat, lng AS lng,
              dataset_id AS dataset_id
       FROM facilities`,
    )
    .all<FacilityCoverageJoinRow>();

  return (results ?? []).map((row) => ({
    municipalityCode: row.municipality_code,
    categoryType: row.category_type,
    hasLatLng: row.lat !== null && row.lng !== null,
    datasetId: row.dataset_id,
  }));
}

/** 出典クレジット表示用に必要な datasets の最小データ(facility-display.ts の formatSourceCredit と同形)。 */
export interface CoverageDatasetCredit {
  datasetTitle: string;
  sourceOrg: string;
  license: string;
  sourceUrl: string | null;
}

/** {@link fetchDatasetCredits} が返す、フィルタ前(id を保持した)出典データ1件分。 */
export interface RawDatasetCredit extends CoverageDatasetCredit {
  id: string;
}

interface DatasetCreditJoinRow {
  id: string;
  title: string;
  source_org: string;
  license: string;
  source_url: string | null;
}

/** カバレッジ集計に使った datasets 全件の出典情報を取得する(FR-026, NFR-54)。 */
export async function fetchDatasetCredits(db: D1Database): Promise<RawDatasetCredit[]> {
  const { results } = await db
    .prepare(`SELECT id AS id, title AS title, source_org AS source_org, license AS license, source_url AS source_url
              FROM datasets
              ORDER BY title`)
    .all<DatasetCreditJoinRow>();

  return (results ?? []).map((row) => ({
    id: row.id,
    datasetTitle: row.title,
    sourceOrg: row.source_org,
    license: row.license,
    sourceUrl: row.source_url,
  }));
}

/**
 * 出典一覧を /data-sources の「利用しているデータ」一覧と同じ判定基準(lib/dataset-visibility.ts の
 * `isDatasetVisible`)で絞り込む純関数。ライセンス未確認(license: "none")、および許諾未確認の
 * 個別許諾データ(自治体)を除外することで、/coverage と /data-sources が同じ Source of Truth を
 * 参照するようにする(2026-08是正: 従来 `fetchDatasetCredits` は datasets 全件を無条件で出典表示
 * しており、/data-sources では「個別許諾データ」として表示されない許諾未確認の自治体まで
 * /coverage の「出典」には列挙されていた)。
 *
 * `datasetIdsWithFacilities` で、実際に facilities 行が1件以上ある datasets のみへさらに絞り込む。
 * 個別許諾データは相談窓口・学級・福祉ガイドの複数区分をまとめた1行の datasets レコードであり、
 * `hasGrantedPermission` はいずれか1区分でも許諾されていれば true を返す(区分単位ではなく
 * データセット単位の可視・不可視判定のため)。そのため、一部区分だけ許諾された自治体では、
 * 許諾されていない区分の facilities が取り込まれず0件のままでも、datasets レコード自体は
 * 「出典」に列挙されてしまう(2026-08是正: /data-sources 側の `buildDataSourceList` は
 * `categories.length > 0` で同種の空データセットを既に除外しており、/coverage 側にこの
 * チェックが抜けていた分の是正)。
 */
export function filterVisibleDatasetCredits(
  rows: readonly RawDatasetCredit[],
  grantedMunicipalityCodes: ReadonlySet<string>,
  datasetIdsWithFacilities: ReadonlySet<string>,
): CoverageDatasetCredit[] {
  return rows
    .filter((row) => isDatasetVisible(row, grantedMunicipalityCodes) && datasetIdsWithFacilities.has(row.id))
    .map(({ id: _id, ...credit }) => credit);
}
