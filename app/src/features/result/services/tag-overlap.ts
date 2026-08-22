import { mapScoresToTags } from "@/features/support/services/category-tag-mapping";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import type { CategoryScores } from "@/features/survey/services/scoring";

export interface TagOverlapResult {
  tags: SupportTag[];
  sentence: string | null;
}

const TAG_PAIR_ADVICE: Partial<Record<string, string>> = {
  "対人・コミュニケーション+不注意・段取り":
    "口頭だけでなく、メモや書面を使った相談方法が合う可能性があります。",
  "対人・コミュニケーション+感覚":
    "人とのやり取りに加えて、音や光などの環境面の負担も一緒に伝えると、相談先で状況が伝わりやすくなります。",
  "こころ・感情+不注意・段取り":
    "気持ちの浮き沈みと段取りの難しさが重なっている場合、落ち着いて取り組める時間帯や環境を相談時に伝えると役立つことがあります。",
  "不注意・段取り+学習・からだ":
    "段取りの難しさと学び方・体の動かし方の両方に触れておくと、学校や職場での配慮を相談しやすくなります。",
  "こだわり+感覚":
    "特定のこだわりと感覚面の負担が重なっている場合、環境調整の相談で両方を伝えると役立つことがあります。",
};

const DEFAULT_PAIR_ADVICE =
  "複数の場面に関わる困りごととして、相談時にまとめて伝えると整理しやすくなります。";

function pairKey(a: SupportTag, b: SupportTag): string {
  return [a, b].sort().join("+");
}

/**
 * 診断カテゴリ(ASD/ADHD/LD/DCD)やパーセンテージを一切使わず、既存の6つの相談分野タグ
 * (SUPPORT_TAGS)のうちスコア上位のものを使って「困りごとの組み合わせ」を文章化する。
 * 2件未満の場合は sentence を null にする(重なりを語れないため)。
 */
export function buildTagOverlap(categoryScores: CategoryScores, threshold = 40): TagOverlapResult {
  const tags = mapScoresToTags(categoryScores, threshold);
  if (tags.length < 2) {
    return { tags, sentence: null };
  }
  const [first, second] = tags;
  const advice = TAG_PAIR_ADVICE[pairKey(first, second)] ?? DEFAULT_PAIR_ADVICE;
  return { tags, sentence: `「${first}」と「${second}」の両方が高めに出ています。${advice}` };
}
