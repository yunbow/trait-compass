// データ透明性ページ「利用しているデータ」の一覧構築(TICKET-0065)。
//
// D1(datasets/facilities)から、実際に取り込みサービス内で使用しているデータセットの一覧と、
// データセットごとの category_type(4分類)別件数を取得し、両者を結合する。
//
// D1 アクセス(fetchDatasetRows/fetchDatasetCategoryCounts)と結合ロジック(buildDataSourceList)を
// 分離し、後者を純関数としてユニットテストする(coverage/services/aggregate-coverage.ts と同じ
// 方針、project-structure.md §7 の「services/ はドメインロジック」)。

import type { D1Database } from "@cloudflare/workers-types";

import type { CategoryType } from "@/features/support/constants/category-types";
import { isDatasetVisible } from "@/lib/dataset-visibility";
import { computeManualExpiresAt, isManualDataExpired, MANUAL_SURVEY_LICENSE } from "@/lib/manual-data-expiration";

/** D1 `datasets` 1行分から一覧表示に必要な最小データ(集計用に整形済み)。 */
export interface DatasetRow {
  id: string;
  title: string;
  sourceOrg: string;
  license: string;
  sourceUrl: string | null;
  fetchedAt: string;
  /**
   * 東京都オープンデータカタログ(CKAN)のパッケージ ID。手動投入データでは null
   * (schema.sql の `datasets.ckan_package_id` のコメント参照)。この非null判定を
   * 「オープンデータ」区分の判定に用いる(DataSourceKind参照)。
   */
  ckanPackageId: string | null;
}

/** 「掲載データの一覧」セクション分けに使う区分。 */
export type DataSourceKind = "open-data" | "standard-license" | "individual-permission";

// `MANUAL_SURVEY_LICENSE`(手動調査データセットを示す sentinel、
// `batch/scripts/ingest-manual-survey.mjs` が固定で渡す値)は `src/lib/manual-data-expiration.ts`
// の単一ソースから import する(dataset-status.ts と共有するため、2026-08是正でlib/へ集約)。
// この値のデータセットは「個別許諾データ」区分に分類する(classifyDataSourceKind参照)。

// 「掲載してよいか」の判定(license: "none" の除外、個別許諾データの許諾未確認自治体の除外)は
// `src/lib/dataset-visibility.ts` の単一ソースから import する(2026-08是正: /coverage の
// 出典一覧と Source of Truth を統一するため、判定ロジックを lib/ へ集約)。
// `hasGrantedPermission`/`extractManualSurveyMunicipalityCode`/`fetchGrantedMunicipalityCodes` は
// このモジュールの既存利用箇所(page.tsx・list-data-sources.test.ts)からの import 元を変えずに
// 済むよう、以下で re-export する。
export { hasGrantedPermission, extractManualSurveyMunicipalityCode, fetchGrantedMunicipalityCodes } from "@/lib/dataset-visibility";

/** D1 `facilities` を dataset_id・category_type で集計した1行分。 */
export interface DatasetCategoryCountRow {
  datasetId: string;
  categoryType: CategoryType;
  count: number;
}

/** データセット1件が紐づく category_type(4分類)のうち1分類分の件数。 */
export interface DataSourceCategorySummary {
  categoryType: CategoryType;
  count: number;
}

/** 「利用しているデータ」一覧に表示するデータセット1件分。 */
export interface DataSourceListItem {
  id: string;
  title: string;
  sourceOrg: string;
  license: string;
  sourceUrl: string | null;
  fetchedAt: string;
  /** そのデータセットに紐づく facilities が1件も無い場合は空配列(裏付けの無い用途チップを出さない)。 */
  categories: DataSourceCategorySummary[];
  /** ckanPackageId の有無から機械的に導出する区分(推測を挟まない)。 */
  kind: DataSourceKind;
  /**
   * 手動調査データの有効期限365日(src/lib/manual-data-expiration.ts、2026-08是正)。
   * `kind === "individual-permission"` のデータセットのみ算出し、それ以外(オープンデータ・
   * 標準利用規約データ)は `null`(有効期限という概念自体が無い)。
   */
  expiresAt: string | null;
  /** `kind === "individual-permission"` 以外は常に false。 */
  isExpired: boolean;
}

/**
 * ckanPackageId・license から区分を判定する純関数。
 *
 * - ckanPackageId が非null: 東京都オープンデータカタログ(CKAN)に機械可読な形で登録されている
 *   「オープンデータ」。
 * - ckanPackageId が null かつ license が手動調査データの sentinel(`manual-fact-verified`):
 *   自治体等へ個別に問い合わせ、許諾・事実確認のうえで独自に整理した「個別許諾データ」
 *   (`batch/scripts/ingest-manual-survey.mjs` が投入する、区市町村ごとの `ds-*-manual-survey-programs`)。
 * - それ以外(ckanPackageId が null かつ license が上記以外、例: government-standard/pdl-1.0):
 *   政府標準利用規約・公共データ利用規約(PDL)等、あらかじめ定められた利用規約に基づき
 *   個別の許諾を得ずに利用できる「標準利用規約データ」(`batch/ingest/datasets.config.ts` の
 *   `ckanPackageId: null` エントリ、例: こどもDX・国立障害者リハビリテーションセンター)。
 */
