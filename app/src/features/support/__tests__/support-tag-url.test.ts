import { describe, expect, it } from "vitest";

import { SUPPORT_TAGS } from "@/features/support/services/category-tag-mapping";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import {
  decodeSupportTagUrlId,
  encodeSupportTagsParam,
  isSupportTagUrlId,
  setSupportTagsParam,
  SUPPORT_TAG_URL_IDS,
} from "@/features/support/services/support-tag-url";
import type { SupportTagUrlId } from "@/features/support/services/support-tag-url";

/** encodeSupportTagsParam の出力を、production側の parseSupportTagsParam に頼らず
 * isSupportTagUrlId/decodeSupportTagUrlId だけで往復検証するためのテスト専用ヘルパー。 */
function decodeParam(param: string): SupportTag[] {
  return param
    .split(",")
    .filter((value): value is SupportTagUrlId => isSupportTagUrlId(value))
    .map(decodeSupportTagUrlId);
}

describe("SUPPORT_TAG_URL_IDS", () => {
  it("SUPPORT_TAGS の全件に一意なIDが割り当てられている(重複ハードコードに頼らず実行時に検証)", () => {
    const ids = SUPPORT_TAGS.map((tag) => SUPPORT_TAG_URL_IDS[tag]);
    expect(new Set(ids).size).toBe(SUPPORT_TAGS.length);
  });

  it("IDは英小文字のみのASCII文字列である(ブラウザ履歴・共有URLへ日本語ラベルを出さないため)", () => {
    for (const tag of SUPPORT_TAGS) {
      expect(SUPPORT_TAG_URL_IDS[tag]).toMatch(/^[a-z]+$/);
    }
  });
});

describe("isSupportTagUrlId", () => {
  it("既知のIDには true を返す", () => {
    for (const tag of SUPPORT_TAGS) {
      expect(isSupportTagUrlId(SUPPORT_TAG_URL_IDS[tag])).toBe(true);
    }
  });

  it("未知・不正な値には例外を投げずに false を返す", () => {
    expect(isSupportTagUrlId("foo")).toBe(false);
    expect(isSupportTagUrlId("")).toBe(false);
    expect(isSupportTagUrlId("social,foo,emotion")).toBe(false);
  });

  it("旧仕様の日本語ラベルは、生・URLエンコード済みいずれも既知のIDとして扱わない(ハードカットオーバー)", () => {
    expect(isSupportTagUrlId("対人・コミュニケーション")).toBe(false);
    expect(isSupportTagUrlId(encodeURIComponent("対人・コミュニケーション"))).toBe(false);
  });
});

describe("decodeSupportTagUrlId", () => {
  it("各IDを対応する相談分野タグへ変換する", () => {
    for (const tag of SUPPORT_TAGS) {
      expect(decodeSupportTagUrlId(SUPPORT_TAG_URL_IDS[tag])).toBe(tag);
    }
  });
});

describe("encodeSupportTagsParam", () => {
  it("単一タグをIDへ変換する", () => {
    expect(encodeSupportTagsParam(["感覚"])).toBe("sensory");
  });

  it("全SUPPORT_TAGSを順序を保ったままカンマ区切りへ変換する", () => {
    expect(encodeSupportTagsParam(SUPPORT_TAGS)).toBe(SUPPORT_TAGS.map((tag) => SUPPORT_TAG_URL_IDS[tag]).join(","));
  });

  it("任意の3件の部分集合・並び順を保つ", () => {
    const subset: SupportTag[] = ["こだわり", "対人・コミュニケーション", "学習・からだ"];
    expect(encodeSupportTagsParam(subset)).toBe("routine,social,learning");
  });

  it("空配列は空文字を返す", () => {
    expect(encodeSupportTagsParam([])).toBe("");
  });
});

describe("encode → decode 往復", () => {
  it("単一タグで元の配列に戻る", () => {
    const tags: SupportTag[] = ["こころ・感情"];
    expect(decodeParam(encodeSupportTagsParam(tags))).toEqual(tags);
  });

  it("全6タグで元の配列・順序に戻る", () => {
    expect(decodeParam(encodeSupportTagsParam(SUPPORT_TAGS))).toEqual(SUPPORT_TAGS);
  });

  it("任意の3件の部分集合・並び順で元の配列に戻る", () => {
    const tags: SupportTag[] = ["不注意・段取り", "感覚", "こだわり"];
    expect(decodeParam(encodeSupportTagsParam(tags))).toEqual(tags);
  });
});

describe("setSupportTagsParam", () => {
  it("タグがある場合は tags クエリをASCII IDのカンマ区切りで設定する", () => {
    const query = new URLSearchParams();
    setSupportTagsParam(query, ["感覚", "こころ・感情"]);
    expect(query.get("tags")).toBe("sensory,emotion");
  });

  it("タグが空の場合は tags クエリを付けない", () => {
    const query = new URLSearchParams();
    setSupportTagsParam(query, []);
    expect(query.has("tags")).toBe(false);
  });

  it("タグが空になった場合、既存の tags クエリを削除する", () => {
    const query = new URLSearchParams("tags=sensory");
    setSupportTagsParam(query, []);
    expect(query.has("tags")).toBe(false);
  });
});
