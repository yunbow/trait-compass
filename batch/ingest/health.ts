// GET /health の集計ロジック(TICKET-0012 AC-1/AC-2、FR-029、NFR-25、NFR-62)。
//
// index.ts は "cloudflare:workers"(IngestWorkflow)を import しており Node 環境の Vitest から
// 直接 import できないため、feedback-digest.ts / report-digest.ts と同じパターンで集計ロジックを
// 本モジュールへ切り出し、ユニットテスト(__tests__/health.test.ts)の対象にする。
//
// 行単位の分類は app/src/features/support/services/dataset-status.ts の
// `evaluateDatasetStatus` にそのまま委譲する(UIの縮退表示判定と /health を同じ純関数で
// 揃える。2026-08是正)。3区分:
//   - "open-data-unhealthy": 従来どおり is_alive=0 または fetched_at が30日
//     (STALE_THRESHOLD_DAYS)超過で不健全。deadCount/staleCount の対象。
//   - "manual-expired": 手動調査データ(license === MANUAL_SURVEY_LICENSE)が
//     有効期限365日(MANUAL_DATA_VALID_DAYS)を超過。deadCount には含めない
//     (is_alive=0 は「取得失敗」ではなく workflow.ts が意図的に書き込む値のため)が、
//     期限切れであれば staleCount には含める(外部コードレビューP1是正: 365日超過後も
//     /health だけを見ている運用担当者が気づけない問題への対応)。
//   - "frozen-or-unmonitored": 更新終了(frozen=1)または CKAN未登録
//     (ckan_package_id IS NULL、かつ手動調査データでもない)。deadCount・staleCount
//     いずれにも含めない(frozen は fetched_at が二度と進まず恒久的に閾値超過するため)。
//     件数は unmonitoredCount として別枠で可視化する(既存フィールド
//     datasets/staleCount/deadCount の削除・改名はしない追加的変更)。
// 行単位の staleDays は従来どおり全行で返す(経過日数そのものはどの区分でも参考情報になる)。

import type { D1Database } from "@cloudflare/workers-types";

import {
  evaluateDatasetStatus,
  STALE_THRESHOLD_DAYS,
  type DatasetStatus,
  type DatasetStatusRow,
} from "../../app/src/features/support/services/dataset-status";

/** GET /health が datasets テーブルから読み取る行(dataset-status.ts の行型と同一)。 */
export type HealthDatasetRow = Pick<
  DatasetStatusRow,
  "id" | "isAlive" | "fetchedAt" | "license" | "frozen" | "ckanPackageId"
>;

/** GET /health のレスポンス本体。 */
export interface HealthReport {
  datasets: {
    id: string;
    isAlive: boolean;
    fetchedAt: string;
    staleDays: number;
    /** true = frozen または(手動調査データではない)CKAN 未登録で、死活監視の対象外(2026-08是正)。 */
    unmonitored: boolean;
    /** evaluateDatasetStatus と同じ区分(観測性向上のため追加)。 */
    kind: DatasetStatus["kind"];
  }[];
  /**
   * 監視対象(open-data-unhealthy)の staleDays 閾値(STALE_THRESHOLD_DAYS)超過、
   * および手動調査データ(manual-expired)の有効期限365日超過を合計したデータセット数
   * (NFR-62、外部コードレビューP1是正)。frozen-or-unmonitored は含まない。
   */
  staleCount: number;
  /** is_alive=0 かつ監視対象(open-data-unhealthy)のデータセット数。取得失敗を表す(FR-029)。 */
  deadCount: number;
  /** frozen=1 または(手動調査データ以外で)ckan_package_id IS NULL のデータセット数(意図的な監視対象外)。 */
  unmonitoredCount: number;
}

/** /health のレスポンス本体を組み立てる純関数(ユニットテスト対象)。 */
export function buildHealthReport(rows: readonly HealthDatasetRow[], now: Date): HealthReport {
  const statuses = rows.map((row) => evaluateDatasetStatus(row, now, STALE_THRESHOLD_DAYS));

  const datasets = statuses.map((status) => ({
    id: status.id,
    isAlive: status.isAlive,
    fetchedAt: status.fetchedAt,
    staleDays: status.staleDays,
    unmonitored: status.kind === "frozen-or-unmonitored",
    kind: status.kind,
  }));

  const staleCount = statuses.filter((s) => isCountedAsStale(s)).length;
  const deadCount = statuses.filter((s) => s.kind === "open-data-unhealthy" && !s.isAlive).length;
  const unmonitoredCount = statuses.filter((s) => s.kind === "frozen-or-unmonitored").length;

  return { datasets, staleCount, deadCount, unmonitoredCount };
}

/**
 * staleCount に数えるかどうかの判定。
 * - "open-data-unhealthy": 従来どおり staleDays > 閾値 のみを見る(is_alive=0 は deadCount 側の
 *   責務であり、混ぜない)。
 * - "manual-expired": evaluateDatasetStatus が365日ルールで計算した isStale をそのまま使う。
 * - "frozen-or-unmonitored": 含めない(常に isStale=false)。
 */
function isCountedAsStale(status: DatasetStatus): boolean {
  if (status.kind === "open-data-unhealthy") return status.staleDays > STALE_THRESHOLD_DAYS;
  if (status.kind === "manual-expired") return status.isStale;
  return false;
}

/** D1 の datasets を全件読み取り、/health のレスポンス本体を返す。 */
export async function getHealthReport(db: D1Database, now: Date = new Date()): Promise<HealthReport> {
  const { results } = await db
    .prepare(
      `SELECT id, is_alive AS isAlive, fetched_at AS fetchedAt, license AS license,
              frozen AS frozen, ckan_package_id AS ckanPackageId
       FROM datasets ORDER BY id`,
    )
    .all<HealthDatasetRow>();

  return buildHealthReport(results ?? [], now);
}
