import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

const { fetchFacilityByIdMock } = vi.hoisted(() => ({ fetchFacilityByIdMock: vi.fn() }));
vi.mock("@/features/support/services/facility-search", () => ({ fetchFacilityById: fetchFacilityByIdMock }));

const { fetchSchoolByIdMock } = vi.hoisted(() => ({ fetchSchoolByIdMock: vi.fn() }));
vi.mock("@/features/support/services/school-info", () => ({ fetchSchoolById: fetchSchoolByIdMock }));

// SmartBackLink(クライアントコンポーネント、ReportPageShell経由)が useRouter() を呼ぶため、
// facility-report/page.test.tsx と同じ方針で next/navigation をモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import AskPage from "@/app/support/ask/page";

const FAKE_FACILITY = {
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

const FAKE_SCHOOL = {
  id: "school-001",
  municipality: "台東区",
  name: "台東区立第一小学校",
  level: "elementary" as const,
  address: "東京都台東区XX",
  url: "https://example.com/school",
  phone: "03-1111-2222",
  districtNote: null,
  sources: [],
  fixedClasses: [],
  resourceRoom: undefined,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("AskPage(/support/ask)", () => {
  it("facility: 有効なtargetType/targetIdの場合、質問選択フォーム(defaultOpen)を表示する", async () => {
    getDbMock.mockReturnValue({});
    fetchFacilityByIdMock.mockResolvedValue(FAKE_FACILITY);

    render(
      await AskPage({
        searchParams: Promise.resolve({ targetType: "facility", targetId: "fac-001" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "掲載情報についてAIに質問する", level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "世田谷区 発達障がい相談支援センター" })).toBeTruthy();
    expect(screen.getByText("世田谷区 ／ 相談窓口")).toBeTruthy();
    expect(screen.getByText("質問する掲載情報")).toBeTruthy();
    // defaultOpen により AskAiPanel は idle ステップではなく質問選択フォームから始まる。
    expect(screen.getByText("質問を選んでください")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /AIに質問する\(任意\)/ })).toBeNull();
    expect(fetchFacilityByIdMock).toHaveBeenCalledWith({}, "fac-001");
  });

  it("school: 有効なtargetType/targetIdの場合、質問選択フォーム(defaultOpen)を表示する", async () => {
    getDbMock.mockReturnValue({});
    fetchSchoolByIdMock.mockResolvedValue(FAKE_SCHOOL);

    render(
      await AskPage({
        searchParams: Promise.resolve({ targetType: "school", targetId: "school-001" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "台東区立第一小学校" })).toBeTruthy();
    expect(screen.getByText("台東区 ／ 小学校")).toBeTruthy();
    expect(screen.getByText("質問を選んでください")).toBeTruthy();
    expect(fetchSchoolByIdMock).toHaveBeenCalledWith({}, "school-001");
  });

  it("targetTypeが不正な値の場合は見つからなかった旨の表示になり、D1へは問い合わせない", async () => {
    render(
      await AskPage({
        searchParams: Promise.resolve({ targetType: "unknown", targetId: "fac-001" }),
      }),
    );

    expect(screen.getByText("質問対象の掲載情報が見つかりませんでした。")).toBeTruthy();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("targetIdが欠損している場合は見つからなかった旨の表示になる", async () => {
    render(
      await AskPage({
        searchParams: Promise.resolve({ targetType: "facility" }),
      }),
    );

    expect(screen.getByText("質問対象の掲載情報が見つかりませんでした。")).toBeTruthy();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("facility: 存在しないtargetIdの場合は見つからなかった旨の表示になる", async () => {
    getDbMock.mockReturnValue({});
    fetchFacilityByIdMock.mockResolvedValue(null);

    render(
      await AskPage({
        searchParams: Promise.resolve({ targetType: "facility", targetId: "unknown-id" }),
      }),
    );

    expect(screen.getByText("質問対象の掲載情報が見つかりませんでした。")).toBeTruthy();
  });

  it("school: 存在しないtargetIdの場合は見つからなかった旨の表示になる", async () => {
    getDbMock.mockReturnValue({});
    fetchSchoolByIdMock.mockResolvedValue(null);

    render(
      await AskPage({
        searchParams: Promise.resolve({ targetType: "school", targetId: "unknown-id" }),
      }),
    );

    expect(screen.getByText("質問対象の掲載情報が見つかりませんでした。")).toBeTruthy();
  });

  it("D1が利用できない場合も見つからなかった旨の表示になる(graceful degradation)", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding 'DB' is not configured.");
    });

    render(
      await AskPage({
        searchParams: Promise.resolve({ targetType: "facility", targetId: "fac-001" }),
      }),
    );

    expect(screen.getByText("質問対象の掲載情報が見つかりませんでした。")).toBeTruthy();
  });

  it("facility取得時にD1エラーが発生した場合も見つからなかった旨の表示になる", async () => {
    getDbMock.mockReturnValue({});
    fetchFacilityByIdMock.mockRejectedValue(new Error("D1 query failed"));

    render(
      await AskPage({
        searchParams: Promise.resolve({ targetType: "facility", targetId: "fac-001" }),
      }),
    );

    expect(screen.getByText("質問対象の掲載情報が見つかりませんでした。")).toBeTruthy();
  });
});
