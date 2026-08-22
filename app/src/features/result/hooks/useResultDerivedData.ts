"use client";

import { useResultProgress } from "@/features/result/hooks/useResultProgress";
import { mapScoresToTags } from "@/features/support/services/category-tag-mapping";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import type { CategoryKey, Question } from "@/features/survey/schema/question";
import { getTopCategories, scoreSurvey } from "@/features/survey/services/scoring";

interface ResultDerivedData {
  /** localStorage 読み込みが完了したか。 */
  isHydrated: boolean;
  /** 回答が1問以上あるか。 */
  hasAnswers: boolean;
  topCategories: CategoryKey[];
  supportTags: SupportTag[];
}

/**
 * /result 系の副次ページ(相談メモ作成・AI要約・相談先ヒント)が、ResultView.tsx と同じ
 * ロジックで上位カテゴリ・相談分野タグを算出するための共通フック。
 */
export function useResultDerivedData(questions: Question[]): ResultDerivedData {
  const { isHydrated, progress } = useResultProgress();
  const answers = progress?.answers ?? [];

  if (!isHydrated || answers.length === 0) {
    return { isHydrated, hasAnswers: false, topCategories: [], supportTags: [] };
  }

  const { categoryScores } = scoreSurvey(answers, questions);
  const topCategories = getTopCategories(categoryScores).map(({ category }) => category);
  const supportTags = mapScoresToTags(categoryScores);

  return { isHydrated, hasAnswers: true, topCategories, supportTags };
}
