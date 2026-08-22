// 「データセットを掲載・出典表示してよいか」の判定(2026-08是正: /coverage と /data-sources の
// Source of Truth 統一)。
//
// 従来、この判定ロジック(license: "none" の除外、個別許諾データの許諾未確認自治体の除外)は
// `features/data-sources/services/list-data-sources.ts` の `buildDataSourceList` にのみ実装されて
// おり、`features/coverage/services/aggregate-coverage.ts` の `fetchDatasetCredits` は datasets
// 全件を無条件で出典表示していた。この結果、/data-sources の「個別許諾データ」には許諾済み3自治体
// (世田谷区・中央区・府中市)のみが表示される一方、/coverage の「出典」には許諾未確認の自治体
// (千代田区・台東区・墨田区等)まで列挙される、という2画面間の不整合が生じていた
// (審査員から見て「データ管理を追跡できているか」疑問を招くリスク)。
//
// 判定ロジックを本ファイル(lib/)へ集約し、両 feature がここから import することで、
// 今後どちらかの画面だけ判定基準を変更してしまう(=再びSource of Truthが分岐する)ことを防ぐ。

import type { D1Database } from "@cloudflare/workers-types";

import { MANUAL_SURVEY_LICENSE } from "@/lib/manual-data-expiration";

/**
 * `classifyLocalLicense`(batch/scripts/ingest-open-data.mjs)が開放ライセンスを確認できな
 * かった場合に付与する sentinel。常に metadataOnly(実データ投入なし)であり、
 * 「利用しているデータ」「出典」いずれの一覧からも除外する。
 */
export const UNCONFIRMED_LICENSE = "none";

/**
 * `batch/scripts/ingest-manual-survey.mjs` が生成する手動調査データセットの id パターン
 * (`ds-<municipalityCode>-manual-survey-programs`)。municipality_survey_meta.license_audit_json
 * と突き合わせるための municipality_code 抽出に使う。
 */
const MANUAL_SURVEY_DATASET_ID_PATTERN = /^ds-(\d{5})-manual-survey-programs$/;

/**
 * `municipality_survey_meta.license_audit_json` のうち、本ファイルの判定に必要な2キーのみ。
 * `schools`/`class_organizations` 等(schoolClassData)と `facilities`/`support_pathways`
 * 等(consultationWindowData)のいずれかが投入されていれば、その自治体の手動調査データセットは
 * 実際に許諾を得て利用しているとみなせる。
 */
interface ManualSurveyLicenseAuditStatus {
  schoolClassData?: unknown;
  consultationWindowData?: unknown;
}

/**
 * `license_audit_json` を防御的にパースし、schoolClassData・consultationWindowDataの
 * いずれかが `permission_granted` かどうかを返す純関数。不正な JSON・欠損値は
 * 「許諾未確認」として false 扱いにする(school-info.ts の parseLicenseAudit と同じ防御方針)。
 */
export function hasGrantedPermission(licenseAuditJson: string | null): boolean {
  if (!licenseAuditJson) return false;
  try {
    const parsed: unknown = JSON.parse(licenseAuditJson);
    if (!parsed || typeof parsed !== "object") return false;
    const { schoolClassData, consultationWindowData } = parsed as ManualSurveyLicenseAuditStatus;
    return schoolClassData === "permission_granted" || consultationWindowData === "permission_granted";
  } catch {
    return false;
  }
}

/**
 * 手動調査データセットの id から municipality_code を抽出する純関数。
 * パターンに一致しない id(手動調査データセット以外)は null を返す。
 */
export function extractManualSurveyMunicipalityCode(datasetId: string): string | null {
  return datasetId.match(MANUAL_SURVEY_DATASET_ID_PATTERN)?.[1] ?? null;
}

/** {@link isDatasetVisible} の判定に必要な最小データ。 */
export interface DatasetVisibilityInput {
  id: string;
  license: string;
}

/**
 * データセット1件を「掲載・出典表示してよいか」判定する純関数。/data-sources の
 * 「利用しているデータ」一覧・/coverage の「出典」一覧の両方がこの関数を通す(Source of Truth統一)。
 *
 * - `license === "none"`(UNCONFIRMED_LICENSE、開放ライセンス未確認): 除外。
 * - `license === "manual-fact-verified"`(個別許諾データ): 対応する自治体の
 *   `municipality_survey_meta.license_audit_json` が実際に `permission_granted` であるものだけ
 *   表示する(`datasets` 行自体は許諾状況に関わらず自治体単位で常に投入されるため)。
 * - それ以外(オープンデータ・標準利用規約データ): 常に表示する。
 */
export function isDatasetVisible(dataset: DatasetVisibilityInput, grantedMunicipalityCodes: ReadonlySet<string>): boolean {
  if (dataset.license === UNCONFIRMED_LICENSE) return false;
  if (dataset.license !== MANUAL_SURVEY_LICENSE) return true;
  const municipalityCode = extractManualSurveyMunicipalityCode(dataset.id);
  return municipalityCode !== null && grantedMunicipalityCodes.has(municipalityCode);
}

/** D1 `municipality_survey_meta` の生の行(必要な2列のみ)。 */
interface MunicipalitySurveyMetaJoinRow {
  municipality_code: string;
  license_audit_json: string | null;
}

/**
 * schoolClassData・consultationWindowDataのいずれかが `permission_granted` の自治体コードを
 * 取得する({@link isDatasetVisible} の「個別許諾データ」絞り込みに使う)。
 */
export async function fetchGrantedMunicipalityCodes(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare(`SELECT municipality_code AS municipality_code, license_audit_json AS license_audit_json FROM municipality_survey_meta`)
    .all<MunicipalitySurveyMetaJoinRow>();

  const granted = new Set<string>();
  for (const row of results ?? []) {
    if (hasGrantedPermission(row.license_audit_json)) granted.add(row.municipality_code);
  }
  return granted;
}
