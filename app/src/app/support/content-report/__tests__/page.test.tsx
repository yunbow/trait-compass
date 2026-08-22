import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

const { fetchSupportPathwayByIdMock } = vi.hoisted(() => ({ fetchSupportPathwayByIdMock: vi.fn() }));
vi.mock("@/features/support/services/support-pathway", () => ({ fetchSupportPathwayById: fetchSupportPathwayByIdMock }));

const { fetchSchoolByIdMock } = vi.hoisted(() => ({ fetchSchoolByIdMock: vi.fn() }));
vi.mock("@/features/support/services/school-info", () => ({ fetchSchoolById: fetchSchoolByIdMock }));

const { fetchResultsGuideNoteMock } = vi.hoisted(() => ({ fetchResultsGuideNoteMock: vi.fn() }));
vi.mock("@/features/support/services/results-guide-notes", () => ({ fetchResultsGuideNote: fetchResultsGuideNoteMock }));

const { getResultsTabGuideMock } = vi.hoisted(() => ({ getResultsTabGuideMock: vi.fn() }));
vi.mock("@/features/support/services/results-tab-guides", () => ({ getResultsTabGuide: getResultsTabGuideMock }));

// ContentReportForm(クライアントコンポーネント)が useRouter() を呼ぶため、
// facility-report/page.test.tsx と同じ方針で next/navigation をモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import ContentReportPage from "@/app/support/content-report/page";

