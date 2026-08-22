import { describe, expect, it } from "vitest";

import { parseLifestagePrefillParam } from "@/features/support/services/parse-lifestage-prefill";

describe("parseLifestagePrefillParam", () => {
  it("既知のライフステージ値はそのまま返す", () => {
    expect(parseLifestagePrefillParam("working-adult")).toBe("working-adult");
  });

  it("未指定の場合は null", () => {
    expect(parseLifestagePrefillParam(undefined)).toBeNull();
  });

  it("未知の値・空文字列は null", () => {
    expect(parseLifestagePrefillParam("unknown")).toBeNull();
    expect(parseLifestagePrefillParam("")).toBeNull();
  });

  it("配列(同名クエリの重複指定)は null", () => {
    expect(parseLifestagePrefillParam(["preschool", "working-adult"])).toBeNull();
  });
});
