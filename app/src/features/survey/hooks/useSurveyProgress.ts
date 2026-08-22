"use client";

import { useSyncExternalStore } from "react";

import {
  clearSurveyProgress,
  loadSurveyProgress,
  saveSurveyProgressState,
  type SurveyProgressAnswer,
} from "@/features/survey/services/progress";
import type { AnswerValue, Question } from "@/features/survey/schema/question";

interface SurveyProgressState {
  /**
   * localStorage からの読み込みが完了したかどうか。
   * SSR / マウント前(getServerSnapshot)では常に false。
   */
  isHydrated: boolean;
  answers: SurveyProgressAnswer[];
  currentIndex: number;
}

const INITIAL_STATE: SurveyProgressState = { isHydrated: false, answers: [], currentIndex: 0 };

/**
 * モジュールスコープに保持する「現在の回答・進行位置」。
 *
 * localStorage というブラウザ外部の状態を React の外側に持ち、
 * `useSyncExternalStore` 経由で購読する(ResumeBanner (TICKET-0006) と同じ方針)。
 * `useEffect` 内で `setState` を呼ぶ実装は避けている
 * (eslint-plugin-react-hooks の `set-state-in-effect` ルールが、外部システムとの
 * 同期には `useSyncExternalStore` を使うよう案内しているため)。
 */
let state: SurveyProgressState = INITIAL_STATE;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 初回の getSnapshot 呼び出し時にのみ localStorage を読み込む(以降はモジュール変数が真実源)。 */
function ensureHydrated(): void {
  if (state.isHydrated || typeof window === "undefined") {
    return;
  }
  const saved = loadSurveyProgress();
  state = saved
    ? { isHydrated: true, answers: saved.answers, currentIndex: saved.currentIndex }
    : { isHydrated: true, answers: [], currentIndex: 0 };
}

function getSnapshot(): SurveyProgressState {
  ensureHydrated();
  return state;
}

function getServerSnapshot(): SurveyProgressState {
  return INITIAL_STATE;
}

function upsertAnswer(
  answers: readonly SurveyProgressAnswer[],
  questionId: string,
  value: AnswerValue,
): SurveyProgressAnswer[] {
  const index = answers.findIndex((answer) => answer.questionId === questionId);
  if (index === -1) {
    return [...answers, { questionId, value }];
  }
  const next = [...answers];
  next[index] = { questionId, value };
  return next;
}

/**
 * テスト専用リセット関数。モジュールスコープの状態はテスト間で共有されてしまうため、
 * 各テストの `afterEach` で呼び出してクリーンな状態に戻す。
 */
export function __resetSurveyProgressStoreForTests(): void {
  state = INITIAL_STATE;
  listeners.clear();
}

/**
 * 新しく回答を始めるため、保存済み進行状態とメモリ上の進行状態をどちらも初期化する。
 * SPA 遷移ではこのモジュールの state が残りうるため、localStorage 削除だけでは不十分。
 */
export function resetSurveyProgressStore(): void {
  clearSurveyProgress();
  state = { isHydrated: true, answers: [], currentIndex: 0 };
  emitChange();
}

export interface UseSurveyProgressResult {
  /** localStorage からの読み込みが完了したかどうか(読み込み前は先頭の設問を出さないために使う)。 */
  isHydrated: boolean;
  /** 回答済みの一覧({questionId, value}[])。 */
  answers: SurveyProgressAnswer[];
  /** 現在表示すべき設問の 0-based インデックス。questions.length に達したら全問回答済み。 */
  currentIndex: number;
  /** 現在の設問にすでに回答済みの場合はその値、未回答なら undefined(戻って修正する場合に使う)。 */
  currentAnswerValue: AnswerValue | undefined;
  /** 現在の設問に回答し、次の設問へ進める(FR-013)。 */
  answerCurrent: (value: AnswerValue) => void;
  /** ひとつ前の設問へ戻る(先頭では何もしない)。回答済みの内容は保持される(修正可)。 */
  goToPrevious: () => void;
}

/**
 * アンケート画面の回答・進行状態を管理するフック(TICKET-0007)。
 *
 * - FR-015: 回答のたびに localStorage(progress サービス)へ保存し、再訪時に再開できる。
 */
export function useSurveyProgress(questions: readonly Question[]): UseSurveyProgressResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // 保存データが壊れていて questions.length を超えている場合の防御(念のためのクランプ)。
  const currentIndex = Math.min(snapshot.currentIndex, questions.length);
  const currentQuestion = questions[currentIndex];
  const currentAnswerValue = currentQuestion
    ? snapshot.answers.find((answer) => answer.questionId === currentQuestion.id)?.value
    : undefined;

  function answerCurrent(value: AnswerValue): void {
    const question = questions[currentIndex];
    if (!question) {
      return;
    }
    const nextAnswers = upsertAnswer(snapshot.answers, question.id, value);
    const nextIndex = currentIndex + 1;
    state = { isHydrated: true, answers: nextAnswers, currentIndex: nextIndex };
    saveSurveyProgressState({ answers: nextAnswers, currentIndex: nextIndex });
    emitChange();
  }

  function goToPrevious(): void {
    if (currentIndex === 0) {
      return;
    }
    const nextIndex = currentIndex - 1;
    state = { isHydrated: true, answers: snapshot.answers, currentIndex: nextIndex };
    saveSurveyProgressState({ answers: snapshot.answers, currentIndex: nextIndex });
    emitChange();
  }

  return {
    isHydrated: snapshot.isHydrated,
    answers: snapshot.answers,
    currentIndex,
    currentAnswerValue,
    answerCurrent,
    goToPrevious,
  };
}
