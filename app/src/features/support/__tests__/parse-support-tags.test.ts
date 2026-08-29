import { describe, expect, it } from "vitest";

import { SUPPORT_TAGS } from "@/features/support/services/category-tag-mapping";
import { hasExplicitSupportTagsParam, parseSupportTagsParam } from "@/features/support/services/parse-support-tags";
import { NO_TAGS_EXPLICIT_VALUE, SUPPORT_TAG_URL_IDS } from "@/features/support/services/support-tag-url";

describe("parseSupportTagsParam", () => {
  it("undefined の場合は空配列を返す(タグ無し=全般)", () => {
    expect(parseSupportTagsParam(undefined)).toEqual([]);
  });

  it("空文字の場合は空配列を返す", () => {
    expect(parseSupportTagsParam("")).toEqual([]);
  });

  it("カンマ区切りの既知IDを配列として返す", () => {
    expect(parseSupportTagsParam("sensory,emotion")).toEqual(["感覚", "こころ・感情"]);
  });

  it("配列(?tags=a&tags=b 相当)も受け付ける", () => {
    expect(parseSupportTagsParam(["sensory", "emotion"])).toEqual(["感覚", "こころ・感情"]);
  });

  it("未知の値は除外し、既知IDだけを残す", () => {
    expect(parseSupportTagsParam("sensory,foo,不正な値")).toEqual(["感覚"]);
  });

  it("未知の値のみの場合は空配列を返す", () => {
    expect(parseSupportTagsParam("foo,bar")).toEqual([]);
  });

  it("旧仕様の日本語ラベルは既知のIDとして扱わず除外する(生・URLエンコード済みいずれも、ハードカットオーバーにより互換維持しない)", () => {
    expect(parseSupportTagsParam("対人・コミュニケーション")).toEqual([]);
    expect(parseSupportTagsParam(encodeURIComponent("対人・コミュニケーション"))).toEqual([]);
  });

  it("重複する値は1件にまとめる", () => {
    expect(parseSupportTagsParam("sensory,sensory")).toEqual(["感覚"]);
  });

  it("前後の空白・空要素を無視する", () => {
    expect(parseSupportTagsParam(" sensory ,,emotion ")).toEqual(["感覚", "こころ・感情"]);
  });

  it("全SUPPORT_TAGSがそれぞれ単独で解析できる(網羅性)", () => {
    for (const tag of SUPPORT_TAGS) {
      expect(parseSupportTagsParam(SUPPORT_TAG_URL_IDS[tag])).toEqual([tag]);
    }
  });

  it("NO_TAGS_EXPLICIT_VALUE(明示的な全般)は既知タグを1件も含まないため空配列になる", () => {
    expect(parseSupportTagsParam(NO_TAGS_EXPLICIT_VALUE)).toEqual([]);
  });
});

describe("hasExplicitSupportTagsParam", () => {
  it("undefined(クエリ自体が無い)の場合は false", () => {
    expect(hasExplicitSupportTagsParam(undefined)).toBe(false);
  });

  it("空文字(?tags= のように付いてはいる)の場合は true", () => {
    expect(hasExplicitSupportTagsParam("")).toBe(true);
  });

  it("NO_TAGS_EXPLICIT_VALUE(明示的な全般)の場合は true", () => {
    expect(hasExplicitSupportTagsParam(NO_TAGS_EXPLICIT_VALUE)).toBe(true);
  });

  it("実際のタグ値が入っている場合は true", () => {
    expect(hasExplicitSupportTagsParam("sensory")).toBe(true);
    expect(hasExplicitSupportTagsParam(["sensory", "emotion"])).toBe(true);
  });
});
