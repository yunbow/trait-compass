// 掲載情報訂正報告(facility_reports / content_reports)の日次ダイジェスト通知。
//
// 従来は報告1件ごとに自由記述全文(corrected_value/detail_text)を含む Slack 通知を
// 即時送信していたが(TICKET-0064)、検討の結果、自由記述を一切 Slack へ送らない方針に変更した
// (PII混入余地のある自由記述は D1にのみ保持し、`wrangler d1 execute` でレビューする既存運用を
// 維持する)。
//
// 1日1回、status='new'(未対応)件数のみを数えて通知する。時刻ベースの「前回チェック以降の
// 差分」ではなく未対応件数そのものを使うことで、Cron の実行漏れがあっても取りこぼしなく
// 自己修復的に動作する(状態を持たない)。件数が0件の日は通知しない(ノイズを増やさない)。

export interface ReportDigestCounts {
  facilityReports: number;
  contentReports: number;
}

export async function countNewReports(db: D1Database): Promise<ReportDigestCounts> {
  const [facilityRow, contentRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM facility_reports WHERE status = 'new'`).first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM content_reports WHERE status = 'new'`).first<{ count: number }>(),
  ]);
  return {
    facilityReports: facilityRow?.count ?? 0,
    contentReports: contentRow?.count ?? 0,
  };
}

/**
 * 通知本文を組み立てる。未対応件数の合計が0件の場合は通知不要として null を返す。
 * 自由記述・施設名・対象名など、報告内容そのものは一切含めない(件数のみ)。
 */
export function buildReportDigestMessage(counts: ReportDigestCounts): string | null {
  const total = counts.facilityReports + counts.contentReports;
  if (total === 0) return null;

  return [
    "*掲載情報の訂正・更新報告(未対応)*",
    `施設情報: ${counts.facilityReports}件`,
    `想定ルート/学校情報/結果の見方ガイド: ${counts.contentReports}件`,
    "内容は `wrangler d1 execute` でレビューしてください。",
  ].join("\n");
}
