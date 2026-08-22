// 非診断表現の禁止語リスト(TICKET-0017, NFR-51)。
//
// もともと `src/lib/__tests__/copy-lint.test.ts` にローカル定数として重複定義されていたが、
// TICKET-0024(RAG 定量評価)の safety eval(eval/safety.eval.ts、診断表現排除の機械
// スクリーニング)でも同じ語彙が必要になったため、単一の共通定数として切り出す
// (「禁止語リストを共通定数化して流用」)。
//
// 依存を持たない葉ファイルにする(eval/ 側は Node のネイティブ TS 実行から相対 import する
// ため、このファイル自身が `@/` エイリアスや他モジュールへ依存しないことが重要)。

/** 禁止語。 */
export const BANNED_WORDS = ["診断", "判定", "あなたは", "罹患", "重症度"] as const;

export type BannedWord = (typeof BANNED_WORDS)[number];

/**
 * テキストが禁止語のいずれかを含むかを判定する純関数。
 * 呼び出し側(copy-lint.test.ts の JSX テキストリテラル走査、eval/safety.eval.ts の
 * AI 出力サンプル走査)は、否定文脈の許容リスト(禁止語の例外パターン)を別途自前で保持し、
 * このチェックの前段でスキップする。
 */
export function containsBannedWord(text: string): boolean {
  return BANNED_WORDS.some((word) => text.includes(word));
}

/** テキストに含まれる禁止語をすべて返す(重複除去)。診断・レポート用。 */
export function findBannedWords(text: string): BannedWord[] {
  return BANNED_WORDS.filter((word) => text.includes(word));
}
