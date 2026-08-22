/**
 * 危機時の常設静的リンク(TICKET-0041)。
 *
 * 背景: `/api/summarize`・`/api/recommend` には既に AI 側の危機介入ガード(FR-044, NFR-36,
 * NFR-74、`src/features/ai-summary/services/crisis-detection.ts` の `containsCrisisSignal`)が
 * あるが、これは AI 機能を使った場合にのみ発動する受動的なガードである。本コンポーネントは
 * AI・判定ロジックを一切介さない常設の静的リンクとして、危機介入方針の裾野をアンケート・
 * 結果画面を含む全画面に広げる(AC-3: `containsCrisisSignal` 等の判定ロジックは呼び出さない。
 * props・状態・API 呼び出しを持たない純粋な静的 JSX のみで構成する)。
 *
 * 電話番号について: リポジトリ内の既存文書(docs/spec, docs/research 等)には、掲載候補の
 * 相談窓口(こころの健康相談統一ダイヤル・よりそいホットライン)の名称のみが記載されており、
 * 電話番号そのものの記載は無い。誤った番号を掲載する方が実害が大きいため、電話番号は
 * 掲載せず、名称+各運営団体の公式サイトへのリンクのみを掲載する(作業ログに出典を記録)。
 *
 * 配置: `src/app/layout.tsx` の `{children}` の後に置く通常フロー(非 fixed)の要素とし、
 * アンケート回答画面(`SurveyRunner.tsx`)の画面下部固定の進捗表示(`ProgressBar`)や
 * 選択肢操作を覆わない(AC-4)。
 */
export function CrisisFooter() {
  return (
    <footer className="border-t border-border bg-background px-6 py-4 text-center text-xs text-muted-foreground">
      <p className="mx-auto max-w-2xl leading-relaxed">
        つらい気持ちが続くときは、お一人で抱え込まず、
        <a
          href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/jisatsu/kokoro_dial.html"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline underline-offset-4"
        >
          こころの健康相談統一ダイヤル
        </a>
        や
        <a
          href="https://www.since2011.net/yorisoi/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline underline-offset-4"
        >
          よりそいホットライン
        </a>
        など、電話でつながる一般の相談窓口もご利用いただけます。
      </p>
    </footer>
  );
}
