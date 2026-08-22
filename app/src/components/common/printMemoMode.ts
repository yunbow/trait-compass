/**
 * 相談メモ印刷の共通定数(TICKET-0046 AC-3)。
 *
 * `PrepareMemo`(選択式モード、`features/prepare/components/PrepareMemo.tsx`)と
 * `SummaryMemo`(AI自由記述モード、`features/ai-summary/components/SummaryMemo.tsx`)は、
 * どちらも「印刷する」ボタン押下時に `<html>` へこの属性を付与してから `window.print()` を
 * 呼び、globals.css の `[data-prepare-memo-print]` 配下のみを対象とする印刷レイアウトを
 * 発火させる。同一画面上に両コンポーネントが同時に存在することはない(選択式/AI自由記述の
 * いずれか一方のモードのみが表示される)ため、印刷スタイルシートの適用対象マーカー
 * (`data-prepare-memo-print`、各コンポーネントの JSX 側で直接付与)も安全に共有できる。
 */
export const PRINT_MODE_ATTRIBUTE = "data-print-mode";
export const PRINT_MODE_VALUE = "prepare-memo";
