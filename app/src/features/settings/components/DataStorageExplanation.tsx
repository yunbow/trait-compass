/**
 * データ保存場所・送信有無の平易な説明(TICKET-0027, FR-054 AC-3, NFR-32, NFR-63)。
 *
 * 「サーバー・DB 完全不要」ではなく、実際に保存される場所を項目ごとに1行で明示する
 * (NFR-63: 訴求文言は誇張せず、コアの処理範囲を正確に伝える)。状態を持たないため
 * サーバーコンポーネントのままでよい。
 */
export function DataStorageExplanation() {
  return (
    <section
      aria-labelledby="data-storage-explanation-heading"
      className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground"
    >
      <h2 id="data-storage-explanation-heading" className="font-semibold">保存しているデータについて</h2>
      <p className="mt-1 text-muted-foreground">
        保存した情報は、別の端末や別のブラウザには引き継がれません。
      </p>
      <details className="mt-3 border-t border-border pt-3">
        <summary className="cursor-pointer font-medium text-foreground">保存場所と共有URLの詳細を見る</summary>
        <ul className="mt-2 flex flex-col divide-y divide-border text-muted-foreground">
        <li className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
          <span className="font-medium text-foreground">進行状況・設定</span>
          <span className="flex flex-col gap-0.5">
            <span>回答の進行状況とこの設定内容は、このブラウザ内に保存します。</span>
            <span className="text-xs text-muted-foreground/80">技術上の保存先: localStorage</span>
          </span>
        </li>
        <li className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
          <span className="font-medium text-foreground">履歴</span>
          <span className="flex flex-col gap-0.5">
            <span>履歴に保存した結果(スコアなど)は、このブラウザ内に保存します。</span>
            <span className="text-xs text-muted-foreground/80">技術上の保存先: IndexedDB</span>
          </span>
        </li>
        <li className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
          <span className="font-medium text-foreground">年齢・地域</span>
          <span className="flex flex-col gap-0.5">
            <span>「年齢と地域の保存」設定が ON の場合のみ、支援情報を探す画面で入力した年齢・区市町村を、このブラウザ内に保存します。</span>
            <span className="text-xs text-muted-foreground/80">技術上の保存先: localStorage</span>
          </span>
        </li>
        <li className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
          <span className="font-medium text-foreground">共有URL</span>
          <span>
            サーバーへの送信は行いません。結果画面で共有 URL をご自身で発行した場合のみ、その内容が URL に含まれます。一度共有した URL は、この画面からデータを削除しても無効にはなりません。共有した相手が URL を保持している場合、そのURLから内容を確認できます。
          </span>
        </li>
        </ul>
      </details>
    </section>
  );
}
