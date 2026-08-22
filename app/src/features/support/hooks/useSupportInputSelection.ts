"use client";

import { useSyncExternalStore } from "react";

import { SETTINGS_CHANGED_EVENT, isSupportInputMemoryEnabled } from "@/features/history/services/settings";
import { loadSupportInputSelection } from "@/features/support/services/support-input-storage";
import type { SupportInputSelection } from "@/features/support/services/support-input-storage";

interface SupportInputSelectionState {
  /** localStorage からの読み込みが完了したかどうか。SSR/マウント前は常に false。 */
  isHydrated: boolean;
  /** 直近に読み取った「年齢と地域の保存」設定値。isHydrated が false の間は常に false。 */
  supportInputMemoryEnabled: boolean;
  /** supportInputMemoryEnabled が true の場合のみ、保存済みの選択(無ければ null)。false の場合は常に null。 */
  selection: SupportInputSelection | null;
}

const INITIAL_STATE: SupportInputSelectionState = { isHydrated: false, supportInputMemoryEnabled: false, selection: null };

/**
 * モジュールスコープに保持する状態(直近の getSnapshot 呼び出し時点のキャッシュ)。
 * localStorage というブラウザ外部の状態を React の外側に持ち、`useSyncExternalStore` 経由で
 * 購読する(`useSurveyProgress.ts` と同じ方針。`useEffect` 内で `setState` を呼ぶ実装は避けている)。
 */
let state: SupportInputSelectionState = INITIAL_STATE;

/**
 * 現在の localStorage の内容から state を再計算する純関数。
 *
 * 2026-08是正: 従来は「初回ハイドレーション後は値が変化しない」という誤った前提のもと、
 * 一度 isHydrated になると二度と再読込しない実装だった。しかし `/settings` で
 * 「年齢と地域の保存」を切り替えたのち、フルリロードを伴わない画面遷移で `/support` に
 * 戻ってきた場合(Next.js のクライアントサイドナビゲーションはモジュールスコープの状態を
 * リセットしない)、この関数は再実行されず、`SupportInputForm` の保存有無の説明文が
 * 古い設定値のまま表示され続けてしまうバグがあった。
 */
function computeState(): SupportInputSelectionState {
  const supportInputMemoryEnabled = isSupportInputMemoryEnabled();
  return {
    isHydrated: true,
    supportInputMemoryEnabled,
    selection: supportInputMemoryEnabled ? loadSupportInputSelection() : null,
  };
}

function selectionsEqual(a: SupportInputSelection | null, b: SupportInputSelection | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.lifestage === b.lifestage && a.municipality === b.municipality;
}

/**
 * `SETTINGS_CHANGED_EVENT`(`/settings` でのトグル操作時に settings.ts が dispatch する)を
 * 購読し、値が変わっていればマウント中のコンポーネントにも即時反映する。加えて、
 * (イベントを取りこぼす)アンマウント中の設定変更にも対応できるよう、getSnapshot 自体も
 * 呼び出しのたびに最新値と突き合わせる(下記参照)。
 */
function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = () => {
    state = computeState();
    onStoreChange();
  };
  window.addEventListener(SETTINGS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, listener);
}

/**
 * 呼び出しのたびに最新の localStorage の値と突き合わせ、変化が無ければ同じ参照
 * (`state`)を返す(useSyncExternalStore の「変化が無ければ同じ参照を返す」契約を守るため、
 * 変化が無い限り新しいオブジェクトを作らない)。変化があった場合のみ再計算してキャッシュを
 * 更新する。
 */
function getSnapshot(): SupportInputSelectionState {
  if (typeof window === "undefined") return state;
  const next = computeState();
  if (
    state.isHydrated &&
    state.supportInputMemoryEnabled === next.supportInputMemoryEnabled &&
    selectionsEqual(state.selection, next.selection)
  ) {
    return state;
  }
  state = next;
  return state;
}

function getServerSnapshot(): SupportInputSelectionState {
  return INITIAL_STATE;
}

/**
 * テスト専用リセット関数。モジュールスコープの状態はテスト間で共有されてしまうため、
 * 各テストの `afterEach` で呼び出してクリーンな状態に戻す。
 */
export function __resetSupportInputSelectionForTests(): void {
  state = INITIAL_STATE;
}

export function useSupportInputSelection(): SupportInputSelectionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
