import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { CATEGORY_KEYS } from "@/features/survey/schema/question";
import type { CategoryKey } from "@/features/survey/schema/question";
import type { CategoryScores } from "@/features/survey/services/scoring";

/**
 * レーダーチャート1頂点分の表示用データ。
 * `score` が `null` の場合は「未算出」(回答0件)であることを示し、
 * `isUnavailable` で明示する(AC-2: 他カテゴリと同列の数値として描画しないための印)。
 */
export interface RadarDatum {
  category: CategoryKey;
  label: string;
  score: number | null;
  isUnavailable: boolean;
}

/**
 * `CategoryScores` を、レーダーチャート描画用の配列(カテゴリ掲載順)に整形する純関数。
 */
export function buildRadarData(categoryScores: CategoryScores): RadarDatum[] {
  return CATEGORY_KEYS.map((category) => {
    const score = categoryScores[category];
    return {
      category,
      label: CATEGORY_LABELS[category],
      score,
      isUnavailable: score === null,
    };
  });
}

/**
 * スクリーンリーダー向けのスコア要約文(role="img" の aria-label に使う)。
 * 未算出のカテゴリは数値を読み上げず「未算出」と伝える。
 */
export function buildRadarAriaLabel(data: readonly RadarDatum[]): string {
  const parts = data.map((d) => `${d.label}: ${d.isUnavailable ? "未算出" : `${d.score}%`}`);
  return `レーダーチャート(カテゴリ別スコアの目安)。${parts.join("、")}。`;
}
