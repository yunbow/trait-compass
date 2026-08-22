import { describe, expect, it } from "vitest";

import { parseResultsTabParam, SCHOOL_INFO_TAB } from "@/features/support/constants/results-tabs";

describe("parseResultsTabParam", () => {
  it("4分類と学校情報をそのまま返す", () => { expect(parseResultsTabParam("支援制度")).toBe("支援制度"); expect(parseResultsTabParam(SCHOOL_INFO_TAB)).toBe(SCHOOL_INFO_TAB); });
  it("不正値は相談窓口へフォールバックする", () => { expect(parseResultsTabParam("不正")).toBe("相談窓口"); });
});
