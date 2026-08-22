import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

const { fetchFacilityByIdMock } = vi.hoisted(() => ({ fetchFacilityByIdMock: vi.fn() }));
vi.mock("@/features/support/services/facility-search", async () => {
  const actual = await vi.importActual<typeof import("@/features/support/services/facility-search")>(
    "@/features/support/services/facility-search",
  );
  return { ...actual, fetchFacilityById: fetchFacilityByIdMock };
});

// FacilityReportForm(クライアントコンポーネント)が useRouter() を呼ぶため、
// support-input-form.test.tsx と同じ方針で next/navigation をモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import FacilityReportPage from "@/app/support/facility-report/page";

const FAKE_FACILITY_ROW_LOW_RISK = {
  id: "fac-001",
  datasetId: "ds-a",
  name: "世田谷区 発達障がい相談支援センター",
  categoryType: "相談窓口" as const,
  municipality: "世田谷区",
  address: "東京都世田谷区XX",
  phone: "03-1234-5678",
  url: "https://example.com",
  ageRange: "both" as const,
  description: "発達に関する相談窓口です。",
  datasetTitle: "ダミーデータセット",
  sourceOrg: "東京都福祉局",
  license: "cc-by-4.0",
  riskLevel: "low" as const,
  sourceUrl: "https://example.com/dataset",
  facilitySubtype: null,
  lat: null,
  lng: null,
  fetchedAt: "2026-01-01T00:00:00.000Z",
  frozen: false,
  noDiagnosisOk: false,
  contactMethods: null,
};

const FAKE_FACILITY_ROW_HIGH_RISK = {
  ...FAKE_FACILITY_ROW_LOW_RISK,
  id: "fac-002",
  riskLevel: "high" as const,
  description: "これはとても長い説明文でありサマリー表示時には省略記号で切り詰められることが期待される長さの文章です。".repeat(2),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("FacilityReportPage(TICKET-0064)", () => {
  it("有効なfacilityIdの場合、取得した施設データでフォームを表示する", async () => {
    getDbMock.mockReturnValue({});
    fetchFacilityByIdMock.mockResolvedValue(FAKE_FACILITY_ROW_LOW_RISK);

    render(
      await FacilityReportPage({
        searchParams: Promise.resolve({ facilityId: "fac-001" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "掲載情報の訂正・更新を報告" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "世田谷区 発達障がい相談支援センター" })).toBeTruthy();
    expect(screen.getByText("世田谷区 ／ 相談窓口")).toBeTruthy();
    expect(screen.getByText(/世田谷区 発達障がい相談支援センターの掲載情報について/)).toBeTruthy();
    expect(fetchFacilityByIdMock).toHaveBeenCalledWith({}, "fac-001");
  });

  it("facilityIdが欠損している場合は見つからなかった旨の表示になる", async () => {
    render(
      await FacilityReportPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("報告対象の相談先が見つかりませんでした。")).toBeTruthy();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("未知(存在しない)のfacilityIdの場合は見つからなかった旨の表示になる", async () => {
    getDbMock.mockReturnValue({});
    fetchFacilityByIdMock.mockResolvedValue(null);

    render(
      await FacilityReportPage({
        searchParams: Promise.resolve({ facilityId: "unknown-id" }),
      }),
    );

    expect(screen.getByText("報告対象の相談先が見つかりませんでした。")).toBeTruthy();
  });

  it("D1が利用できない場合も見つからなかった旨の表示になる(graceful degradation)", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding 'DB' is not configured.");
    });

    render(
      await FacilityReportPage({
        searchParams: Promise.resolve({ facilityId: "fac-001" }),
      }),
    );

    expect(screen.getByText("報告対象の相談先が見つかりませんでした。")).toBeTruthy();
  });

  it("summaryモード(高リスク)の場合、phone/addressをnullにしてフォームへ渡す(住所・電話を漏らさない)", async () => {
    getDbMock.mockReturnValue({});
    fetchFacilityByIdMock.mockResolvedValue(FAKE_FACILITY_ROW_HIGH_RISK);

    render(
      await FacilityReportPage({
        searchParams: Promise.resolve({ facilityId: "fac-002" }),
      }),
    );

    // フォーム(form step)で phone カテゴリを選ぶと「いま掲載している電話番号」ブロックが
    // 出るはずだが、summary モードでは phone が null のため出ない。
    expect(screen.queryByText("03-1234-5678")).toBeNull();
    expect(screen.queryByText("東京都世田谷区XX")).toBeNull();
  });

  it("backパラメータが無効・欠損の場合は/supportにフォールバックする", async () => {
    getDbMock.mockReturnValue({});
    fetchFacilityByIdMock.mockResolvedValue(FAKE_FACILITY_ROW_LOW_RISK);

    render(
      await FacilityReportPage({
        searchParams: Promise.resolve({ facilityId: "fac-001" }),
      }),
    );

    const backLink = screen.getByRole("link", { name: "← 検索結果に戻る" });
    expect(backLink.getAttribute("href")).toBe("/support");
  });

  it("有効な相対パスのbackパラメータはそのまま採用する", async () => {
    getDbMock.mockReturnValue({});
    fetchFacilityByIdMock.mockResolvedValue(FAKE_FACILITY_ROW_LOW_RISK);

    const validBack = "/support/results?age=child&municipality=%E5%8F%B0%E6%9D%B1%E5%8C%BA";
    render(
      await FacilityReportPage({
        searchParams: Promise.resolve({ facilityId: "fac-001", back: validBack }),
      }),
    );

    const backLink = screen.getByRole("link", { name: "← 検索結果に戻る" });
    expect(backLink.getAttribute("href")).toBe(validBack);
  });

  it.each(["//evil.com/phishing", "https://evil.com"])(
    "オープンリダイレクトを狙ったbackパラメータ(%s)は拒否し/supportにフォールバックする",
    async (maliciousBack) => {
      getDbMock.mockReturnValue({});
      fetchFacilityByIdMock.mockResolvedValue(FAKE_FACILITY_ROW_LOW_RISK);

      render(
        await FacilityReportPage({
          searchParams: Promise.resolve({ facilityId: "fac-001", back: maliciousBack }),
        }),
      );

      const backLink = screen.getByRole("link", { name: "← 検索結果に戻る" });
      expect(backLink.getAttribute("href")).toBe("/support");
    },
  );
});
