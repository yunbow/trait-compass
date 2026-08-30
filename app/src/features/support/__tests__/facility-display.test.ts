import { describe, expect, it } from "vitest";

import {
  formatSourceCredit,
  riskLevelToDisplayMode,
  SUMMARY_MAX_LENGTH,
  toFacilityDisplayData,
  truncateForSummary,
} from "@/features/support/services/facility-display";
import type { FacilityWithTags } from "@/features/support/services/facility-search";

function makeFacility(overrides: Partial<FacilityWithTags> = {}): FacilityWithTags {
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
    description: "a".repeat(100),
    datasetTitle: "ダミーデータセット",
    sourceOrg: "東京都福祉局",
    license: "cc-by-4.0",
    riskLevel: "low",
    sourceUrl: "https://example.com/dataset",
    facilitySubtype: null,
    lat: 35.6467,
    lng: 139.6531,
    fetchedAt: "2026-07-01T00:00:00.000Z",
    frozen: false,
    noDiagnosisOk: false,
    contactMethods: null,
    confirmationStatus: null,
    confirmedOn: null,
    tags: [],
    matchesTags: true,
    ...overrides,
  };
}

describe("riskLevelToDisplayMode", () => {
  it("low は full", () => {
    expect(riskLevelToDisplayMode("low")).toBe("full");
  });

  it("medium/high は summary(FR-027)", () => {
    expect(riskLevelToDisplayMode("medium")).toBe("summary");
    expect(riskLevelToDisplayMode("high")).toBe("summary");
  });
});

describe("truncateForSummary", () => {
  it("上限以下ならそのまま返す", () => {
    expect(truncateForSummary("短い説明")).toBe("短い説明");
  });

  it("上限を超える場合は省略記号付きで切り詰める", () => {
    const text = "a".repeat(SUMMARY_MAX_LENGTH + 10);
    const result = truncateForSummary(text);
    expect(result.length).toBe(SUMMARY_MAX_LENGTH + 1); // 本文 + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("ちょうど上限の場合は切り詰めない", () => {
    const text = "a".repeat(SUMMARY_MAX_LENGTH);
    expect(truncateForSummary(text)).toBe(text);
  });
});

describe("formatSourceCredit", () => {
  it("「出典: {title}({source_org})を加工して作成、{license}」の形式で組み立てる(FR-026, NFR-54)", () => {
    const credit = formatSourceCredit({
      datasetTitle: "発達障害支援機関の情報",
      sourceOrg: "東京都福祉局",
      license: "cc-by-4.0",
    });
    expect(credit).toBe("出典: 発達障害支援機関の情報(東京都福祉局)を加工して作成、cc-by-4.0");
  });
});

