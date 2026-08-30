import { describe, expect, it } from "vitest";

import type { FacilitySearchResult, FacilityWithTags } from "@/features/support/services/facility-search";

import { selectPrepareFacilityRows, toPrepareFacility } from "@/features/prepare/services/facilities";

function makeFacility(overrides: Partial<FacilityWithTags> = {}): FacilityWithTags {
  return {
    id: "fac-1",
    datasetId: "ds-1",
    name: "テスト相談窓口",
    categoryType: "相談窓口",
    municipality: "世田谷区",
    municipalityCode: "13112", // 世田谷区
    address: "東京都世田谷区1-1-1",
    phone: "03-0000-0000",
    url: "https://example.com",
    ageRange: "both",
    description: "テスト用の説明文",
    datasetTitle: "テストデータセット",
    sourceOrg: "テスト組織",
    license: "cc-by-4.0",
    riskLevel: "low",
    sourceUrl: "https://example.com/dataset",
    facilitySubtype: null,
    lat: null,
    lng: null,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    frozen: false,
    noDiagnosisOk: false,
    contactMethods: null,
    confirmationStatus: null,
    confirmedOn: null,
    tags: [],
    matchesTags: false,
    ...overrides,
  };
}

function makeSearchResult(rows: FacilityWithTags[]): FacilitySearchResult {
  return {
    isFallback: false,
    fallbackMessage: null,
    facilitiesByCategory: {
      相談窓口: rows,
      支援制度: [],
      福祉ガイド: [],
      発達障害支援資料: [],
    },
  };
}

describe("selectPrepareFacilityRows", () => {
  it("「相談窓口」分類のみを対象とし、他分類は含めない", () => {
    const rows = [makeFacility()];
    const result = makeSearchResult(rows);
    result.facilitiesByCategory.支援制度 = [makeFacility({ id: "fac-2", categoryType: "支援制度" })];

    const selected = selectPrepareFacilityRows(result, 5);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("fac-1");
  });

  it("limit で件数を絞り込む", () => {
    const rows = [makeFacility({ id: "fac-1" }), makeFacility({ id: "fac-2" }), makeFacility({ id: "fac-3" })];
    const selected = selectPrepareFacilityRows(makeSearchResult(rows), 2);
    expect(selected).toHaveLength(2);
  });
});

describe("toPrepareFacility", () => {
  it("D1 由来の事実情報のみを詰める(fact-guard 方針)", () => {
    const facility = toPrepareFacility(makeFacility());

    expect(facility).toEqual({
      id: "fac-1",
      name: "テスト相談窓口",
      municipality: "世田谷区",
      address: "東京都世田谷区1-1-1",
      phone: "03-0000-0000",
      url: "https://example.com",
      sourceCredit: "出典: テストデータセット(テスト組織)を加工して作成、cc-by-4.0",
      sourceUrl: "https://example.com/dataset",
    });
  });
});
