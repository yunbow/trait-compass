"use client";

// フィードバック収集ウィジェット(支援先一覧末尾・相談メモ完成後に設置される「このページで、
// 次に何をすればよいか分かりましたか？」の3択評価)の、「このセッションで既に回答済みか」の
// 記録。
//
// `app-navigation-session.ts`(SmartBackLink 用、キー `nd-app-navigated`)と同じパターンを
// 踏襲する: キー接頭辞 `nd-`、`isBrowser()` ガード、sessionStorage 例外(プライベートブラウジング
// 等)は try/catch で握りつぶし、安全側(＝毎回未回答扱い)にフォールバックする。
//
// 支援先一覧・相談メモ完成後の2箇所に3択が設置されうるため、どちらか一方で既に回答していれば
// もう一方は表示しない(同一セッションでの二重集計防止)。
const SESSION_KEY = "nd-feedback-answered";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** このセッションで3択評価に回答済みであることを記録する。 */
export function markFeedbackAnswered(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // プライベートブラウジング等で利用できない場合は何もしない。
  }
}

/** このセッションで3択評価に回答済みか。 */
export function hasAnsweredFeedback(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
