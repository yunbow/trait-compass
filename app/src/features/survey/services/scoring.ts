import { CATEGORY_KEYS, TRAIT_KEYS } from "@/features/survey/schema/question";
import type { AnswerValue, CategoryKey, Question, TraitKey } from "@/features/survey/schema/question";

/**
 * 回答済みの1設問分の回答。
 * 未回答・早期スキップの設問は呼び出し側でそもそも配列に含めない。
 */
export interface SurveyAnswer {
  questionId: string;
  value: AnswerValue;
}

/** カテゴリ別スコア(0-100)。回答済みが0件のカテゴリは null(未算出)。 */
export type CategoryScores = Record<CategoryKey, number | null>;

/** 特性別スコア(0-100)。該当 trait の回答済み設問が0件の場合は null。 */
export type TraitScores = Record<TraitKey, number | null>;

export interface GrayZoneMeta {
  /** gray-zone 設問のうち回答済みの件数(trait スコアには含めない)。 */
  grayZoneCount: number;
}

/**
 * 重なり件数。キーは該当設問が持つ trait をソートし "+" で結合した文字列
 * (例: "ADHD+ASD")。値はその trait 組み合わせに該当する設問数。
 */
export type OverlapCounts = Record<string, number>;

export interface ScoreSurveyResult {
  categoryScores: CategoryScores;
  traitScores: TraitScores;
  grayZoneMeta: GrayZoneMeta;
  overlapCounts: OverlapCounts;
}

function buildAnsweredValueMap(answers: readonly SurveyAnswer[]): Map<string, AnswerValue> {
  return new Map(answers.map((answer) => [answer.questionId, answer.value]));
}

/** `sum(answerValue) / (answeredCount * 2) * 100` を整数に丸めて返す。 */
function toScore(sum: number, answeredCount: number): number {
  return Math.round((sum / (answeredCount * 2)) * 100);
}

/**
 * カテゴリ別スコア(AC-2/AC-3)。
 * `sum(answerValue) / (answeredCountInCategory * 2) * 100`。
 * カテゴリ内の回答済み件数が0件の場合は null。
 */
export function calculateCategoryScores(
  answers: readonly SurveyAnswer[],
  questions: readonly Question[],
): CategoryScores {
  const answeredValues = buildAnsweredValueMap(answers);

  const sums = new Map<CategoryKey, number>();
  const counts = new Map<CategoryKey, number>();
  for (const category of CATEGORY_KEYS) {
    sums.set(category, 0);
    counts.set(category, 0);
  }

  for (const question of questions) {
    const value = answeredValues.get(question.id);
    if (value === undefined) continue;
    sums.set(question.category, (sums.get(question.category) ?? 0) + value);
    counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
  }

  const result = {} as CategoryScores;
  for (const category of CATEGORY_KEYS) {
    const count = counts.get(category) ?? 0;
    result[category] = count === 0 ? null : toScore(sums.get(category) ?? 0, count);
  }
  return result;
}

/**
 * 特性別スコア(AC-4/AC-5/AC-6)。
 * - gray-zone 設問は trait を保持していても計算対象から除外する(AC-6)。
 * - 複数 trait を持つ設問は、各 trait の集計にそれぞれ同じ回答値を加算する(按分しない、AC-5)。
 * - 該当 trait の回答済み設問が1件も無い場合は null とする。
 *   (spec に明記はないが、カテゴリスコアの「0件は null」規則(AC-3)と対称になるよう
 *   本チケットの解釈として採用。詳細はチケットの作業ログを参照。)
 */
export function calculateTraitScores(
  answers: readonly SurveyAnswer[],
  questions: readonly Question[],
): TraitScores {
  const answeredValues = buildAnsweredValueMap(answers);

  const sums: Record<TraitKey, number> = { ASD: 0, ADHD: 0, LD: 0, DCD: 0 };
  const counts: Record<TraitKey, number> = { ASD: 0, ADHD: 0, LD: 0, DCD: 0 };

  for (const question of questions) {
    if (question.grayZone) continue;
    const value = answeredValues.get(question.id);
    if (value === undefined) continue;
    for (const trait of question.traits) {
      sums[trait] += value;
      counts[trait] += 1;
    }
  }

  const result = {} as TraitScores;
  for (const trait of TRAIT_KEYS) {
    result[trait] = counts[trait] === 0 ? null : toScore(sums[trait], counts[trait]);
  }
  return result;
}

/**
 * gray-zone メタデータ(AC-6)。
 * trait スコアの計算対象には含めず、回答済みの gray-zone 設問数のみを返す。
 */
export function calculateGrayZoneMeta(
  answers: readonly SurveyAnswer[],
  questions: readonly Question[],
): GrayZoneMeta {
  const answeredValues = buildAnsweredValueMap(answers);

  let grayZoneCount = 0;
  for (const question of questions) {
    if (question.grayZone && answeredValues.has(question.id)) {
      grayZoneCount += 1;
    }
  }
  return { grayZoneCount };
}

/**
 * 重なり件数(AC-7)。
 * 回答値が1以上、かつ ASD/ADHD/LD/DCD のうち2つ以上の trait を持つ設問数を、
 * その設問が持つ trait 組み合わせ(ソートして "+" 結合したキー)別に集計する。
 * gray-zone 設問であっても、この集計(ベン図の重なり件数)は対象から除外しない
 * (AC-6 が除外対象とするのは「trait スコア」であり、重なり件数は別のメタデータのため)。
 */
export function calculateOverlapCounts(
  answers: readonly SurveyAnswer[],
  questions: readonly Question[],
): OverlapCounts {
  const answeredValues = buildAnsweredValueMap(answers);
  const counts: OverlapCounts = {};

  for (const question of questions) {
    const value = answeredValues.get(question.id);
    if (value === undefined || value < 1) continue;
    if (question.traits.length < 2) continue;

    const key = [...question.traits].sort().join("+");
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

/**
 * 上位カテゴリ抽出ヘルパー(結果画面の解説用)。
 * スコア降順にソートし、null(未算出)および 0(該当なし)のカテゴリを除外したうえで
 * 上位 N 件を返す。
 */
export function getTopCategories(
  categoryScores: CategoryScores,
  limit = 3,
): Array<{ category: CategoryKey; score: number }> {
  return (Object.entries(categoryScores) as Array<[CategoryKey, number | null]>)
    .filter((entry): entry is [CategoryKey, number] => entry[1] !== null && entry[1] !== 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, score]) => ({ category, score }));
}

/**
 * カテゴリスコア・特性スコア・gray-zone メタデータ・重なり件数をまとめて算出する集約関数。
 * 結果画面はこの関数を1回呼び出すだけで、レーダーチャート・ベン図に必要な全データを取得できる。
 */
export function scoreSurvey(
  answers: readonly SurveyAnswer[],
  questions: readonly Question[],
): ScoreSurveyResult {
  return {
    categoryScores: calculateCategoryScores(answers, questions),
    traitScores: calculateTraitScores(answers, questions),
    grayZoneMeta: calculateGrayZoneMeta(answers, questions),
    overlapCounts: calculateOverlapCounts(answers, questions),
  };
}
