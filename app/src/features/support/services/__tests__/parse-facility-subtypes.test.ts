import { describe, expect, it } from "vitest";

import { parseFacilitySubtypesParam } from "@/features/support/services/parse-facility-subtypes";

describe("parseFacilitySubtypesParam", () => {
  it("undefined の場合は空配列を返す", () => {
    expect(parseFacilitySubtypesParam(undefined)).toEqual([]);
  });

  it("空文字の場合は空配列を返す", () => {
    expect(parseFacilitySubtypesParam("")).toEqual([]);
  });

  it("カンマ区切りの文字列を配列として返す", () => {
    expect(parseFacilitySubtypesParam("保育施設,保健施設")).toEqual(["保育施設", "保健施設"]);
  });

  it("配列(?subtype=a&subtype=b 相当)も受け付ける", () => {
    expect(parseFacilitySubtypesParam(["保育施設", "保健施設"])).toEqual(["保育施設", "保健施設"]);
  });

  it("前後の空白・空要素を無視する", () => {
    expect(parseFacilitySubtypesParam(" 保育施設 ,,保健施設 ")).toEqual(["保育施設", "保健施設"]);
  });

  it("重複する値は1件にまとめる", () => {
    expect(parseFacilitySubtypesParam("保育施設,保育施設")).toEqual(["保育施設"]);
  });

  it("配列入力でも重複する値は1件にまとめる", () => {
    expect(parseFacilitySubtypesParam(["保育施設", "保育施設", "保健施設"])).toEqual(["保育施設", "保健施設"]);
  });

  it("ホワイトリストを持たないため、未知・任意の値もそのまま残す", () => {
    expect(parseFacilitySubtypesParam("架空の分類,別の架空分類")).toEqual(["架空の分類", "別の架空分類"]);
  });

  it("空文字の要素のみの配列は空配列を返す", () => {
    expect(parseFacilitySubtypesParam(["", "  "])).toEqual([]);
  });
});
