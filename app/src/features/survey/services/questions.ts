import { z } from "zod";

import questionsData from "@/data/questions.json";
import { QuestionSchema, type Question } from "@/features/survey/schema/question";

const QuestionsArraySchema = z.array(QuestionSchema);

let cachedQuestions: Question[] | null = null;

function loadQuestions(): Question[] {
  if (cachedQuestions === null) {
    // 生成物である questions.json をロード時に必ず zod で検証する(不正データは例外)。
    cachedQuestions = QuestionsArraySchema.parse(questionsData);
  }
  return cachedQuestions;
}

/**
 * 242問すべてを掲載順で返す。
 */
export function getAllQuestions(): Question[] {
  return loadQuestions();
}

/**
 * P0 出題30問の固定 ID(app/src/data/questions.json 掲載順の各カテゴリ先頭3問)。
 * FR-011: 実行時ランダム抽出・シャッフルは一切行わない。
 */
export const P0_QUESTION_IDS = [
  // communication
  "ND-0001",
  "ND-0005",
  "ND-0011",
  // social-reading
  "ND-0002",
  "ND-0006",
  "ND-0013",
  // emotion-regulation
  "ND-0052",
  "ND-0073",
  "ND-0087",
  // impulse-memory
  "ND-0003",
  "ND-0007",
  "ND-0015",
  // executive-function
  "ND-0010",
  "ND-0021",
  "ND-0022",
  // kindness-misread
  "ND-0004",
  "ND-0008",
  "ND-0017",
  // sensory
  "ND-0009",
  "ND-0019",
  "ND-0020",
  // motor
  "ND-0079",
  "ND-0080",
  "ND-0112",
  // learning
  "ND-0107",
  "ND-0108",
  "ND-0109",
  // restricted-repetitive
  "ND-0034",
  "ND-0239",
  "ND-0240",
] as const;

/**
 * P0 出題30問を、カテゴリ順・カテゴリ内定義順で固定的に返す(FR-011)。
 * 全242問データ中に P0_QUESTION_IDS のいずれかが存在しない場合は例外を投げる。
 */
export function getP0Questions(): Question[] {
  const byId = new Map(loadQuestions().map((question) => [question.id, question]));

  return P0_QUESTION_IDS.map((id) => {
    const question = byId.get(id);
    if (!question) {
      throw new Error(`P0 出題 ID が質問データ内に見つかりません: ${id}`);
    }
    return question;
  });
}
