import { describe, expect, it } from "vitest";

import {
  buildFallbackFacilities,
  reorderFacilitiesByIds,
  toRecommendFacility,
} from "@/features/recommend/services/facility-recommend";
import type { FacilityRow, FacilitySearchResult, FacilityWithTags } from "@/features/support/services/facility-search";

function makeFacilityRow(overrides: Partial<FacilityRow> = {}): FacilityRow {
  return {
    id: "fac-001",
    datasetId: "ds-a",
    name: "ダミー窓口",
    categoryType: "相談窓口",
    municipality: "世田谷区",
    municipalityCode: "13112", // 世田谷区
    address: "東京都世田谷区XX",
    phone: "03-0000-0000",
    url: "https://example.com",
    ageRange: "both",
    description: "説明文",
    datasetTitle: "ダミーデータセット",
    sourceOrg: "東京都福祉局",
    license: "cc-by-4.0",
    riskLevel: "low",
    sourceUrl: "https://example.com/dataset",
    facilitySubtype: null,
    lat: null,
    lng: null,
    fetchedAt: "2026-07-01T00:00:00.000Z",
    frozen: false,
    noDiagnosisOk: false,
    contactMethods: null,
    ...overrides,
  };
}

function makeFacilityWithTags(overrides: Partial<FacilityWithTags> = {}): FacilityWithTags {
  return { ...makeFacilityRow(), tags: [], matchesTags: true, ...overrides };
}

describe("reorderFacilitiesByIds", () => {
  it("ids の順序(ベクトル検索のスコア順)に並べ替える", () => {
    const rows = [makeFacilityRow({ id: "fac-b" }), makeFacilityRow({ id: "fac-a" })];

    const ordered = reorderFacilitiesByIds(rows, ["fac-a", "fac-b"]);

    expect(ordered.map((r) => r.id)).toEqual(["fac-a", "fac-b"]);
  });

  it("D1 側の絞り込みで除外された id(rows に存在しない)は結果から自然に除外される", () => {
    const rows = [makeFacilityRow({ id: "fac-a" })];

    const ordered = reorderFacilitiesByIds(rows, ["fac-a", "fac-missing"]);

    expect(ordered.map((r) => r.id)).toEqual(["fac-a"]);
  });

  it("ids が空の場合は空配列を返す", () => {
    expect(reorderFacilitiesByIds([makeFacilityRow()], [])).toEqual([]);
  });
});

describe("toRecommendFacility", () => {
  it("事実情報(name/municipality/address/phone/url/sourceCredit/sourceUrl)は D1 の値をそのまま使う(FR-042 AC-2)", () => {
    const row = makeFacilityRow({ name: "世田谷区 発達障がい相談支援センター", phone: "03-1234-5678" });

    const facility = toRecommendFacility(row, "この施設は相談内容に合いそうです。");

    expect(facility.name).toBe("世田谷区 発達障がい相談支援センター");
    expect(facility.phone).toBe("03-1234-5678");
    expect(facility.municipality).toBe(row.municipality);
    expect(facility.url).toBe(row.url);
    expect(facility.sourceUrl).toBe(row.sourceUrl);
  });

  it("mock LLM が偽の電話番号を含むテキストを aiNote として渡しても、phone フィールドは D1 の値のまま変わらない(回帰テスト)", () => {
    const row = makeFacilityRow({ phone: "03-1234-5678" });

    // 実際には route.ts 側の containsFabricatedPhone ガードで null にされる想定だが、
    // ここでは「aiNote の中身が何であれ phone フィールドには一切影響しない」ことを
    // 直接検証する(toRecommendFacility は aiNote の中身を一切パースしない設計)。
    const facility = toRecommendFacility(row, "お電話は 090-9999-9999 までどうぞ。");

    expect(facility.phone).toBe("03-1234-5678");
    expect(facility.aiNote).toBe("お電話は 090-9999-9999 までどうぞ。");
  });

  it("riskLevel が low 以外(summary モード)の場合は address/phone を null にする(FR-027)", () => {
    const row = makeFacilityRow({ riskLevel: "medium", description: "とても長い説明文。".repeat(10) });

    const facility = toRecommendFacility(row, null);

    expect(facility.address).toBeNull();
    expect(facility.phone).toBeNull();
    expect(facility.summary?.endsWith("…")).toBe(true);
  });

  it("aiNote に null を渡した場合はそのまま null を返す", () => {
    const facility = toRecommendFacility(makeFacilityRow(), null);
    expect(facility.aiNote).toBeNull();
  });
});

describe("buildFallbackFacilities", () => {
  it("カテゴリ掲載順で連結し、aiNote は常に null にする", () => {
    const searchResult: FacilitySearchResult = {
      isFallback: false,
      fallbackMessage: null,
      facilitiesByCategory: {
        相談窓口: [makeFacilityWithTags({ id: "fac-a" })],
        支援制度: [makeFacilityWithTags({ id: "fac-b", categoryType: "支援制度" })],
        福祉ガイド: [],
        発達障害支援資料: [],
      },
    };

    const facilities = buildFallbackFacilities(searchResult, 10);

    expect(facilities.map((f) => f.id)).toEqual(["fac-a", "fac-b"]);
    expect(facilities.every((f) => f.aiNote === null)).toBe(true);
  });

  it("limit 件に切り詰める", () => {
    const searchResult: FacilitySearchResult = {
      isFallback: false,
      fallbackMessage: null,
      facilitiesByCategory: {
        相談窓口: [
          makeFacilityWithTags({ id: "fac-a" }),
          makeFacilityWithTags({ id: "fac-b" }),
          makeFacilityWithTags({ id: "fac-c" }),
        ],
        支援制度: [],
        福祉ガイド: [],
        発達障害支援資料: [],
      },
    };

    expect(buildFallbackFacilities(searchResult, 2).map((f) => f.id)).toEqual(["fac-a", "fac-b"]);
  });
});
