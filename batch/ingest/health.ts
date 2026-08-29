// GET /health の集計ロジック(TICKET-0012 AC-1/AC-2、FR-029、NFR-25、NFR-62)。
//
// index.ts は "cloudflare:workers"(IngestWorkflow)を import しており Node 環境の Vitest から
// 直接 import できないため、feedback-digest.ts / report-digest.ts と同じパターンで集計ロジックを
// 本モジュールへ切り出し、ユニットテスト(__tests__/health.test.ts)の対象にする。
//
// deadCount の判定(2026-08是正): app/src/features/support/services/dataset-status.ts の
// "frozen-or-unmonitored" 区分(外部コードレビュー指摘による是正)と判定を揃える。
// frozen=1 または ckan_package_id IS NULL のデータセットは「意図的に CKAN 自動取込・
// 死活監視の対象外にした」だけであり、is_alive=0 でも「取得失敗」を意味しない
// (workflow.ts の `dataset.frozen || !dataset.ckanPackageId` → is_alive=0 の書き込みと対応)。
// これらを deadCount に含めると、本番に常設の2行(ds-hattatsu-shien-center・
// ds-kodomo-dx-registry)だけで /health が恒久的に劣化して見えてしまうため、deadCount からは
// 除外し、件数は unmonitoredCount として別枠で可視化する(既存フィールド
// datasets/staleCount/deadCount の削除・改名はしない追加的変更)。
//
// staleCount も同様に監視対象外を除外する(2026-08是正の追補): frozen のデータセットは
// fetched_at が二度と進まないため30日閾値を必ず恒久超過し、手動調査データ
// (ckan_package_id IS NULL)の鮮度は30日閾値ではなく有効期限365日の別ルール
// (src/lib/manual-data-expiration.ts、dataset-status.ts の "manual-expired" 区分)で管理される。
// 行単位の staleDays は従来どおり全行で返す(経過日数そのものは監視対象外でも参考情報になる)。

import type { D1Database } from "@cloudflare/workers-types";

import {
  computeStaleDays,
  STALE_THRESHOLD_DAYS,
  type DatasetStatusRow,
} from "../../app/src/features/support/services/dataset-status";

/** GET /health が datasets テーブルから読み取る行(dataset-status.ts の行型の部分集合)。 */
export type HealthDatasetRow = Pick<
  DatasetStatusRow,
  "id" | "isAlive" | "fetchedAt" | "frozen" | "ckanPackageId"
>;

/** GET /health のレスポンス本体。 */
export interface HealthReport {
  datasets: {
    id: string;
    isAlive: boolean;
    fetchedAt: string;
    staleDays: number;
    /** true = frozen または CKAN 未登録で、死活監視の対象外(dead 扱いにしない。2026-08是正)。 */
    unmonitored: boolean;
  }[];
  /**
   * staleDays が閾値(STALE_THRESHOLD_DAYS)を超えている、監視対象(unmonitored でない)の
   * データセット数(NFR-62)。監視対象外の鮮度は30日閾値の管轄外(冒頭コメント参照)。
   */
  staleCount: number;
  /** is_alive=0 かつ監視対象(unmonitored でない)のデータセット数。取得失敗を表す(FR-029)。 */
  deadCount: number;
  /** frozen=1 または ckan_package_id IS NULL のデータセット数(意図的な監視対象外)。 */
  unmonitoredCount: number;
}

/** /health のレスポンス本体を組み立てる純関数(ユニットテスト対象)。 */
export function buildHealthReport(rows: readonly HealthDatasetRow[], now: Date): HealthReport {
  const datasets = rows.map((row) => ({
    id: row.id,
    isAlive: row.isAlive === 1,
    fetchedAt: row.fetchedAt,
    staleDays: computeStaleDays(row.fetchedAt, now),
    // undefined は「frozen ではない/CKAN 登録あり」として扱う(DatasetStatusRow の
    // 任意項目の規約と同じ)。
    unmonitored: row.frozen === 1 || row.ckanPackageId === null,
  }));

  const staleCount = datasets.filter((d) => d.staleDays > STALE_THRESHOLD_DAYS && !d.unmonitored).length;
  const deadCount = datasets.filter((d) => !d.isAlive && !d.unmonitored).length;
  const unmonitoredCount = datasets.filter((d) => d.unmonitored).length;

  return { datasets, staleCount, deadCount, unmonitoredCount };
}

/** D1 の datasets を全件読み取り、/health のレスポンス本体を返す。 */
export async function getHealthReport(db: D1Database, now: Date = new Date()): Promise<HealthReport> {
  const { results } = await db
    .prepare(
      `SELECT id, is_alive AS isAlive, fetched_at AS fetchedAt,
              frozen AS frozen, ckan_package_id AS ckanPackageId
       FROM datasets ORDER BY id`,
    )
    .all<HealthDatasetRow>();

  return buildHealthReport(results ?? [], now);
}
