// 掲載情報の訂正・更新報告(facility_reports/content_reports)の自由記述
// (corrected_value/detail_text)の保持期限(セキュリティレビュー指摘)。
//
// トリアージ(status='done'/'dismissed' への更新、report-review.mjs)から90日経過した
// 行を削除する。status_updated_at が NULL(=まだトリアージされていない、または旧データで未設定)の
// 行は対象外(migration 0027 で既存行はバックフィル済みのため、通常運用では発生しない)。
//
// status='new'(未対応)の行も、レビューされないまま無期限に保持されないよう、受付から
// NEW_REPORT_ABSOLUTE_RETENTION_DAYS を超えたものは削除する(外部レビュー指摘:
// 対応期限のSLAを設けていない以上、絶対的な保持上限が無いと自由記述が理論上無期限保存になる)。
// トリアージ済み行より長い期限にしているのは、削除前にレビューする機会を優先するため。

export const REPORT_RETENTION_DAYS = 90;
export const NEW_REPORT_ABSOLUTE_RETENTION_DAYS = 365;

export interface ReportRetentionCounts {
  facilityReports: number;
  contentReports: number;
}

function cutoffIso(nowMs: number, retentionDays: number): string {
  return new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 保持期限を過ぎたトリアージ済み報告、および受付から1年を超えた未対応報告を削除する。
 * 削除件数(ログ・テスト用途)を返す。D1のD1Result.metaにchangesが含まれるため、それを合算する。
 */
export async function purgeExpiredReports(db: D1Database, nowMs = Date.now()): Promise<ReportRetentionCounts> {
  const triagedCutoff = cutoffIso(nowMs, REPORT_RETENTION_DAYS);
  const newCutoff = cutoffIso(nowMs, NEW_REPORT_ABSOLUTE_RETENTION_DAYS);

  const [facilityTriaged, contentTriaged, facilityNew, contentNew] = await Promise.all([
    db
      .prepare(`DELETE FROM facility_reports WHERE status != 'new' AND status_updated_at IS NOT NULL AND status_updated_at < ?`)
      .bind(triagedCutoff)
      .run(),
    db
      .prepare(`DELETE FROM content_reports WHERE status != 'new' AND status_updated_at IS NOT NULL AND status_updated_at < ?`)
      .bind(triagedCutoff)
      .run(),
    db
      .prepare(`DELETE FROM facility_reports WHERE status = 'new' AND created_at < ?`)
      .bind(newCutoff)
      .run(),
    db
      .prepare(`DELETE FROM content_reports WHERE status = 'new' AND created_at < ?`)
      .bind(newCutoff)
      .run(),
  ]);

  return {
    facilityReports: (facilityTriaged.meta.changes ?? 0) + (facilityNew.meta.changes ?? 0),
    contentReports: (contentTriaged.meta.changes ?? 0) + (contentNew.meta.changes ?? 0),
  };
}
