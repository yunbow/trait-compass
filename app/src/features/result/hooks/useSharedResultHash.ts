"use client";

import { useSyncExternalStore } from "react";

import { decodeShareHash, getShareHashParam } from "@/features/result/services/share-codec";
import type { ShareData } from "@/features/result/services/share-codec";

interface SharedResultHashState {
  /** localStorage 同様、初回マウント時の location.hash 読み込みが完了したか。 */
  isHydrated: boolean;
  /**
   * URL ハッシュに `r` パラメータ自体が存在するか(値の正当性は問わない)。
   * `true` の場合、結果画面は自分の progress ではなくこのハッシュ由来のデータを
   * 優先して表示する(チケット記載の「ハッシュがある場合はハッシュ優先」)。
   */
  hasShareParam: boolean;
  /** デコードに成功した共有データ。`hasShareParam` が false、またはデコード失敗時は null。 */
  sharedData: ShareData | null;
}

const INITIAL_STATE: SharedResultHashState = {
  isHydrated: false,
  hasShareParam: false,
  sharedData: null,
};

let state: SharedResultHashState = INITIAL_STATE;
let hydrated = false;

// location.hash はブラウザ外部の状態であり、useResultProgress と同じ方針で
// useSyncExternalStore + 初回読み込みキャッシュのパターンを踏襲する。
// この判定はマウント時(= 画面が開かれた時点)の1回のみ行い、以降ユーザーが
// 「共有 URL を作成」で自らハッシュを付与しても再評価しない
// (自分の結果画面が、生成した瞬間に「共有された結果」表示へ切り替わってしまうのを防ぐ)。
function subscribe(): () => void {
  return () => {};
}

function ensureHydrated(): void {
  if (hydrated || typeof window === "undefined") {
    return;
  }
  const hash = window.location.hash;
  const raw = getShareHashParam(hash);
  state = {
    isHydrated: true,
    hasShareParam: raw !== null,
    sharedData: raw === null ? null : decodeShareHash(hash),
  };
  hydrated = true;
}

function getSnapshot(): SharedResultHashState {
  ensureHydrated();
  return state;
}

function getServerSnapshot(): SharedResultHashState {
  return INITIAL_STATE;
}

/**
 * テスト専用リセット関数。`__resetResultProgressForTests` と同じく、モジュール
 * スコープのキャッシュをテスト間で共有しないよう各テストの `afterEach` で呼ぶ。
 */
export function __resetSharedResultHashForTests(): void {
  state = INITIAL_STATE;
  hydrated = false;
}

/**
 * 結果画面が `#r=...` 付きの共有 URL 経由で開かれたかどうかを、初回マウント時に
 * 1回だけ判定するフック(TICKET-0009)。
 */
export function useSharedResultHash(): SharedResultHashState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
