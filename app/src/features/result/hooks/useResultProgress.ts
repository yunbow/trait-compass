"use client";

import { useSyncExternalStore } from "react";

import { loadSurveyProgress, type SurveyProgress } from "@/features/survey/services/progress";

interface ResultProgressState {
  /** localStorage からの読み込みが完了したかどうか(SSR / マウント前は常に false)。 */
  isHydrated: boolean;
  progress: SurveyProgress | null;
}

const INITIAL_STATE: ResultProgressState = { isHydrated: false, progress: null };

let state: ResultProgressState = INITIAL_STATE;
let hydrated = false;

// localStorage はブラウザ外部の状態であり、setState をエフェクト内で呼ぶより
// useSyncExternalStore で読むのが素直(useSurveyProgress・ResumeBanner と同じ方針)。
// 本フックの外からこの値が変化する契機(他タブでの更新等)は想定していないため
// subscribe は no-op でよい。
function subscribe(): () => void {
  return () => {};
}

/**
 * localStorage を読み込み、内容が前回と変わっていれば state を更新する。
 * `savedAt`(未回答時は null)が同じ間はオブジェクト参照を維持し、useSyncExternalStore の
 * 「変化が無ければ同じ参照を返す」契約を満たす。
 *
 * 途中結果(例: 2/30)を見た後に同一タブで残りの設問へ回答し直して結果画面へ戻ると、
 * このモジュールはページ遷移をまたいで生き続けるため、「初回のみ読み込む」実装のままだと
 * 古い途中結果がキャッシュされ続けてしまう(要リロード)。設問への回答のたびに
 * `saveSurveyProgressState` が新しい `savedAt` を書き込む(progress.ts)ことを利用し、
 * 呼び出しのたびに再読み込みして変化を検知する。
 */
function ensureHydrated(): void {
  if (typeof window === "undefined") {
    return;
  }
  const progress = loadSurveyProgress();
  if (!hydrated || progress?.savedAt !== state.progress?.savedAt) {
    state = { isHydrated: true, progress };
    hydrated = true;
  }
}

function getSnapshot(): ResultProgressState {
  ensureHydrated();
  return state;
}

function getServerSnapshot(): ResultProgressState {
  return INITIAL_STATE;
}

/**
 * テスト専用リセット関数。モジュールスコープのキャッシュはテスト間で共有されるため、
 * 各テストの `afterEach` で呼び出してクリーンな状態に戻す
 * (useSurveyProgress の `__resetSurveyProgressStoreForTests` と同じ方針)。
 */
export function __resetResultProgressForTests(): void {
  state = INITIAL_STATE;
  hydrated = false;
}

/**
 * 結果画面(TICKET-0008)用に、保存済みの回答進行状態を1回だけ読み込むフック。
 * アンケート画面と異なり結果画面はこの値を更新しないため、読み取り専用。
 */
export function useResultProgress(): ResultProgressState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
