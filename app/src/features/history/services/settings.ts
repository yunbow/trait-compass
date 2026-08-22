import { z } from "zod";

import { isBrowser, readLocalJson, writeLocalJson } from "@/lib/storage/local-json-store";

/**
 * 履歴保存・年齢/地域記憶トグル等、設定画面(TICKET-0027)の設定値を保持する localStorage キーと
 * スキーマ・アクセス関数。
 *
 * NFR-32(データ保存の分離)により、この localStorage は「進行状態・設定」専用であり、
 * 履歴データ本体(スコア・日時)は別ストア(IndexedDB、history-store.ts)に保存する。
 * FR-051 により `historyEnabled` のデフォルトは false(完全オプトイン)。
 */
export const SETTINGS_STORAGE_KEY = "nd-settings";
export const SETTINGS_CHANGED_EVENT = "nd-settings-changed";

export const SettingsSchema = z
  .object({
    /** 履歴保存(IndexedDB への保存)を許可するかどうか。デフォルト false(FR-051, NFR-37)。 */
    historyEnabled: z.boolean(),
    // localStorage 後方互換のためだけに保持し、UI からは読み書きしない。
    currentLocationEnabled: z.boolean(),
    /**
     * /support(年齢・区市町村選択画面)の入力内容を記憶するかどうか。デフォルト false
     * (NFR-32)。historyEnabled とは独立したオプトインであり、historyEnabled が true でも
     * この値が false なら /support の入力は記憶しない(意図的な設計。過去バージョンで
     * historyEnabled 経由で記憶されていたユーザーも、この項目は新規に false から始まる)。
     * `.default(false)` は、この項目が無い旧形式の保存済み設定(historyEnabled/
     * currentLocationEnabled のみ)を読み込んだ際に、他の2項目の値を保持したまま
     * この項目だけ false で補完するための後方互換対応。
     */
    supportInputMemoryEnabled: z.boolean().default(false),
    /** 結果画面の制度・手続きの解説を表示するか。既定は表示する。 */
    guideExplanationsEnabled: z.boolean().default(true),
  })
  .strict();
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  historyEnabled: false,
  currentLocationEnabled: false,
  supportInputMemoryEnabled: false,
  guideExplanationsEnabled: true,
};

/**
 * 保存済みの設定を読み込む。未保存・不正な値・localStorage 利用不可
 * (プライベートブラウジング等)のいずれの場合も例外を投げず、安全側のデフォルト
 * (`historyEnabled: false`)を返す(NFR-31 と同じ方針、progress.ts を参照)。
 */
export function loadSettings(): Settings {
  return readLocalJson(SETTINGS_STORAGE_KEY, SettingsSchema) ?? DEFAULT_SETTINGS;
}

/**
 * 設定を保存する。SSR・localStorage 利用不可時は何もしない(例外を投げない)。
 */
export function saveSettings(settings: Settings): void {
  if (writeLocalJson(SETTINGS_STORAGE_KEY, settings)) {
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }
}

/** 履歴保存が有効かどうか(結果画面・設定画面双方から参照する)。 */
export function isHistoryEnabled(): boolean {
  return loadSettings().historyEnabled;
}

/**
 * 履歴保存トグルの値のみを更新する(他の設定項目があっても保持する)。
 * TICKET-0027(設定画面)のトグル、および結果画面の同意フローの両方から呼ばれる。
 */
export function setHistoryEnabled(enabled: boolean): void {
  saveSettings({ ...loadSettings(), historyEnabled: enabled });
}

// localStorage 後方互換のためだけに保持し、UI からは読み書きしない。
export function isCurrentLocationEnabled(): boolean {
  return loadSettings().currentLocationEnabled;
}

// localStorage 後方互換のためだけに保持し、UI からは読み書きしない。
export function setCurrentLocationEnabled(enabled: boolean): void {
  saveSettings({ ...loadSettings(), currentLocationEnabled: enabled });
}

/** /support の年齢・区市町村の記憶が有効かどうか(historyEnabled とは独立、既定 false)。 */
export function isSupportInputMemoryEnabled(): boolean {
  return loadSettings().supportInputMemoryEnabled;
}

/** /support の年齢・区市町村の記憶トグルのみを更新する(他の設定項目を保持する)。 */
export function setSupportInputMemoryEnabled(enabled: boolean): void {
  saveSettings({ ...loadSettings(), supportInputMemoryEnabled: enabled });
}

/** 結果画面の解説を表示するか(既定は表示)。 */
export function isGuideExplanationsEnabled(): boolean {
  return loadSettings().guideExplanationsEnabled;
}

/** 結果画面の解説表示トグルのみを更新する。 */
export function setGuideExplanationsEnabled(enabled: boolean): void {
  saveSettings({ ...loadSettings(), guideExplanationsEnabled: enabled });
}

/** 同じタブ内で変更された設定も購読できるようにする。 */
export function subscribeToSettings(onStoreChange: () => void): () => void {
  if (!isBrowser()) return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener(SETTINGS_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SETTINGS_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}
