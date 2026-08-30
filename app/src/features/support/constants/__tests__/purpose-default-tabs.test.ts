import { describe, expect, it } from "vitest";

import { getPurposeDefaultTab } from "@/features/support/constants/purpose-default-tabs";
import { SCHOOL_INFO_TAB } from "@/features/support/constants/results-tabs";

describe("getPurposeDefaultTab", () => {
  it("小学生・中学生の「放課後等デイサービスを利用したい」は福祉ガイドを既定タブとする", () => {
    expect(getPurposeDefaultTab("elementary-junior-high", "use-day-service")).toBe("福祉ガイド");
  });

  it("小学生・中学生の「転学・特別支援学級について相談したい」は学校情報を既定タブとする", () => {
    expect(getPurposeDefaultTab("elementary-junior-high", "consult-transfer")).toBe(SCHOOL_INFO_TAB);
  });

  it("対応表に無い目的の場合は undefined を返す(呼び出し側で既存の既定タブ挙動にフォールバックする)", () => {
    expect(getPurposeDefaultTab("elementary-junior-high", "consult-school-trouble")).toBeUndefined();
    expect(getPurposeDefaultTab("elementary-junior-high", "certificate-info")).toBeUndefined();
  });

  it("未就学児の「児童発達支援・療育を利用したい」は福祉ガイドを既定タブとする", () => {
    expect(getPurposeDefaultTab("preschool", "use-day-service")).toBe("福祉ガイド");
  });

  it("高校生の「放課後等デイサービスを継続利用したい」は福祉ガイドを既定タブとする", () => {
    expect(getPurposeDefaultTab("high-school", "use-day-service")).toBe("福祉ガイド");
  });

  it("対応表に無いライフステージの場合は undefined を返す", () => {
    expect(getPurposeDefaultTab("university-vocational", "use-day-service")).toBeUndefined();
    expect(getPurposeDefaultTab("working-adult", "use-day-service")).toBeUndefined();
  });
});
