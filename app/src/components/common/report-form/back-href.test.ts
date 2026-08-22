import { describe, expect, it } from "vitest";

import { firstValue, resolveBackHref } from "@/components/common/report-form/back-href";

describe("firstValue(Phase 2: 2-10 ReportFormParts)", () => {
  it("配列の場合、先頭の値を返す", () => {
    expect(firstValue(["a", "b"])).toBe("a");
  });

  it("単一値の場合、そのまま返す", () => {
    expect(firstValue("a")).toBe("a");
  });

  it("undefinedの場合、undefinedを返す", () => {
    expect(firstValue(undefined)).toBeUndefined();
  });
});

describe("resolveBackHref(Phase 2: 2-10 ReportFormParts)", () => {
  it("有効な相対パスはそのまま採用する", () => {
    expect(resolveBackHref("/support/results?age=child")).toBe("/support/results?age=child");
  });

  it("欠損の場合は/supportにフォールバックする", () => {
    expect(resolveBackHref(undefined)).toBe("/support");
  });

  it("プロトコル相対URL(オープンリダイレクト狙い)は/supportにフォールバックする", () => {
    expect(resolveBackHref("//evil.com/phishing")).toBe("/support");
  });

  it("絶対URLは/supportにフォールバックする", () => {
    expect(resolveBackHref("https://evil.com")).toBe("/support");
  });

  it("配列で渡された場合、先頭の値を検証対象にする", () => {
    expect(resolveBackHref(["/support/results", "/other"])).toBe("/support/results");
  });

  it("fallbackを指定した場合、欠損・不正値ではそちらを採用する", () => {
    expect(resolveBackHref(undefined, "/result")).toBe("/result");
    expect(resolveBackHref("https://evil.com", "/result")).toBe("/result");
  });

  it("fallbackを指定しても、有効な相対パスはそのまま採用する", () => {
    expect(resolveBackHref("/help", "/result")).toBe("/help");
  });
});
