// 手動調査データ(個別許諾データ)の有効期限(TICKET-未採番、setup: 台東区・葛飾区・江戸川区の
// 30日stale誤検知の是正)。
//
// もともと `src/features/support/services/dataset-status.ts` の `getUnhealthyDatasets` は
// 全 datasets 行を一律に「fetched_at から30日超過で不健全」と判定していた。オープンデータ側は
// 週次 cron が毎回 `fetched_at` を進めるため実質staleにならないが、手動調査データセット
// (`ds-<code>-manual-survey-programs`)は `fetched_at = surveyDate` のまま二度と進まないため、
// 調査から31日経過した時点で誤って「不健全」扱いになり、広域窓口のみへ縮退表示されてしまう
// バグがあった(2026-08時点で台東区・葛飾区・江戸川区が該当)。
//
// 本ファイルは、手動調査データにふさわしい明示的な有効期限(365日、全データ種別一律)を
// 定義する。DBスキーマへのカラム追加は行わず、`fetched_at`(=surveyDate)からクエリ/レンダー時に
// 動的計算する(既存の `computeStaleDays` と同じ方針)。
//
// `list-data-sources.ts`(/data-sources 個別許諾データカード)・`dataset-status.ts`
// (`getUnhealthyDatasets` の30日stale判定からの除外)の両 feature から参照するため、
// cross-feature import を避ける共有定数として `lib/` に置く。

/**
 * 手動調査データセット(`batch/scripts/ingest-manual-survey.mjs` が
 * `INSERT INTO datasets (..., license, ...)` に固定で渡す値)を示す sentinel。
 * この値のデータセットは「個別許諾データ」区分、かつ本ファイルの有効期限判定の対象になる。
 */
export const MANUAL_SURVEY_LICENSE = "manual-fact-verified";

/** 手動調査データの有効期限(日数)。全自治体・全データ種別に一律で適用する(自治体名・データ種別ごとの特別扱いはしない)。 */
export const MANUAL_DATA_VALID_DAYS = 365;

/**
 * `fetchedAt`(ISO 8601、手動調査データでは `surveyDate` 由来)から `MANUAL_DATA_VALID_DAYS`
 * 日後の有効期限を ISO 8601 文字列で返す純関数。`Date.parse` に失敗する不正な日時文字列の
 * 場合は `null` を返す。
 */
export function computeManualExpiresAt(fetchedAt: string): string | null {
  const fetchedMs = Date.parse(fetchedAt);
  if (Number.isNaN(fetchedMs)) return null;

  const expiresMs = fetchedMs + MANUAL_DATA_VALID_DAYS * 24 * 60 * 60 * 1000;
  return new Date(expiresMs).toISOString();
}

/**
 * `fetchedAt` が `MANUAL_DATA_VALID_DAYS` を超過しているかを判定する純関数。
 * 不正な日時文字列の場合は期限切れ扱いにする(`computeStaleDays` の Infinity 方針と同じ、安全側)。
 */
export function isManualDataExpired(fetchedAt: string, now: Date = new Date()): boolean {
  const fetchedMs = Date.parse(fetchedAt);
  if (Number.isNaN(fetchedMs)) return true;

  const diffMs = now.getTime() - fetchedMs;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return diffDays > MANUAL_DATA_VALID_DAYS;
}
