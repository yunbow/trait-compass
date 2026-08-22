"use client";

// SmartBackLink/SmartBackLinkButton(P0対応)が「history.back() が安全か」を判定するための
// セッション内ナビゲーション記録。
//
// 当初は `window.history.length > 1` で判定していたが、ブラウザの新規タブは(タブ自体の
// 内部エントリ分を含み)開いた直後から length が 2 以上になることがあり、実際にはこのアプリ内で
// 一度も遷移していない(直接アクセス・共有リンクから開いた)状態でも「戻れる」と誤判定してしまう。
// 誤判定すると history.back() がブラウザ内部の非アプリページ(新規タブページ等)へ遷移し、
// アプリの外に出てしまう(BackLinkButton の元設計方針「直接アクセス時も遷移先が安定するように
// する」を破る重大な回帰)。
//
// そこで、このアプリ自身が「このタブでこのアプリ内を1回以上遷移したか」を sessionStorage に
// 記録し、その記録のみを判定材料にする(ブラウザの内部エントリの影響を受けない)。
const SESSION_KEY = "nd-app-navigated";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** アプリ内でページ遷移が1回以上発生したことを記録する(AppNavigationTracker から呼ぶ)。 */
export function markAppNavigationOccurred(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // プライベートブラウジング等で利用できない場合は何もしない(安全側: 常に fallbackHref を使う)。
  }
}

/** このタブでこのアプリ内のページ遷移が1回以上発生しているか(history.back() が安全に使えるか)。 */
export function hasAppNavigationOccurred(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}
