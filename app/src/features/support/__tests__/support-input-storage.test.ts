import { afterEach, describe, expect, it } from "vitest";

import {
  SUPPORT_INPUT_STORAGE_KEY,
  clearSupportInputSelection,
  loadSupportInputSelection,
  saveSupportInputSelection,
} from "@/features/support/services/support-input-storage";

afterEach(() => {
  window.localStorage.clear();
});

describe("loadSupportInputSelection / saveSupportInputSelection / clearSupportInputSelection", () => {
  it("保存前は null を返す", () => {
    expect(loadSupportInputSelection()).toBeNull();
  });

  it("保存した選択をそのまま読み込める", () => {
    const selection = { lifestage: "elementary-junior-high" as const, municipality: "世田谷区" as const };

    saveSupportInputSelection(selection);

    expect(loadSupportInputSelection()).toEqual(selection);
  });

  it("保存時は municipality を5桁コードで永続化する", () => {
    saveSupportInputSelection({ lifestage: "working-adult", municipality: "世田谷区" });

    expect(JSON.parse(window.localStorage.getItem(SUPPORT_INPUT_STORAGE_KEY) ?? "")).toEqual({
      lifestage: "working-adult",
      municipality: "13112",
    });
  });

  it("旧形式の municipality 名を後方互換で読み込める", () => {
    window.localStorage.setItem(
      SUPPORT_INPUT_STORAGE_KEY,
      JSON.stringify({ lifestage: "working-adult", municipality: "新宿区" }),
    );

    expect(loadSupportInputSelection()).toEqual({ lifestage: "working-adult", municipality: "新宿区" });
  });

  it("壊れた JSON・スキーマ不正な値は例外を投げず null を返す", () => {
    window.localStorage.setItem(SUPPORT_INPUT_STORAGE_KEY, "{not-json");
    expect(loadSupportInputSelection()).toBeNull();

    window.localStorage.setItem(
      SUPPORT_INPUT_STORAGE_KEY,
      JSON.stringify({ lifestage: "unknown-lifestage", municipality: "未知の区市町村" }),
    );
    expect(loadSupportInputSelection()).toBeNull();
  });

  it("clearSupportInputSelection で削除できる", () => {
    saveSupportInputSelection({ lifestage: "working-adult", municipality: "新宿区" });
    clearSupportInputSelection();

    expect(loadSupportInputSelection()).toBeNull();
  });
});
