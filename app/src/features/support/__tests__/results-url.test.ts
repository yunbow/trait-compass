import { describe, expect, it } from "vitest";

import {
  buildContentReportGuideHref,
  buildPrepareHref,
  buildPurposeHref,
  buildPurposeToResultsHref,
  buildRecommendHref,
  buildResultsHref,
  buildSupportBackHref,
  buildSupportEntryHref,
} from "@/features/support/services/results-url";
import { NO_TAGS_EXPLICIT_VALUE } from "@/features/support/services/support-tag-url";

const CODE = "13106";

function url(href: string) {
  return new URL(href, "http://localhost");
}

describe("results URL builders", () => {
  it("buildResultsHref は自治体コードと検索条件を引き継ぐ", () => {
    const result = url(buildResultsHref({ age: "child", municipalityCode: CODE, tags: ["こだわり"], lifestage: "preschool", purposeId: "use-day-service" }, "学校情報"));

    expect(result.pathname).toBe("/support/results");
    expect(result.searchParams.get("municipality")).toBe(CODE);
    expect(result.searchParams.get("tags")).toBe("routine");
    expect(result.searchParams.get("lifestage")).toBe("preschool");
    expect(result.searchParams.get("purpose")).toBe("use-day-service");
    expect(result.searchParams.get("tab")).toBe("学校情報");
  });

  it("buildSupportBackHref は自治体コードを引き継ぐ", () => {
    const result = url(buildSupportBackHref({ municipalityCode: CODE, lifestage: "working-adult", tags: [] }));
    expect(result.pathname).toBe("/support");
    expect(result.searchParams.get("municipality")).toBe(CODE);
    expect(result.searchParams.has("tags")).toBe(false);
  });

  it("buildPrepareHref は自治体コードを引き継ぐ", () => {
    const result = url(buildPrepareHref({ age: "adult", municipalityCode: CODE, tags: ["感覚"], lifestage: "working-adult" }));
    expect(result.pathname).toBe("/result/prepare");
    expect(result.searchParams.get("municipality")).toBe(CODE);
    expect(result.searchParams.get("tags")).toBe("sensory");
  });

  it("buildRecommendHref は自治体コードと目的を引き継ぐ", () => {
    const result = url(buildRecommendHref({ age: "adult", municipalityCode: CODE, tags: [], purposeId: "consult-development" }));
    expect(result.pathname).toBe("/result/recommend");
    expect(result.searchParams.get("municipality")).toBe(CODE);
    expect(result.searchParams.get("purpose")).toBe("consult-development");
  });

  it("buildPurposeHref は自治体コードを引き継ぐ", () => {
    const result = url(buildPurposeHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: [] }));
    expect(result.pathname).toBe("/support/purpose");
    expect(result.searchParams.get("municipality")).toBe(CODE);
  });

  it("buildPurposeToResultsHref は自治体コードと目的を引き継ぐ", () => {
    const result = url(buildPurposeToResultsHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: [], purposeId: "use-day-service" }));
    expect(result.pathname).toBe("/support/results");
    expect(result.searchParams.get("municipality")).toBe(CODE);
    expect(result.searchParams.get("purpose")).toBe("use-day-service");
  });

  it.each([
    ["preschool", "児童発達支援"],
    ["elementary-junior-high", "放課後等デイサービス"],
    ["high-school", "放課後等デイサービス"],
  ] as const)("buildPurposeToResultsHref は %s の「利用したい」目的で tab=福祉ガイド・subtype=%s を付ける", (lifestage, subtype) => {
    const result = url(buildPurposeToResultsHref({ age: "child", municipalityCode: CODE, lifestage, tags: [], purposeId: "use-day-service" }));
    expect(result.searchParams.get("tab")).toBe("福祉ガイド");
    expect(result.searchParams.get("subtype")).toBe(subtype);
  });

  it("buildPurposeToResultsHref は対応表に無い目的の場合 tab・subtype クエリを付けない", () => {
    const result = url(buildPurposeToResultsHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: [], purposeId: "consult-development" }));
    expect(result.searchParams.has("tab")).toBe(false);
    expect(result.searchParams.has("subtype")).toBe(false);
  });

  it("buildPurposeToResultsHref は purposeId 未指定の場合 tab・subtype クエリを付けない", () => {
    const result = url(buildPurposeToResultsHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: [] }));
    expect(result.searchParams.has("tab")).toBe(false);
    expect(result.searchParams.has("subtype")).toBe(false);
  });

  it("buildContentReportGuideHref は自治体コードを引き継ぐ", () => {
    const result = url(buildContentReportGuideHref({ municipalityCode: CODE, tab: "福祉ガイド", lifestage: "preschool" }));
    expect(result.pathname).toBe("/support/content-report");
    expect(result.searchParams.get("municipality")).toBe(CODE);
    expect(result.searchParams.get("tab")).toBe("福祉ガイド");
  });

  it("buildContentReportGuideHref は back クエリを含まない(P0対応: 検索条件の二重露出を避ける)", () => {
    const result = url(buildContentReportGuideHref({ municipalityCode: CODE, tab: "福祉ガイド", lifestage: "preschool" }));
    expect(result.searchParams.has("back")).toBe(false);
  });

  it("tags を持つ全ビルダーは tags クエリの生文字列にASCII文字のみを出力する(日本語・パーセントエンコードされたUTF-8を含まない。他クエリの日本語値は対象外)", () => {
    const NON_ASCII = /[^\x00-\x7F]/;
    const hrefs = [
      buildResultsHref({ age: "child", municipalityCode: CODE, tags: ["こだわり", "感覚"], lifestage: "preschool" }, "学校情報"),
      buildSupportBackHref({ municipalityCode: CODE, lifestage: null, tags: ["こだわり", "感覚"] }),
      buildPrepareHref({ age: "adult", municipalityCode: CODE, tags: ["こだわり", "感覚"] }),
      buildRecommendHref({ age: "adult", municipalityCode: CODE, tags: ["こだわり", "感覚"] }),
      buildPurposeHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: ["こだわり", "感覚"] }),
      buildPurposeToResultsHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: ["こだわり", "感覚"] }),
    ];
    for (const href of hrefs) {
      const rawTagsValue = href.match(/[?&]tags=([^&]*)/)?.[1];
      expect(rawTagsValue).not.toBeUndefined();
      expect(rawTagsValue).not.toMatch(NON_ASCII);
      expect(url(href).searchParams.get("tags")).toBe("routine,sensory");
    }
  });

  it("buildSupportEntryHref はタグをASCII IDのカンマ区切りにした tags クエリのみを付ける", () => {
    const result = url(buildSupportEntryHref(["対人・コミュニケーション", "こころ・感情"]));
    expect(result.pathname).toBe("/support");
    expect(result.searchParams.get("tags")).toBe("social,emotion");
    expect([...result.searchParams.keys()]).toEqual(["tags"]);
  });

  it("buildSupportEntryHref はタグが無い場合、クエリを付けず /support をそのまま返す", () => {
    expect(buildSupportEntryHref([])).toBe("/support");
  });

  describe("createSupportQuery を使うビルダーのクエリ順序(age → municipality → lifestage → tags → purpose)", () => {
    it("buildResultsHref", () => {
      const href = buildResultsHref({ age: "child", municipalityCode: CODE, tags: ["こだわり"], lifestage: "preschool", purposeId: "use-day-service" }, "学校情報");
      const [, search] = href.split("?");
      expect([...new URLSearchParams(search).keys()]).toEqual(["age", "municipality", "lifestage", "tags", "purpose", "tab"]);
    });

    it("buildSupportBackHref", () => {
      const href = buildSupportBackHref({ municipalityCode: CODE, lifestage: "preschool", tags: ["こだわり"] });
      const [, search] = href.split("?");
      expect([...new URLSearchParams(search).keys()]).toEqual(["municipality", "lifestage", "tags"]);
    });

    it("buildPrepareHref", () => {
      const href = buildPrepareHref({ age: "adult", municipalityCode: CODE, tags: ["こだわり"], lifestage: "working-adult" });
      const [, search] = href.split("?");
      expect([...new URLSearchParams(search).keys()]).toEqual(["age", "municipality", "lifestage", "tags"]);
    });

    it("buildRecommendHref", () => {
      const href = buildRecommendHref({ age: "adult", municipalityCode: CODE, tags: ["こだわり"], lifestage: "working-adult", purposeId: "consult-development" });
      const [, search] = href.split("?");
      expect([...new URLSearchParams(search).keys()]).toEqual(["age", "municipality", "lifestage", "tags", "purpose"]);
    });

    it("buildPurposeHref", () => {
      const href = buildPurposeHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: ["こだわり"] });
      const [, search] = href.split("?");
      expect([...new URLSearchParams(search).keys()]).toEqual(["age", "municipality", "lifestage", "tags"]);
    });

    it("buildPurposeToResultsHref", () => {
      // 目的別の既定 tab/subtype(purpose-default-tabs.ts/purpose-default-subtypes.ts)が
      // 付かない組み合わせを使い、createSupportQuery 由来の基本クエリの順序のみを検証する。
      const href = buildPurposeToResultsHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: ["こだわり"], purposeId: "consult-development" });
      const [, search] = href.split("?");
      expect([...new URLSearchParams(search).keys()]).toEqual(["age", "municipality", "lifestage", "tags", "purpose"]);
    });
  });

  describe("引継ぎ対象の網羅テスト(全項目を渡したとき、載せるべき項目をすべて載せ、載せてはいけない項目を載せない)", () => {
    it("buildResultsHref はage/municipality/lifestage/tags/purposeをすべて載せる", () => {
      const result = url(buildResultsHref({ age: "child", municipalityCode: CODE, tags: ["こだわり"], lifestage: "preschool", purposeId: "use-day-service" }, "学校情報"));
      expect(result.searchParams.get("age")).toBe("child");
      expect(result.searchParams.get("municipality")).toBe(CODE);
      expect(result.searchParams.get("lifestage")).toBe("preschool");
      expect(result.searchParams.get("tags")).toBe("routine");
      expect(result.searchParams.get("purpose")).toBe("use-day-service");
    });

    it("buildSupportBackHref はmunicipality/lifestage/tagsのみを載せ、age/purposeは載せない", () => {
      const result = url(buildSupportBackHref({ municipalityCode: CODE, lifestage: "preschool", tags: ["こだわり"] }));
      expect(result.searchParams.get("municipality")).toBe(CODE);
      expect(result.searchParams.get("lifestage")).toBe("preschool");
      expect(result.searchParams.get("tags")).toBe("routine");
      expect(result.searchParams.has("age")).toBe(false);
      expect(result.searchParams.has("purpose")).toBe(false);
    });

    it("buildPrepareHref はage/municipality/lifestage/tagsを載せ、purposeは載せない", () => {
      const result = url(buildPrepareHref({ age: "adult", municipalityCode: CODE, tags: ["こだわり"], lifestage: "working-adult" }));
      expect(result.searchParams.get("age")).toBe("adult");
      expect(result.searchParams.get("municipality")).toBe(CODE);
      expect(result.searchParams.get("lifestage")).toBe("working-adult");
      expect(result.searchParams.get("tags")).toBe("routine");
      expect(result.searchParams.has("purpose")).toBe(false);
    });

    it("buildRecommendHref はage/municipality/lifestage/tags/purposeをすべて載せる", () => {
      const result = url(buildRecommendHref({ age: "adult", municipalityCode: CODE, tags: ["こだわり"], lifestage: "working-adult", purposeId: "consult-development" }));
      expect(result.searchParams.get("age")).toBe("adult");
      expect(result.searchParams.get("municipality")).toBe(CODE);
      expect(result.searchParams.get("lifestage")).toBe("working-adult");
      expect(result.searchParams.get("tags")).toBe("routine");
      expect(result.searchParams.get("purpose")).toBe("consult-development");
    });

    it("buildPurposeHref はage/municipality/lifestage/tagsを載せ、purposeは載せない", () => {
      const result = url(buildPurposeHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: ["こだわり"] }));
      expect(result.searchParams.get("age")).toBe("child");
      expect(result.searchParams.get("municipality")).toBe(CODE);
      expect(result.searchParams.get("lifestage")).toBe("preschool");
      expect(result.searchParams.get("tags")).toBe("routine");
      expect(result.searchParams.has("purpose")).toBe(false);
    });

    it("buildPurposeToResultsHref はage/municipality/lifestage/tags/purposeをすべて載せる", () => {
      const result = url(buildPurposeToResultsHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: ["こだわり"], purposeId: "use-day-service" }));
      expect(result.searchParams.get("age")).toBe("child");
      expect(result.searchParams.get("municipality")).toBe(CODE);
      expect(result.searchParams.get("lifestage")).toBe("preschool");
      expect(result.searchParams.get("tags")).toBe("routine");
      expect(result.searchParams.get("purpose")).toBe("use-day-service");
    });
  });

  describe("tags が空(=「全般」)の場合の挙動の違い(2026-08是正)", () => {
    it("buildResultsHref・buildSupportBackHref・buildPurposeHref は tags クエリ自体を省略する(従来どおり)", () => {
      expect(url(buildResultsHref({ age: "child", municipalityCode: CODE, tags: [] }, "学校情報")).searchParams.has("tags")).toBe(false);
      expect(url(buildSupportBackHref({ municipalityCode: CODE, lifestage: null, tags: [] })).searchParams.has("tags")).toBe(false);
      expect(url(buildPurposeHref({ age: "child", municipalityCode: CODE, lifestage: "preschool", tags: [] })).searchParams.has("tags")).toBe(false);
    });

    it("buildPrepareHref・buildRecommendHref は tags クエリを省略せず NO_TAGS_EXPLICIT_VALUE を残す(自己チェック結果へのフォールバックと区別するため)", () => {
      const prepareResult = url(buildPrepareHref({ age: "adult", municipalityCode: CODE, tags: [] }));
      expect(prepareResult.searchParams.has("tags")).toBe(true);
      expect(prepareResult.searchParams.get("tags")).toBe(NO_TAGS_EXPLICIT_VALUE);

      const recommendResult = url(buildRecommendHref({ age: "adult", municipalityCode: CODE, tags: [] }));
      expect(recommendResult.searchParams.has("tags")).toBe(true);
      expect(recommendResult.searchParams.get("tags")).toBe(NO_TAGS_EXPLICIT_VALUE);
    });
  });
});
