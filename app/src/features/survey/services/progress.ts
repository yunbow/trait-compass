import { z } from "zod";

import { AnswerValueSchema } from "@/features/survey/schema/question";
import { readLocalJson, removeLocalItem, writeLocalJson } from "@/lib/storage/local-json-store";

/**
 * トップ画面(TICKET-0006)とアンケート画面(TICKET-0007)で共有する
 * 「回答の進行状態」localStorage キーとスキーマ・アクセス関数。
 *
 * FR-015: 回答の進行状態を localStorage に保存し、トップ画面の
 * 「前回の続きから」で再開できる。
 * NFR-31: クライアント側処理は堅牢に。localStorage が利用できない環境
 * (プライベートブラウジング等)でも例外でクラッシュしない。
 */
export const SURVEY_PROGRESS_STORAGE_KEY = "nd-survey-progress";

/** 回答済みの1設問分({questionId, value})。スコアリング(scoring.ts の SurveyAnswer)と同形。 */
export const SurveyProgressAnswerSchema = z.object({
  questionId: z.string().regex(/^ND-\d{4}$/, "questionId は ND-#### 形式である必要があります"),
  value: AnswerValueSchema,
});
export type SurveyProgressAnswer = z.infer<typeof SurveyProgressAnswerSchema>;

/**
 * TICKET-0007 でのスキーマ拡張(既存フィールドは後方互換のためそのまま維持):
 * - `answers`: 回答済み設問の一覧({questionId, value}[])。結果画面のスコアリング(scoring.ts)へ
 *   そのまま渡せる形にしている。
 * - `currentIndex`: 再開時にどの設問から表示するかを示す、P0 出題順(getP0Questions())上の
 *   0-based インデックス。
 */
export const SurveyProgressSchema = z.object({
  /** 回答済み設問数(0〜30、restricted-repetitive を除く P0 の全30問中)。answers.length と一致する。 */
  answeredCount: z.number().int().min(0),
  /** 直近に回答した設問 ID(ND-#### 形式)。再開時の位置特定に使う。 */
  lastQuestionId: z.string().regex(/^ND-\d{4}$/, "lastQuestionId は ND-#### 形式である必要があります"),
  /** 保存日時(ISO 8601 文字列)。 */
  savedAt: z.string().datetime(),
  /** 回答済み設問の一覧(FR-015)。 */
  answers: z.array(SurveyProgressAnswerSchema),
  /** 再開時に表示すべき設問の 0-based インデックス(FR-015)。 */
  currentIndex: z.number().int().min(0),
});
export type SurveyProgress = z.infer<typeof SurveyProgressSchema>;

/**
 * 保存済みの進行状態を読み込む。
 * 未保存・不正な値・localStorage 利用不可(プライベートブラウジング等)の
 * いずれの場合も例外を投げず `null` を返す(NFR-31)。
 */
export function loadSurveyProgress(): SurveyProgress | null {
  return readLocalJson(SURVEY_PROGRESS_STORAGE_KEY, SurveyProgressSchema);
}

/**
 * 進行状態を保存する。SSR・localStorage 利用不可時は何もしない(例外を投げない)。
 */
export function saveSurveyProgress(progress: SurveyProgress): void {
  writeLocalJson(SURVEY_PROGRESS_STORAGE_KEY, progress);
}

/**
 * 「回答一覧 + 現在位置」から `SurveyProgress` を組み立てて保存するヘルパー
 * (useSurveyProgress フックから利用)。`answeredCount`/`lastQuestionId`/`savedAt` は
 * ここで自動算出するため、呼び出し側は answers/currentIndex だけを意識すればよい。
 *
 * answers が空(まだ1問も回答していない)の場合は何もしない。まだ再開すべき状態が
 * 存在しないため保存不要であり、`lastQuestionId` も算出できないための安全策。
 */
export function saveSurveyProgressState(state: {
  answers: readonly SurveyProgressAnswer[];
  currentIndex: number;
}): void {
  if (state.answers.length === 0) {
    return;
  }
  const lastQuestionId = state.answers[state.answers.length - 1].questionId;
  saveSurveyProgress({
    answeredCount: state.answers.length,
    lastQuestionId,
    savedAt: new Date().toISOString(),
    answers: [...state.answers],
    currentIndex: state.currentIndex,
  });
}

/**
 * 進行状態を削除する(回答完了時・リセット時に使用)。
 */
export function clearSurveyProgress(): void {
  removeLocalItem(SURVEY_PROGRESS_STORAGE_KEY);
}

/**
 * 有効な進行状態が保存されているかどうか。トップ画面の
 * 「前回の続きから」表示可否の判定に使う(AC-5)。
 */
export function hasSurveyProgress(): boolean {
  return loadSurveyProgress() !== null;
}
