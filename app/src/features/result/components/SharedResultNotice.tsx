/**
 * 共有 URL(`#r=...`)経由で結果画面を開いた場合に表示する注記(TICKET-0009, FR-019 AC-6)。
 * `DisclaimerNotice` と同じ見た目のトーンを踏襲しつつ、文言は
 * 「これはあなたの回答ではない可能性がある」ことを明示する内容にする。
 */
export function SharedResultNotice() {
  return (
    <div role="note" className="rounded-lg border border-border bg-muted px-4 py-3 text-left text-sm text-foreground">
      <p className="font-semibold">これは共有された結果です。</p>
      <p className="mt-1">あなたの回答ではない可能性があります。</p>
      <p className="mt-1">表示されている内容は、共有した人のカテゴリ・特性スコアの目安です。</p>
    </div>
  );
}
