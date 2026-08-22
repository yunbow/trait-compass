// データ死活監視・鮮度チェック(TICKET-0012, FR-029, NFR-25, NFR-62)。
//
// 取込 Worker(workers/ingest/workflow.ts)が datasets.is_alive / fetched_at を記録する一方、
// 「福祉局サイトとカタログの鮮度ズレは自動検知できない」(NFR-62)ため、閾値超過を機械的に
// 検知した上で、目視差分チェックや支援情報案内画面(TICKET-0015)のフォールバック表示に
// つなげる。
//
// 本ファイルは D1 への実アクセスを伴う `getUnhealthyDatasets` を含むが、判定ロジック自体
// (`computeStaleDays` / `evaluateDatasetStatus`)は純関数として切り出し、ユニットテスト
// (src/features/support/__tests__/dataset-status.test.ts)で担保する(NFR-72)。
//
// workers/ingest/index.ts の GET /health からも同じ定数・純関数を import して使う
// (workflow.ts が src/features/data-ingest/services/licenseClassifier.ts を import している
// のと同じパターン。workers 側からの `../../src/...` 相対 import は
// tsconfig.worker.json の型チェック対象に含まれる)。
//
// **手動調査データの30日閾値からの除外(2026-08是正)**: 週次 cron が毎回 `fetched_at` を
// 進めるオープンデータと異なり、手動調査データセット(`license === MANUAL_SURVEY_LICENSE`、
// `ds-<code>-manual-survey-programs`)は `fetched_at = surveyDate` のまま二度と進まないため、
// 調査から31日経過した時点でこの30日閾値の対象にすると誤って「不健全」判定になってしまう
// (実際に台東区・葛飾区・江戸川区で発生していたバグ)。そのため手動調査データは本ファイルの
// 30日stale判定の対象外とし、代わりに有効期限365日(`src/lib/manual-data-expiration.ts`)で
// 判定する(`kind: "manual-expired"`)。

import type { D1Database } from "@cloudflare/workers-types";

// このファイルは workers/ingest/index.ts(batch/、Cloudflare Workers 側の GET /health)からも
// 相対 import で使われる(ファイル先頭のコメント参照)。batch 側のビルド(wrangler/esbuild)は
// `@/*` パスエイリアスの解決を前提にしていないため、`@/lib/manual-data-expiration` ではなく
// 相対パスで import する(このファイル自体がこれまで `@/` を一切使っていなかったのも同じ理由)。
import { isManualDataExpired, MANUAL_SURVEY_LICENSE } from "../../../lib/manual-data-expiration";

/** 鮮度チェックの既定閾値(日数)。これを超えたら目視確認・フォールバック表示の対象とみなす(NFR-62)。手動調査データ(MANUAL_SURVEY_LICENSE)には適用しない。 */
export const STALE_THRESHOLD_DAYS = 30;

/** db/schema.sql の datasets テーブルから読み取る最小の行データ。 */
export interface DatasetStatusRow {
  id: string;
  /** 0 = 死活監視で不達を検知(FR-029)。 */
  isAlive: 0 | 1;
  /** ISO 8601 文字列。 */
  fetchedAt: string;
  /** 手動調査データ(MANUAL_SURVEY_LICENSE)かどうかの判定に使う。 */
  license: string;
}

/** 判定結果を含めたデータセット状態。 */
export interface DatasetStatus {
  id: string;
  isAlive: boolean;
  fetchedAt: string;
  /** fetchedAt から現在までの経過日数(切り捨て)。fetchedAt が不正な値の場合は Infinity。 */
  staleDays: number;
  /** is_alive=0、または staleDays が閾値を超えている場合に true(フォールバック表示対象)。 */
  isStale: boolean;
  /**
   * "open-data-unhealthy": 従来どおり is_alive=0 または30日stale閾値超過(オープンデータ)。
   * "manual-expired": 手動調査データが有効期限365日を超過(MANUAL_SURVEY_LICENSE)。
   * 呼び出し側(facility-search.ts の縮退処理・results/page.tsx の hasUnhealthyDatasets 判定)は
   * この区分で表示挙動・文言を出し分ける。
   */
  kind: "open-data-unhealthy" | "manual-expired";
}

/**
 * `fetchedAt`(ISO 8601)から `now` までの経過日数を計算する純関数。
 * 不正な日時文字列の場合は Infinity を返す(閾値超過として安全側に倒す)。
 */
export function computeStaleDays(fetchedAt: string, now: Date = new Date()): number {
  const fetchedMs = Date.parse(fetchedAt);
  if (Number.isNaN(fetchedMs)) return Number.POSITIVE_INFINITY;

  const diffMs = now.getTime() - fetchedMs;
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

/**
 * データセット1件の死活・鮮度状態を判定する純関数。
 *
 * `license === MANUAL_SURVEY_LICENSE`(手動調査データ)の行は、30日stale・is_alive判定の
 * 対象外とし、代わりに `isManualDataExpired`(有効期限365日、src/lib/manual-data-expiration.ts)
 * で `isStale` を決め `kind: "manual-expired"` を付与する。それ以外(オープンデータ等)は
 * 従来どおり is_alive=0(死活監視で不達を検知)、または fetched_at が `thresholdDays` を
 * 超えている場合に `isStale: true` とする(FR-029, NFR-25, NFR-62)、`kind: "open-data-unhealthy"`。
 */
export function evaluateDatasetStatus(
  row: DatasetStatusRow,
  now: Date = new Date(),
  thresholdDays: number = STALE_THRESHOLD_DAYS,
): DatasetStatus {
  const isAlive = row.isAlive === 1;
  const staleDays = computeStaleDays(row.fetchedAt, now);

  if (row.license === MANUAL_SURVEY_LICENSE) {
    const isStale = isManualDataExpired(row.fetchedAt, now);
    return { id: row.id, isAlive, fetchedAt: row.fetchedAt, staleDays, isStale, kind: "manual-expired" };
  }

  const isStale = !isAlive || staleDays > thresholdDays;
  return { id: row.id, isAlive, fetchedAt: row.fetchedAt, staleDays, isStale, kind: "open-data-unhealthy" };
}

/**
 * D1 の datasets テーブルから、不健全なデータセットのみを返す(オープンデータの30日stale・
 * is_alive=0、および手動調査データの有効期限365日超過の両方を含む)。
 * 支援情報案内画面(TICKET-0015)がフォールバック表示の要否判定に使う想定。呼び出し側は
 * `kind` で「オープンデータstale」と「手動期限切れ」を区別して扱うこと(facility-search.ts の
 * 縮退処理・results/page.tsx の hasUnhealthyDatasets 判定を参照)。
 */
export async function getUnhealthyDatasets(
  db: D1Database,
  now: Date = new Date(),
  thresholdDays: number = STALE_THRESHOLD_DAYS,
): Promise<DatasetStatus[]> {
  const { results } = await db
    .prepare(`SELECT id, is_alive AS isAlive, fetched_at AS fetchedAt, license AS license FROM datasets ORDER BY id`)
    .all<DatasetStatusRow>();

  return (results ?? [])
    .map((row) => evaluateDatasetStatus(row, now, thresholdDays))
    .filter((status) => status.isStale);
}
