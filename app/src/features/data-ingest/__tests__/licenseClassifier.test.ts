import { describe, expect, it } from "vitest";

import { classifyLicense, isLicenseAllowed } from "@/features/data-ingest/services/licenseClassifier";

describe("classifyLicense", () => {
  it("cc-by-4.0 を区分Aの低リスク・投入許可として分類する", () => {
    const result = classifyLicense("cc-by-4.0");
    expect(result.category).toBe("A");
    expect(result.riskLevel).toBe("low");
    expect(result.allowed).toBe(true);
  });

  it("大文字・前後空白を無視して分類する(表記ゆれ吸収)", () => {
    const result = classifyLicense("  CC-BY-4.0  ");
    expect(result.category).toBe("A");
    expect(result.allowed).toBe(true);
  });

  it("政府標準利用規約(第2.0版)を区分Fの低リスク・投入許可として分類する", () => {
    const result = classifyLicense("government-standard-terms-2.0");
    expect(result.category).toBe("F");
    expect(result.riskLevel).toBe("low");
    expect(result.allowed).toBe(true);
  });

  it("政府標準利用規約(第1.0版)を区分Gの低リスク・投入許可として分類する", () => {
    const result = classifyLicense("government-standard-terms-1.0");
    expect(result.category).toBe("G");
    expect(result.allowed).toBe(true);
  });

  it("公共データ利用規約(pdl-1.0、TICKET-0049 hattatsu.go.jp で実測)を区分Fの低リスク・投入許可として分類する", () => {
    const result = classifyLicense("pdl-1.0");
    expect(result.category).toBe("F");
    expect(result.riskLevel).toBe("low");
    expect(result.allowed).toBe(true);
  });

  it("未指定・不明なライセンス(notspecified)は区分H・高リスク・投入不可にする", () => {
    const result = classifyLicense("notspecified");
    expect(result.category).toBe("H");
    expect(result.riskLevel).toBe("high");
    expect(result.allowed).toBe(false);
  });

  it("null/undefined も未指定として扱う", () => {
    expect(classifyLicense(null).allowed).toBe(false);
    expect(classifyLicense(undefined).allowed).toBe(false);
  });

  it("表記ゆれの government-standard(汎用ラベル)のような未分類ライセンスは区分H・中リスク・投入不可にする", () => {
    const result = classifyLicense("government-standard");
    expect(result.category).toBe("H");
    expect(result.riskLevel).toBe("medium");
    expect(result.allowed).toBe(false);
  });

  it("完全に未知のライセンス識別子は区分H・中リスク・投入不可にする(安全側フィルタ)", () => {
    const result = classifyLicense("some-custom-municipality-terms-v3");
    expect(result.category).toBe("H");
    expect(result.allowed).toBe(false);
  });
});

describe("isLicenseAllowed", () => {
  it("A/F/G のみ true を返す", () => {
    expect(isLicenseAllowed("cc-by-4.0")).toBe(true);
    expect(isLicenseAllowed("government-standard-terms-2.0")).toBe(true);
    expect(isLicenseAllowed("government-standard-terms-1.0")).toBe(true);
    expect(isLicenseAllowed("pdl-1.0")).toBe(true);
  });

  it("B〜E・H相当は false を返す", () => {
    expect(isLicenseAllowed("all-rights-reserved")).toBe(false);
    expect(isLicenseAllowed("government-standard")).toBe(false);
    expect(isLicenseAllowed("")).toBe(false);
  });
});
