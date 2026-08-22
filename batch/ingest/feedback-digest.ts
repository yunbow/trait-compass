// フィードバックコメント(feedback_comments)の日次ダイジェスト通知(TICKET-0067追補)。
//
// report-digest.ts(facility_reports/content_reports)と同じ方針: 自由記述本文
// (comment_text)は一切 Slack へ送らず、件数のみを通知する(PII混入余地のある自由記述は
// D1にのみ保持し、wrangler CLI レビューに委ねる既存運用を維持する)。
//
// 対象は「公開許可があり、まだレビュー(published更新または見送り判断)されていない」コメント
// (publish_consent=1 AND published=0 AND dismissed=0)のみ。公開許可の無いコメントはそもそも
// 掲載候補ではないため、レビュー催促の対象に含めない(レビュー負荷を増やさない)。dismissed=1
// (レビュー済みで掲載を見送ると判断したもの、migration 0032)も除外し、既にレビュー済みの
// コメントが毎日再通知され続けないようにする。
//
// 1日1回、未レビュー件数そのものを数えて通知する(時刻ベースの差分ではなく現在の未レビュー
// 件数を使うことで、Cron の実行漏れがあっても取りこぼしなく自己修復的に動作する。
// report-digest.ts と同じ設計)。0件の日は通知しない。

export async function countPendingFeedbackComments(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM feedback_comments WHERE publish_consent = 1 AND published = 0 AND dismissed = 0`,
    )
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * 通知本文を組み立てる。未レビュー件数が0件の場合は通知不要として null を返す。
 * コメント本文・送信元画面など、内容そのものは一切含めない(件数のみ)。
 */
export function buildFeedbackDigestMessage(pendingCount: number): string | null {
  if (pendingCount === 0) return null;

  return [
    "*利用者コメント(公開許可・未レビュー)*",
    `${pendingCount}件`,
    "内容は `wrangler d1 execute` でレビューしてください。",
  ].join("\n");
}
