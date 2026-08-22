/**
 * Slack Incoming Webhook への通知(掲載情報の訂正・更新報告用、任意機能)。
 *
 * `SLACK_WEBHOOK_URL` が未設定の場合は何もしない(ローカル開発・本番どちらでも通知なしで
 * 正常動作する)。送信失敗(ネットワークエラー・Slack側エラー)は握りつぶし、呼び出し元の
 * 報告保存フロー(D1 INSERT・レスポンス)には一切影響させない。NFR-36 により例外詳細は
 * ログに出力しない。
 */
export async function postSlackMessage(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // NFR-36: 通知失敗の詳細をログに出力しない。報告自体は既にD1へ保存済みのため、
    // 通知の成否によらず報告フローの成功/失敗は変えない。
  }
}