export function classifyDataSourceKind(ckanPackageId: string | null, license: string): DataSourceKind {
  if (ckanPackageId !== null) return "open-data";
  return license === MANUAL_SURVEY_LICENSE ? "individual-permission" : "standard-license";
}

/**
 * datasets の一覧と facilities の category_type 別件数(dataset_id ごと)を結合する純関数。
 * facilities に行が無い(まだ取り込んでいない、または全件が別データセット由来の)データセットは
 * categories を空配列のまま返す(呼び出し側の UI では用途チップを表示しない)。
 *
 * `license === "none"`(UNCONFIRMED_LICENSE、開放ライセンス未確認)のデータセットは一覧から
 * 除外する。この値は常に metadataOnly(実データを一切投入しない、docs/data-sources のいずれの
 * facilities/school_registry にも現れない)であり、「利用しているデータ」という本ページの趣旨に
 * 合わない。
 *
 * `license === "manual-fact-verified"`(個別許諾データ)のデータセットは、対応する自治体の
 * `municipality_survey_meta.license_audit_json`(schoolClassData/consultationWindowDataの
 * いずれか)が実際に `permission_granted` であるものだけを残す(grantedMunicipalityCodes)。
 * `datasets` 行自体は許諾状況に関わらず自治体単位で常に投入される(ingest-manual-survey.mjs の
 * buildSql を参照)ため、この絞り込みが無いと「許諾待ち」の自治体まで「個別許諾データ」として
 * 表示されてしまう(実際にはfacilities/schools等へ実データが1件も入っていない場合がある)。
 *
 * `categories`(facilities 由来の用途チップ)が1件も無いデータセットは一覧から除外する
 * (2026-08 是正)。本ページの「掲載データの一覧」節は「実際に取り込み、サービス内で使用している
 * データのみを掲載しています」と明記しており、facilities に1件も紐づかないデータセットは
 * この基準を満たさない。該当例(調査時点): ①`ingest_target: none`(区市町村集計のため投入対象外、
 * または投入パーサー未実装)のデータセット、②`school_registry` へは投入済みだが同テーブルを
 * アプリのどの画面・API も参照していないデータセット(投入済みでも「使用している」とは言えない)、
 * ③XLSX 等パース未実装で facilities への変換ができていないデータセット、④ライセンス区分未確定
 * (H・中リスク)で個別確認完了までfacilities投入をしないデータセット。除外は id のハードコードでは
 * なく「facilities 実績の有無」という機械的な条件で行うため、将来の新規データセットにも同じ基準が
 * 自動的に適用される。
 */
export function buildDataSourceList(
  datasets: readonly DatasetRow[],
  categoryCounts: readonly DatasetCategoryCountRow[],
  grantedMunicipalityCodes: ReadonlySet<string>,
  now: Date = new Date(),
): DataSourceListItem[] {
  const byDataset = new Map<string, DataSourceCategorySummary[]>();
  for (const row of categoryCounts) {
    const summary: DataSourceCategorySummary = { categoryType: row.categoryType, count: row.count };
    const existing = byDataset.get(row.datasetId);
    if (existing) {
      existing.push(summary);
    } else {
      byDataset.set(row.datasetId, [summary]);
    }
  }

  return datasets
    .filter((dataset) => isDatasetVisible(dataset, grantedMunicipalityCodes))
    .map((dataset) => {
      const kind = classifyDataSourceKind(dataset.ckanPackageId, dataset.license);
      const isManual = kind === "individual-permission";
      return {
        ...dataset,
        categories: byDataset.get(dataset.id) ?? [],
        kind,
        expiresAt: isManual ? computeManualExpiresAt(dataset.fetchedAt) : null,
        isExpired: isManual ? isManualDataExpired(dataset.fetchedAt, now) : false,
      };
    })
    .filter((item) => item.categories.length > 0);
}

/** D1 `datasets` の生の行(SQLite の列名は snake_case)。 */
interface DatasetJoinRow {
  id: string;
  title: string;
  source_org: string;
  license: string;
  source_url: string | null;
  fetched_at: string;
  ckan_package_id: string | null;
}

/** 実際に取り込んでいるデータセットの一覧を取得する(title 昇順)。 */
export async function fetchDatasetRows(db: D1Database): Promise<DatasetRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id AS id, title AS title, source_org AS source_org, license AS license,
              source_url AS source_url, fetched_at AS fetched_at, ckan_package_id AS ckan_package_id
       FROM datasets
       ORDER BY title`,
    )
    .all<DatasetJoinRow>();

  return (results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    sourceOrg: row.source_org,
    license: row.license,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at,
    ckanPackageId: row.ckan_package_id,
  }));
}

/** D1 `facilities` を集計した生の行。 */
interface DatasetCategoryCountJoinRow {
  dataset_id: string;
  category_type: CategoryType;
  count: number;
}

/** facilities を dataset_id・category_type ごとに集計した件数を取得する。 */
export async function fetchDatasetCategoryCounts(db: D1Database): Promise<DatasetCategoryCountRow[]> {
  const { results } = await db
    .prepare(
      `SELECT dataset_id AS dataset_id, category_type AS category_type, COUNT(*) AS count
       FROM facilities
       GROUP BY dataset_id, category_type`,
    )
    .all<DatasetCategoryCountJoinRow>();

  return (results ?? []).map((row) => ({
    datasetId: row.dataset_id,
    categoryType: row.category_type,
    count: row.count,
  }));
}