const FAKE_PATHWAY = {
  id: "path-001",
  municipality: "台東区",
  lifestage: "elementary-junior-high" as const,
  purposeId: "purpose-1",
  purposeLabel: "発達相談の始め方",
  status: "confirmed" as const,
  steps: [],
  sources: [],
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

const FAKE_GUIDE_NOTE = { id: "note-001", body: ["台東区独自の補足です。"], sources: [] };

const FAKE_GENERIC_GUIDE = {
  heading: "学校で受けられる支援を知る",
  keyPoints: [],
  body: [],
  sources: [],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("ContentReportPage", () => {
  it("pathway: 有効なtargetIdの場合、取得した想定ルートデータでフォームを表示する", async () => {
    getDbMock.mockReturnValue({});
    fetchSupportPathwayByIdMock.mockResolvedValue(FAKE_PATHWAY);

    render(
      await ContentReportPage({
        searchParams: Promise.resolve({ targetType: "pathway", targetId: "path-001" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "掲載情報の訂正・更新を報告" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "発達相談の始め方" })).toBeTruthy();
    expect(screen.getByText("台東区 ／ 想定ルート（発達相談の始め方）")).toBeTruthy();
    expect(fetchSupportPathwayByIdMock).toHaveBeenCalledWith({}, "path-001");
  });

  it("school: 有効なtargetIdの場合、取得した学校データでフォームを表示する", async () => {
    getDbMock.mockReturnValue({});
    fetchSchoolByIdMock.mockResolvedValue(FAKE_SCHOOL);

    render(
      await ContentReportPage({
        searchParams: Promise.resolve({ targetType: "school", targetId: "school-001" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "台東区立第一小学校" })).toBeTruthy();
    expect(screen.getByText("台東区 ／ 小学校")).toBeTruthy();
    expect(fetchSchoolByIdMock).toHaveBeenCalledWith({}, "school-001");
  });

  it("guide: results_guide_notesの行がある場合、そのデータでフォームを表示する", async () => {
    getDbMock.mockReturnValue({});
    fetchResultsGuideNoteMock.mockResolvedValue(FAKE_GUIDE_NOTE);
    getResultsTabGuideMock.mockReturnValue(FAKE_GENERIC_GUIDE);

    render(
      await ContentReportPage({
        searchParams: Promise.resolve({
          targetType: "guide",
          municipality: "台東区",
          tab: "学校情報",
          lifestage: "elementary-junior-high",
        }),
      }),
    );

    expect(screen.getByRole("heading", { name: "学校で受けられる支援を知る" })).toBeTruthy();
    expect(screen.getByText("台東区 ／ 結果の見方・解説（学校情報）")).toBeTruthy();
    expect(fetchResultsGuideNoteMock).toHaveBeenCalledWith({}, { municipality: "台東区", tab: "学校情報" });
  });

  it("guide: results_guide_notesの行が無く汎用ガイドのみでもフォームを表示する", async () => {
    getDbMock.mockReturnValue({});
    fetchResultsGuideNoteMock.mockResolvedValue(null);
    getResultsTabGuideMock.mockReturnValue(FAKE_GENERIC_GUIDE);

    render(
      await ContentReportPage({
        searchParams: Promise.resolve({ targetType: "guide", municipality: "台東区", tab: "学校情報" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "学校で受けられる支援を知る" })).toBeTruthy();
  });

  it("targetTypeが欠損している場合は見つからなかった旨の表示になり、D1に触れない", async () => {
    render(
      await ContentReportPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("報告対象の掲載情報が見つかりませんでした。")).toBeTruthy();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("未知のtargetIdの場合は見つからなかった旨の表示になる(pathway)", async () => {
    getDbMock.mockReturnValue({});
    fetchSupportPathwayByIdMock.mockResolvedValue(null);

    render(
      await ContentReportPage({
        searchParams: Promise.resolve({ targetType: "pathway", targetId: "unknown-id" }),
      }),
    );

    expect(screen.getByText("報告対象の掲載情報が見つかりませんでした。")).toBeTruthy();
  });

  it("guideでnote・汎用ガイドともに無い場合は見つからなかった旨の表示になる", async () => {
    getDbMock.mockReturnValue({});
    fetchResultsGuideNoteMock.mockResolvedValue(null);
    getResultsTabGuideMock.mockReturnValue(null);

    render(
      await ContentReportPage({
        searchParams: Promise.resolve({ targetType: "guide", municipality: "台東区", tab: "支援制度" }),
      }),
    );

    expect(screen.getByText("報告対象の掲載情報が見つかりませんでした。")).toBeTruthy();
  });

  it("D1が利用できない場合も見つからなかった旨の表示になる(graceful degradation)", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding 'DB' is not configured.");
    });

    render(
      await ContentReportPage({
        searchParams: Promise.resolve({ targetType: "pathway", targetId: "path-001" }),
      }),
    );

    expect(screen.getByText("報告対象の掲載情報が見つかりませんでした。")).toBeTruthy();
  });

  it("backパラメータが無効・欠損の場合は/supportにフォールバックする", async () => {
    getDbMock.mockReturnValue({});
    fetchSupportPathwayByIdMock.mockResolvedValue(FAKE_PATHWAY);

    render(
      await ContentReportPage({
        searchParams: Promise.resolve({ targetType: "pathway", targetId: "path-001" }),
      }),
    );

    const backLink = screen.getByRole("link", { name: "← 検索結果に戻る" });
    expect(backLink.getAttribute("href")).toBe("/support");
  });

  it("有効な相対パスのbackパラメータはそのまま採用する", async () => {
    getDbMock.mockReturnValue({});
    fetchSupportPathwayByIdMock.mockResolvedValue(FAKE_PATHWAY);

    const validBack = "/support/results?age=child&municipality=%E5%8F%B0%E6%9D%B1%E5%8C%BA";
    render(
      await ContentReportPage({
        searchParams: Promise.resolve({ targetType: "pathway", targetId: "path-001", back: validBack }),
      }),
    );

    const backLink = screen.getByRole("link", { name: "← 検索結果に戻る" });
    expect(backLink.getAttribute("href")).toBe(validBack);
  });

  it.each(["//evil.com/phishing", "https://evil.com"])(
    "オープンリダイレクトを狙ったbackパラメータ(%s)は拒否し/supportにフォールバックする",
    async (maliciousBack) => {
      getDbMock.mockReturnValue({});
      fetchSupportPathwayByIdMock.mockResolvedValue(FAKE_PATHWAY);

      render(
        await ContentReportPage({
          searchParams: Promise.resolve({ targetType: "pathway", targetId: "path-001", back: maliciousBack }),
        }),
      );

      const backLink = screen.getByRole("link", { name: "← 検索結果に戻る" });
      expect(backLink.getAttribute("href")).toBe("/support");
    },
  );
});