describe("toFacilityDisplayData", () => {
  it("低リスクは住所・電話・説明文を全文表示する(mode=full)", () => {
    const facility = makeFacility({ riskLevel: "low", description: "低リスクの全文説明" });
    const display = toFacilityDisplayData(facility);

    expect(display.mode).toBe("full");
    expect(display.address).toBe(facility.address);
    expect(display.phone).toBe(facility.phone);
    expect(display.summary).toBe("低リスクの全文説明");
  });

  it("中〜高リスクは住所・電話を出さず、説明文は要約(切り詰め)にする(mode=summary)", () => {
    const longDescription = "b".repeat(SUMMARY_MAX_LENGTH + 20);
    const facility = makeFacility({ riskLevel: "medium", description: longDescription });
    const display = toFacilityDisplayData(facility);

    expect(display.mode).toBe("summary");
    expect(display.address).toBeNull();
    expect(display.phone).toBeNull();
    expect(display.summary).toBe(truncateForSummary(longDescription));
  });

  it("high リスクも medium と同様に summary 扱いになる", () => {
    const facility = makeFacility({ riskLevel: "high" });
    expect(toFacilityDisplayData(facility).mode).toBe("summary");
  });

  it("description が null の場合は summary も null(要約する対象が無い)", () => {
    const facility = makeFacility({ riskLevel: "medium", description: null });
    expect(toFacilityDisplayData(facility).summary).toBeNull();
  });

  it("出典クレジット・外部リンク・タグ一致フラグはリスク区分によらず引き継がれる", () => {
    const facility = makeFacility({ riskLevel: "high", url: "https://example.com/foo", matchesTags: false });
    const display = toFacilityDisplayData(facility);

    expect(display.url).toBe("https://example.com/foo");
    expect(display.matchesTags).toBe(false);
    expect(display.sourceCredit).toContain("出典:");
    expect(display.sourceUrl).toBe(facility.sourceUrl);
  });

  it("低リスク(mode=full)は緯度経度をそのまま引き継ぐ(FR-02A、TICKET-0028)", () => {
    const facility = makeFacility({ riskLevel: "low", lat: 35.6938, lng: 139.7036 });
    const display = toFacilityDisplayData(facility);

    expect(display.lat).toBe(35.6938);
    expect(display.lng).toBe(139.7036);
  });

  it("中〜高リスク(mode=summary)は住所非表示と一貫させ、緯度経度も null にする(TICKET-0028)", () => {
    const facility = makeFacility({ riskLevel: "medium", lat: 35.6938, lng: 139.7036 });
    const display = toFacilityDisplayData(facility);

    expect(display.lat).toBeNull();
    expect(display.lng).toBeNull();
  });

  it("元データの緯度経度が null(未ジオコーディング)の場合はそのまま null", () => {
    const facility = makeFacility({ riskLevel: "low", lat: null, lng: null });
    const display = toFacilityDisplayData(facility);

    expect(display.lat).toBeNull();
    expect(display.lng).toBeNull();
  });

  it("noDiagnosisOk はリスク区分(mode)によらず引き継がれる(TICKET-0050 AC-4)", () => {
    const lowRisk = toFacilityDisplayData(makeFacility({ riskLevel: "low", noDiagnosisOk: true }));
    const highRisk = toFacilityDisplayData(makeFacility({ riskLevel: "high", noDiagnosisOk: true }));

    expect(lowRisk.mode).toBe("full");
    expect(lowRisk.noDiagnosisOk).toBe(true);
    expect(highRisk.mode).toBe("summary");
    expect(highRisk.noDiagnosisOk).toBe(true);
  });

  it("noDiagnosisOk が false の施設は false のまま引き継がれる", () => {
    const display = toFacilityDisplayData(makeFacility({ noDiagnosisOk: false }));
    expect(display.noDiagnosisOk).toBe(false);
  });

  it("低リスク(mode=full)は contactMethods をそのまま引き継ぐ(TICKET-0051)", () => {
    const facility = makeFacility({ riskLevel: "low", contactMethods: "メール可・フォーム可" });
    const display = toFacilityDisplayData(facility);

    expect(display.mode).toBe("full");
    expect(display.contactMethods).toBe("メール可・フォーム可");
  });

  it("中〜高リスク(mode=summary)は住所・電話と同様に contactMethods も null にする(TICKET-0051)", () => {
    const facility = makeFacility({ riskLevel: "medium", contactMethods: "メール可・フォーム可" });
    const display = toFacilityDisplayData(facility);

    expect(display.mode).toBe("summary");
    expect(display.contactMethods).toBeNull();
  });

  it("元データの contactMethods が null(未取込)の場合はそのまま null", () => {
    const facility = makeFacility({ riskLevel: "low", contactMethods: null });
    expect(toFacilityDisplayData(facility).contactMethods).toBeNull();
  });

  it.each(["full", "summary"] as const)(
    "confirmationStatus・confirmedOn は mode=%s によらず引き継がれる(migration 0034)",
    (targetMode) => {
      const riskLevel = targetMode === "full" ? "low" : "high";
      const facility = makeFacility({ riskLevel, confirmationStatus: "phone_required", confirmedOn: "2026-07-01" });
      const display = toFacilityDisplayData(facility);

      expect(display.mode).toBe(targetMode);
      expect(display.confirmationStatus).toBe("phone_required");
      expect(display.confirmedOn).toBe("2026-07-01");
    },
  );

  it("confirmationStatus が null(CKAN/オープンデータ由来でこの概念を持たない施設)の場合はそのまま null で引き継がれる", () => {
    const display = toFacilityDisplayData(makeFacility({ confirmationStatus: null, confirmedOn: null }));
    expect(display.confirmationStatus).toBeNull();
    expect(display.confirmedOn).toBeNull();
  });

  it("鮮度注記に必要な datasetId・datasetTitle・fetchedAt・frozen を引き継ぐ(TICKET-0033 AC-1, AC-2)", () => {
    const facility = makeFacility({
      datasetId: "ds-kodomo-dx-registry",
      datasetTitle: "こどもDX障害福祉レジストリ",
      fetchedAt: "2026-06-01T00:00:00.000Z",
      frozen: true,
    });
    const display = toFacilityDisplayData(facility);

    expect(display.datasetId).toBe("ds-kodomo-dx-registry");
    expect(display.datasetTitle).toBe("こどもDX障害福祉レジストリ");
    expect(display.fetchedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(display.frozen).toBe(true);
  });
});
