// 上位カテゴリ解説(TICKET-0023, FR-043)の根拠データ組み立て。
//
// fact-checked 済み 242 件(src/data/questions.json)のうち、
// 対象カテゴリに属する質問文を「根拠」として抜粋する純関数。D1/LLM への実アクセスを含まない
// ため、`getAllQuestions()` の戻り値を引数として受け取る形にし、ユニットテストで担保する(NFR-72)。
//
// 抜粋する質問文は `person_perspective`(当事者視点)をアンケート回答しやすい体験文に
// 書き直したもの(src/data/questions.json 参照)であり、「診断」「判定」等の断定表現は
// 含まれない(NFR-51)。

import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import type { CategoryKey, Question } from "@/features/survey/schema/question";

import { CATEGORY_DESCRIPTIONS } from "@/features/result/constants/category-descriptions";

/** カテゴリ1件分の根拠データ。 */
export interface CategoryEvidence {
  category: CategoryKey;
  label: string;
  description: string;
  /** fact-checked 242件のうち、このカテゴリに属する質問文の抜粋(掲載順、最大 sampleSize 件)。 */
  sampleQuestionTexts: string[];
}

/** カテゴリごとに抜粋する質問文の既定件数。 */
export const DEFAULT_EVIDENCE_SAMPLE_SIZE = 3;

/**
 * 上位カテゴリの一覧から、カテゴリごとのラベル・説明・根拠質問文をまとめる純関数。
 * `categories` の重複は除去せずそのまま処理する(呼び出し側がすでに重複の無い上位カテゴリを
 * 渡す前提。`ExplainRequestSchema` は重複除去までは行わない)。
 */
export function buildCategoryEvidence(
  categories: readonly CategoryKey[],
  allQuestions: readonly Question[],
  sampleSize: number = DEFAULT_EVIDENCE_SAMPLE_SIZE,
): CategoryEvidence[] {
  return categories.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    description: CATEGORY_DESCRIPTIONS[category],
    sampleQuestionTexts: allQuestions
      .filter((question) => question.category === category)
      .slice(0, sampleSize)
      .map((question) => question.text),
  }));
}
