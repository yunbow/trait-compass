import { describe, expect, it } from "vitest";

import type { FacilityRow } from "@/features/support/services/facility-search";

import { buildFacilityAnswer } from "@/features/ask-ai/services/facility-answer";

function makeFacility(overrides: Partial<FacilityRow> = {}): FacilityRow {
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
    description: "発達に関する相談を受け付けています。",
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
    ...overrides,
  };
}

describe("buildFacilityAnswer", () => {
  it("facility-age-range: 対象年齢の回答と出典を返す", () => {
    const result = buildFacilityAnswer("facility-age-range", makeFacility({ ageRange: "adult" }));
    expect(result.answer).toContain("18歳以上");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].credit).toBe("出典: テストデータセット(テスト組織)を加工して作成、cc-by-4.0");
  });

  it("facility-contact: 低リスク(mode=full)では電話番号を含める", () => {
    const result = buildFacilityAnswer("facility-contact", makeFacility({ riskLevel: "low", phone: "03-1234-5678" }));
    expect(result.answer).toContain("03-1234-5678");
    expect(result.answer).toContain("https://example.com");
  });

  it("facility-contact: 中〜高リスク(mode=summary)では電話番号を含めない(FR-027 の非表示原則との整合)", () => {
    const result = buildFacilityAnswer("facility-contact", makeFacility({ riskLevel: "medium", phone: "03-1234-5678" }));
    expect(result.answer).not.toContain("03-1234-5678");
    expect(result.answer).toContain("https://example.com");
  });

  it("facility-contact: 電話もURLも無い場合は代替の案内文を返す", () => {
    const result = buildFacilityAnswer("facility-contact", makeFacility({ phone: null, url: null }));
    expect(result.answer).toContain("現在確認できません");
  });

  it("facility-overview: 低リスクでは説明文をそのまま使う", () => {
    const longDescription = "あ".repeat(100);
    const result = buildFacilityAnswer("facility-overview", makeFacility({ riskLevel: "low", description: longDescription }));
    expect(result.answer).toContain(longDescription);
  });

  it("facility-overview: 中〜高リスクでは説明文を要約用の長さに切り詰める", () => {
    const longDescription = "あ".repeat(100);
    const result = buildFacilityAnswer("facility-overview", makeFacility({ riskLevel: "high", description: longDescription }));
    expect(result.answer).not.toContain(longDescription);
    expect(result.answer).toContain("…");
  });

  it("facility-overview: 説明文が無い場合は代替の案内文を返す", () => {
    const result = buildFacilityAnswer("facility-overview", makeFacility({ description: null }));
    expect(result.answer).toContain("現在確認できません");
  });

  it("未知の questionId を渡すと例外を投げる(zod で事前に弾かれる前提の防御的分岐)", () => {
    expect(() => buildFacilityAnswer("not-a-real-question", makeFacility())).toThrow();
  });

  it("回答文には D1 由来の値のみを使う(fact-guard 方針): 電話番号らしき文字列は D1 の値と完全一致する", () => {
    const facility = makeFacility({ name: "架空防止テスト窓口", phone: "03-9999-9999", riskLevel: "low" });
    const result = buildFacilityAnswer("facility-contact", facility);
    const phoneLikeMatches = result.answer.match(/0\d{1,4}-\d{1,4}-\d{3,4}/g) ?? [];
    expect(phoneLikeMatches.every((match) => match === facility.phone)).toBe(true);
    expect(result.sources[0].sourceUrl).toBe(facility.sourceUrl);
  });
});
