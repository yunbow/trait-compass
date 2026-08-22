// プライバシー配慮の利用計測クライアント(TICKET-0034)。
//
// Cookie不使用・個人特定不可能な集計型アナリティクスとして、外部SaaS(Cloudflare Web
// Analytics / Counterscale / Plausible)は採用しない(理由: 詳細はチケット・作業ログ参照。
// 要約すると、CF Web Analytics はダッシュボードでのトークン発行が必要で自律完結不可な上に
// 外部ビーコンの追加が必要、Counterscale は別 Worker のデプロイが必要、Plausible Community
// Edition はファネル機能が使えず、いずれも本チケットのスコープ(日付×画面の到達数集計)には
// 過剰または不足。代わりにファーストパーティの D1 集計カウンタ(POST /api/track)を使う)。
//
// `trackPageReached` は画面到達イベントのみを送信する薄いラッパーで、以下を型・実装の両面で
// 保証する(NFR-31〜33, TICKET-0034 AC-3):
// - 引数は `TrackableScreen`(閉じた union 型)の1つのみ。任意のペイロード(スコア・自由記述・
//   年齢・地域・共有URL内容等)を受け付ける余地が型シグネチャ上ない。
// - 送信は fire-and-forget。失敗しても呼び出し側の UI に一切影響しない(例外を投げない)。
// - `navigator.doNotTrack === "1"` の場合は送信自体を行わない。

/** 計測対象の画面(画面到達ファネル、TICKET-0034 AC-2)。 */
export const TRACKABLE_SCREENS = ["top", "survey", "result", "support-results", "result-prepare", "result-summarize", "result-recommend"] as const;

export type TrackableScreen = (typeof TRACKABLE_SCREENS)[number];

/**
 * 画面到達イベントを送信する(TICKET-0034)。
 *
 * `screen` 以外のいかなる値も送信できない(型シグネチャ上、引数はこれ1つのみ)。
 * DNT(Do Not Track)が有効なブラウザでは何も送信しない。送信失敗は無視し、呼び出し側には
 * 一切伝播させない(fire-and-forget)。
 */
export function trackPageReached(screen: TrackableScreen): void {
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return;
  if (typeof fetch !== "function") return;

  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screen }),
      keepalive: true,
    }).catch(() => {
      // fire-and-forget: ネットワークエラー等は無視し、UI には一切影響させない。
    });
  } catch {
    // fetch の同期的な例外(未対応環境等)も同様に無視する。
  }
}
