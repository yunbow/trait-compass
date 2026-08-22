import { describe, expect, it } from "vitest";

import {
  FACILITY_REPORT_CORRECTED_VALUE_MAX_LENGTH,
  FACILITY_REPORT_DETAIL_MAX_LENGTH,
  FacilityReportRequestSchema,
} from "@/features/facility-report/schema/facility-report";

const BASE = { facilityId: "fac-001", category: "phone" as const };

describe("FacilityReportRequestSchema(TICKET-0064)", () => {
  it("category のみ(他カテゴリ)は妥当とする", () => {
    expect(FacilityReportRequestSchema.safeParse(BASE).success).toBe(true);
    expect(FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "address" }).success).toBe(true);
    expect(FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "content" }).success).toBe(true);
    expect(FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "link" }).success).toBe(true);
  });

  it("closure は closureStatus を必須とする", () => {
    const missing = FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "closure" });
    expect(missing.success).toBe(false);

    const ok = FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "closure", closureStatus: "moved" });
    expect(ok.success).toBe(true);
  });

  it("closure 以外で closureStatus を送ると拒否する", () => {
    const result = FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "phone", closureStatus: "moved" });
    expect(result.success).toBe(false);
  });

  it("unclear/other は detailText を必須とする(空文字・未指定はNG)", () => {
    expect(FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "unclear" }).success).toBe(false);
    expect(FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "unclear", detailText: "" }).success).toBe(false);
    expect(FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "unclear", detailText: "   " }).success).toBe(false);
    expect(FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "unclear", detailText: "説明が分かりにくいです" }).success).toBe(true);

    expect(FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "other" }).success).toBe(false);
    expect(FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "other", detailText: "その他の理由" }).success).toBe(true);
  });

  it("それ以外のカテゴリは facilityId/category 以外すべて任意", () => {
    const result = FacilityReportRequestSchema.safeParse({ facilityId: "fac-001", category: "phone" });
    expect(result.success).toBe(true);
  });

  it("未知のキーを含む body は strict 違反として拒否する", () => {
    const result = FacilityReportRequestSchema.safeParse({ ...BASE, extra: "nope" });
    expect(result.success).toBe(false);
  });

  it("correctedValue/detailText の最大文字数を超えると拒否する", () => {
    const tooLongCorrected = "あ".repeat(FACILITY_REPORT_CORRECTED_VALUE_MAX_LENGTH + 1);
    expect(FacilityReportRequestSchema.safeParse({ ...BASE, correctedValue: tooLongCorrected }).success).toBe(false);
    expect(
      FacilityReportRequestSchema.safeParse({ ...BASE, correctedValue: "あ".repeat(FACILITY_REPORT_CORRECTED_VALUE_MAX_LENGTH) }).success,
    ).toBe(true);

    const tooLongDetail = "い".repeat(FACILITY_REPORT_DETAIL_MAX_LENGTH + 1);
    expect(FacilityReportRequestSchema.safeParse({ ...BASE, detailText: tooLongDetail }).success).toBe(false);
    expect(
      FacilityReportRequestSchema.safeParse({ ...BASE, detailText: "い".repeat(FACILITY_REPORT_DETAIL_MAX_LENGTH) }).success,
    ).toBe(true);
  });

  it("website(ハニーポット)は任意で、値があっても形式エラーにはしない", () => {
    expect(FacilityReportRequestSchema.safeParse({ ...BASE, website: "" }).success).toBe(true);
    expect(FacilityReportRequestSchema.safeParse({ ...BASE, website: "http://spam.example" }).success).toBe(true);
  });

  it("facilityId が空文字・長すぎる場合は拒否する", () => {
    expect(FacilityReportRequestSchema.safeParse({ ...BASE, facilityId: "" }).success).toBe(false);
    expect(FacilityReportRequestSchema.safeParse({ ...BASE, facilityId: "a".repeat(65) }).success).toBe(false);
  });
});
