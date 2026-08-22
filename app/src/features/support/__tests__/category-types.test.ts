import { describe, expect, it } from "vitest";

import { CATEGORY_TYPES, parseCategoryTypeParam } from "@/features/support/constants/category-types";

describe("CATEGORY_TYPES", () => {
  it("FAQ タブを含まない4分類のみで構成される(FR-028)", () => {
    expect(CATEGORY_TYPES).toEqual(["相談窓口", "支援制度", "福祉ガイド", "発達障害支援資料"]);
    expect(CATEGORY_TYPES).not.toContain("FAQ");
  });
});

describe("parseCategoryTypeParam", () => {
  it("既知の値はそのまま返す", () => {
    expect(parseCategoryTypeParam("支援制度")).toBe("支援制度");
  });

  it("未指定の場合は既定タブ(先頭の相談窓口)を返す", () => {
    expect(parseCategoryTypeParam(undefined)).toBe("相談窓口");
  });

  it("未知の値(URL 改ざん等)の場合も既定タブへフォールバックする", () => {
    expect(parseCategoryTypeParam("FAQ")).toBe("相談窓口");
    expect(parseCategoryTypeParam("")).toBe("相談窓口");
  });
});
