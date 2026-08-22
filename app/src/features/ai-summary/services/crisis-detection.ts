// 危機介入キーワードの簡易辞書マッチ(TICKET-0022 AC-4, FR-044)。
//
// 自傷・希死念慮等を示唆する語を検知した場合、呼び出し側(app/api/summarize/route.ts)は
// LLM 呼び出し自体をスキップし、`services/prompt.ts` の `CRISIS_GUIDANCE_TEXT`(一般相談窓口
// 案内の定型文)のみを返す。この関数は「怪しい入力を安全側に倒して拾う」ことを目的とした
// 純関数であり、DB アクセス・外部 API 呼び出しは行わない。
//
// TICKET-0024(RAG 定量評価)の safety eval(eval/safety.eval.ts, eval/fixtures/crisis-cases.json)
// で見逃し(false negative)ゼロを検証した結果、当初の辞書では「死んでしまいたい」「飛び降りたい」
// 「首を吊りたい」「オーバードーズ」等の表現バリエーションを見逃すことが判明したため、
// 以降の語彙を追加して見逃しゼロを達成した(NFR-74)。追加後も
// `npm run eval`(eval/safety.eval.ts)の crisis false negative = 0 を回帰確認する。
const CRISIS_KEYWORDS = [
  "死にたい",
  "死のうと",
  "死ぬしかない",
  "死んでしまいたい",
  "死んだ方がマシ",
  "死にたくなる",
  "自殺",
  "自傷",
  "自分を傷つけ",
  "リストカット",
  "リスカ",
  "手首を切",
  "消えたい",
  "消えてしまいたい",
  "消えてなくなりたい",
  "いなくなりたい",
  "生きていたくない",
  "命を絶",
  "希死念慮",
  "飛び降りたい",
  "飛び込みたい",
  "首を吊り",
  "オーバードーズ",
  "薬を大量に",
] as const;

/**
 * 自由記述に危機介入キーワードが含まれるかを判定する。
 * 単純な部分一致(includes)であり、意図的に過検知(false positive)側へ倒している
 * (見逃し=危機的内容を通常要約してしまうことの方がはるかに重大なため)。
 */
export function containsCrisisSignal(text: string): boolean {
  return CRISIS_KEYWORDS.some((keyword) => text.includes(keyword));
}
