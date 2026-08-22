// 掲載情報の訂正・更新報告(facility_reports/content_reports)の自由記述
// (corrected_value/detail_text)の保持期限(セキュリティレビュー指摘)。
//
// トリアージ(status='done'/'dismissed' への更新、report-review.mjs)から90日経過した
// 行を削除する。status='new'(未対応)の行は削除しない(レビューの機会を失わせない)。
// status_updated_at が NULL(=まだトリアージされていない、または旧データで未設定)の行も
// 削除しない(migration 0027 で既存行はバックフィル済みのため、通常運用では発生しない)。

export const REPORT_RETENTION_DAYS = 90;

export interface ReportRetentionCounts {
  facilityReports: number;
  contentReports: number;
}

function cutoffIso(nowMs: number, retentionDays = REPORT_RETENTION_DAYS): string {
  return new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 保持期限を過ぎたトリアージ済み報告を削除する。削除件数(ログ・テスト用途)を返す。
 * D1のD1Result.metaにchangesが含まれるため、それを合算する。
 */
export async function purgeExpiredReports(db: D1Database, nowMs = Date.now()): Promise<ReportRetentionCounts> {
  const cutoff = cutoffIso(nowMs);

  const [facilityResult, contentResult] = await Promise.all([
    db
      .prepare(`DELETE FROM facility_reports WHERE status != 'new' AND status_updated_at IS NOT NULL AND status_updated_at < ?`)
      .bind(cutoff)
      .run(),
    db
      .prepare(`DELETE FROM content_reports WHERE status != 'new' AND status_updated_at IS NOT NULL AND status_updated_at < ?`)
      .bind(cutoff)
      .run(),
  ]);

  return {
    facilityReports: facilityResult.meta.changes ?? 0,
    contentReports: contentResult.meta.changes ?? 0,
  };
}
