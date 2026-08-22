import { CATEGORY_KEYS } from "@/features/survey/schema/question";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { getTopCategories, type CategoryScores } from "@/features/survey/services/scoring";
import type { CategoryKey } from "@/features/survey/schema/question";

import { CATEGORY_DESCRIPTIONS } from "@/features/result/constants/category-descriptions";
import { scoreToLevel, type ScoreLevel } from "@/features/result/services/score-level";

export interface CategoryExplanation {
  category: CategoryKey;
  label: string;
  score: number;
  description: string;
}

/**
 * 上位カテゴリ解説(TICKET-0008 AC-5)。
 * `scoring.ts` の `getTopCategories()`(スコア降順ソート・null カテゴリの除外)に、
 * 表示ラベルと非診断語彙のみの説明文(CATEGORY_DESCRIPTIONS)を付与する純関数。
 * 「診断」「判定」「あなたは○○です」等の断定表現は一切含まない(NFR-51)。
 */
export function getCategoryExplanations(categoryScores: CategoryScores, limit = 3): CategoryExplanation[] {
  return getTopCategories(categoryScores, limit).map(({ category, score }) => ({
    category,
    label: CATEGORY_LABELS[category],
    score,
    description: CATEGORY_DESCRIPTIONS[category],
  }));
}

export interface CategoryLevelEntry {
  category: CategoryKey;
  label: string;
  /** null は未算出(その領域の回答が0件)を表す。 */
  level: ScoreLevel | null;
}

/**
 * 全10カテゴリを、スコア降順(未算出は最後)に並べた質的表現の一覧(P0対応)。
 * 「結果を詳しく見る」で上位3領域の再掲ではなく全体像を見せるために使う
 * (要約=上位3領域、詳細=全10領域、という役割分担)。パーセンテージは含めない。
 */
export function getAllCategoryLevels(categoryScores: CategoryScores): CategoryLevelEntry[] {
  return CATEGORY_KEYS.map((category) => ({
    category,
    score: categoryScores[category],
  }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .map(({ category, score }) => ({
      category,
      label: CATEGORY_LABELS[category],
      level: score === null ? null : scoreToLevel(score),
    }));
}
