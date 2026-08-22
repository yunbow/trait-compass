import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  isCurrentLocationEnabled,
  isGuideExplanationsEnabled,
  isHistoryEnabled,
  isSupportInputMemoryEnabled,
  loadSettings,
  saveSettings,
  setCurrentLocationEnabled,
  setGuideExplanationsEnabled,
  setHistoryEnabled,
  setSupportInputMemoryEnabled,
} from "@/features/history/services/settings";

afterEach(() => {
  window.localStorage.clear();
});

describe("loadSettings / saveSettings", () => {
  it("未保存時は両方の設定をOFFで返す", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(isHistoryEnabled()).toBe(false);
    expect(isCurrentLocationEnabled()).toBe(false);
    expect(isSupportInputMemoryEnabled()).toBe(false);
    expect(isGuideExplanationsEnabled()).toBe(true);
  });

  it("保存した設定をそのまま読み込める", () => {
    saveSettings({ historyEnabled: true, currentLocationEnabled: true, supportInputMemoryEnabled: true, guideExplanationsEnabled: false });
    expect(loadSettings()).toEqual({ historyEnabled: true, currentLocationEnabled: true, supportInputMemoryEnabled: true, guideExplanationsEnabled: false });
    expect(isHistoryEnabled()).toBe(true);
  });

  it("不正な値が保存されている場合はデフォルトへフォールバックする(NFR-31)", () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ historyEnabled: "yes", currentLocationEnabled: false }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("破損した JSON の場合も例外を投げずデフォルトへフォールバックする", () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, "{not-json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("supportInputMemoryEnabled のみが欠落した旧形式の blob は既存設定を保持して false で補完する", () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ historyEnabled: true, currentLocationEnabled: true }));

    expect(loadSettings()).toEqual({ historyEnabled: true, currentLocationEnabled: true, supportInputMemoryEnabled: false, guideExplanationsEnabled: true });
  });
});

describe("setHistoryEnabled", () => {
  it("historyEnabled のみを更新する", () => {
    setHistoryEnabled(true);
    expect(loadSettings()).toEqual({ historyEnabled: true, currentLocationEnabled: false, supportInputMemoryEnabled: false, guideExplanationsEnabled: true });

    setHistoryEnabled(false);
    expect(loadSettings()).toEqual({ historyEnabled: false, currentLocationEnabled: false, supportInputMemoryEnabled: false, guideExplanationsEnabled: true });
  });
});

describe("setCurrentLocationEnabled", () => {
  it("currentLocationEnabled を更新し、既存の履歴設定を保持する", () => {
    setHistoryEnabled(true);
    setCurrentLocationEnabled(true);
    expect(loadSettings()).toEqual({ historyEnabled: true, currentLocationEnabled: true, supportInputMemoryEnabled: false, guideExplanationsEnabled: true });
    expect(isCurrentLocationEnabled()).toBe(true);
  });

  it("旧形式のキー欠落blobは安全側のデフォルトへフォールバックする", () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ historyEnabled: true }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("setSupportInputMemoryEnabled", () => {
  it("supportInputMemoryEnabled のみを更新し、他の設定項目を保持する", () => {
    setHistoryEnabled(true);
    setCurrentLocationEnabled(true);
    setSupportInputMemoryEnabled(true);

    expect(loadSettings()).toEqual({ historyEnabled: true, currentLocationEnabled: true, supportInputMemoryEnabled: true, guideExplanationsEnabled: true });
    expect(isSupportInputMemoryEnabled()).toBe(true);
  });
});

describe("setGuideExplanationsEnabled", () => {
  it("解説の表示設定のみを更新する", () => {
    setHistoryEnabled(true);
    setGuideExplanationsEnabled(false);

    expect(isGuideExplanationsEnabled()).toBe(false);
    expect(loadSettings()).toEqual({ historyEnabled: true, currentLocationEnabled: false, supportInputMemoryEnabled: false, guideExplanationsEnabled: false });
  });
});
