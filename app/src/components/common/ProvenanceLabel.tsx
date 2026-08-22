interface ProvenanceLabelProps {
  /**
   * "primary": 施設名・電話番号・住所・URL 等、D1(東京都オープンデータ等)由来の事実情報。
   * "ai": `aiNote` 等、生成モデルによる要約・説明文。
   * "template": 選択式の入力から決定的テンプレートで組み立てた文章(外部の生成AIを使わない、
   * `/result/prepare` の「選んだ項目からメモを作る」モード等)。
   */
  source: "primary" | "ai" | "template";
}

const LABEL_TEXT: Record<ProvenanceLabelProps["source"], string> = {
  primary: "一次データ",
  ai: "AIによる要約(参考情報)",
  template: "選択項目から自動作成(AI不使用)",
};

/**
 * AI機能(RAG施設レコメンド FR-042・AIパーソナライズ解説 FR-043)が提示する情報のうち、
 * D1一次データ由来の事実情報と、生成モデルによる要約・説明文とを、画面上でラベルにより
 * 区別して表示する共通部品(TICKET-0062)。
 *
 * `fact-guard.ts` が捏造検知でD1由来の事実情報の正確性を担保する一方、利用者に対して
 * 「どの部分がD1一次データで、どの部分がAI生成の要約か」を視覚的に区別する表示は
 * このコンポーネントが担う。複数 feature(recommend/explain)
 * から再利用する横断的な表示部品のため `components/common/` に置く。
 *
 * ラベル文言は `src/lib/copy/banned-words.ts` の禁止語(診断/判定等)に抵触しない
 * (`src/lib/__tests__/copy-lint.test.ts` で機械チェック対象)。
 */
export function ProvenanceLabel({ source }: ProvenanceLabelProps) {
  // "ai" のみ生成AI由来であることを目立たせる配色にし、"primary"(D1一次データ)と
  // "template"(決定的テンプレート、AI不使用)は同じ落ち着いた配色でまとめる。
  const isAi = source === "ai";

  return (
    <span
      className={
        isAi
          ? "inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
          : "inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      }
    >
      {LABEL_TEXT[source]}
    </span>
  );
}
