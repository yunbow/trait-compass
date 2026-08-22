import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CategoryTab } from "@/features/support/components/CategoryTabs";
import { FacilityResultsView } from "@/features/support/components/FacilityResultsView";
import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import { SCHOOL_INFO_TAB } from "@/features/support/constants/results-tabs";
import type { CategoryType } from "@/features/support/constants/category-types";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";

// FacilityListSection が `useSearchParams()` を呼ぶため、next/navigation をモックする。
// facilitySubtype 絞り込み(subtype クエリ)自体はこのファイルの対象外(facility-list-section.test.tsx
// 側でカバー)なので、ここでは常に空の searchParams を返すだけの最小限のモックでよい。
// usePathname は FacilityCard(掲載情報の誤り報告リンク、TICKET-0064)が呼ぶために必要。
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/support/results",
}));

// 表示切り替え(ViewModeToggle)を「一覧と地図」に切り替えると FacilityMapSection 経由で
// 実際に地図コンポーネントがマウントされるため、facility-list-section.test.tsx と同様に
// Google Maps 本体をモックする(このファイルの対象外である描画詳細を避けるため)。
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Map: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  AdvancedMarker: ({ title, onClick, children }: { title?: string; onClick?: () => void; children?: ReactNode }) =>
    onClick ? <button type="button" aria-label={title} onClick={onClick}>{children}</button> : <div aria-label={title}>{children}</div>,
  Pin: () => null,
  InfoWindow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function emptyFacilitiesByCategory(): Record<CategoryType, FacilityDisplayData[]> {
  return Object.fromEntries(CATEGORY_TYPES.map((type) => [type, []])) as unknown as Record<
    CategoryType,
    FacilityDisplayData[]
  >;
}

function makeTabs(counts: Partial<Record<CategoryType, number>> = {}): CategoryTab[] {
  return CATEGORY_TYPES.map((type) => ({
    type,
    href: `/support/results?age=child&municipality=世田谷区&tab=${encodeURIComponent(type)}`,
    count: counts[type] ?? 0,
  }));
}

function makeFacilityDisplay(overrides: Partial<FacilityDisplayData> = {}): FacilityDisplayData {
  return {
    id: "fac-001",
    name: "世田谷区 発達障がい相談支援センター",
    municipality: "世田谷区",
    categoryType: "相談窓口",
    mode: "full",
    address: "東京都世田谷区XX 1-2-3",
    phone: "03-0000-0001",
    summary: "18歳未満の発達に関する相談窓口",
    url: "https://example.setagaya.tokyo.jp/soudan",
    matchesTags: true,
    facilitySubtype: null,
    sourceCredit: "出典: 発達障害支援機関の情報(東京都福祉局)、cc-by-4.0",
    sourceUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/dummy",
    lat: null,
    lng: null,
    datasetId: "ds-tokyo-fukushi-shisetsu",
    datasetTitle: "発達障害支援機関の情報",
    fetchedAt: "2026-07-01T00:00:00.000Z",
    frozen: false,
    noDiagnosisOk: false,
    contactMethods: null,
    isPathwayFacility: false,
    ...overrides,
  };
}

function renderFacilityResults(
  props: Partial<Parameters<typeof FacilityResultsView>[0]> = {},
) {
  return render(
    <FacilityResultsView
      age="child"
      activeTab="相談窓口"
      facilitiesByCategory={emptyFacilitiesByCategory()}
      tabs={makeTabs()}
      isFallback={false}
      fallbackMessage={null}
      hasUnhealthyDatasets={false}
      isDegraded={false}
      backHref="/support"
      prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
      recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
      municipality="世田谷区"
      municipalityCode="13112"
      tags={[]}
      {...props}
    />,
  );
}

describe("FacilityResultsView", () => {
  it("学校情報タブでは学校セクションを表示し、旧 details は表示しない", () => {
    const tabs = [...makeTabs(), { type: SCHOOL_INFO_TAB, href: "/support/results?tab=学校情報", count: 1 }];
    renderFacilityResults({ activeTab: SCHOOL_INFO_TAB, tabs, schoolInfo: { schools: { elementary: [{ name: "台東小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [] }, highSchoolPathways: [], classOrganizations: [], limitations: [], surveyDate: null } });
    expect(screen.getByRole("heading", { name: "学校情報(世田谷区)" })).toBeTruthy();
    expect(screen.getByText("学校情報")).toBeTruthy();
    expect(screen.queryByText(/学校に関する参考情報/)).toBeNull();
  });

  it("学校情報タブでは「手動調査データ」の注記を「データについて」内に表示する(調査日を含む)", () => {
    const tabs = [...makeTabs(), { type: SCHOOL_INFO_TAB, href: "/support/results?tab=学校情報", count: 1 }];
    renderFacilityResults({
      activeTab: SCHOOL_INFO_TAB,
      tabs,
      schoolInfo: { schools: { elementary: [{ name: "台東小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [] }, highSchoolPathways: [], classOrganizations: [], limitations: [], surveyDate: "2026-07-13" },
    });

    expect(screen.getByText("手動調査データ")).toBeTruthy();
    expect(screen.getByText(/世田谷区教育委員会等の公表資料をもとにした手動調査データです。/)).toBeTruthy();
    expect(screen.getByText(/最終確認日は各校カードの「出典・更新」から確認できます。/)).toBeTruthy();
    expect(screen.getByText(/調査日: 2026-07-13/)).toBeTruthy();
  });

  it("学校情報タブ以外では「手動調査データ」の注記を表示しない", () => {
    renderFacilityResults({ activeTab: "相談窓口" });

    expect(screen.queryByText("手動調査データ")).toBeNull();
  });

  it("検索条件・4分類・条件を見直す導線を表示する", () => {
    renderFacilityResults();

    expect(screen.getByRole("heading", { name: "世田谷区・18歳未満の支援情報（0件）" })).toBeTruthy();
    for (const type of CATEGORY_TYPES) {
      expect(screen.getAllByText(type).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("FAQ")).toBeNull();

    expect(screen.getByLabelText("現在の検索条件")).toBeTruthy();
    expect(screen.getByText("世田谷区")).toBeTruthy();
    expect(screen.getByText("18歳未満")).toBeTruthy();
    expect(screen.getByText("全般")).toBeTruthy();

    const backLink = screen.getAllByText("条件を見直す")[0].closest("a");
    expect(backLink?.getAttribute("href")).toBe("/support");
  });

  it("lifestageが分かる場合は「現在の検索条件」の年齢に18歳未満/以上ではなくライフステージの詳しいラベルを表示する", () => {
    renderFacilityResults({ lifestage: "preschool" });

    expect(screen.getByText("未就学児")).toBeTruthy();
    expect(screen.queryByText("18歳未満")).toBeNull();
  });

  it("lifestageが無い場合は従来通りageのラベル(18歳未満/以上)にフォールバックする", () => {
    renderFacilityResults({ lifestage: null });

    expect(screen.getByText("18歳未満")).toBeTruthy();
  });

  it("lifestageが分かる場合は見出し(h1)も18歳未満/以上ではなくライフステージの詳しいラベルを使う(条件ピルと一致させる、回帰バグ修正)", () => {
    renderFacilityResults({ lifestage: "preschool" });

    expect(screen.getByRole("heading", { name: "世田谷区・未就学児の支援情報（0件）" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /18歳未満/ })).toBeNull();
  });

  it("lifestageが無い場合は見出し(h1)も従来通りageのラベル(18歳未満/以上)にフォールバックする", () => {
    renderFacilityResults({ lifestage: null, age: "adult" });

    expect(screen.getByRole("heading", { name: "世田谷区・18歳以上の支援情報（0件）" })).toBeTruthy();
  });

  it("該当タブが0件の場合は「見つかりませんでした」と表示する", () => {
    renderFacilityResults({ activeTab: "支援制度" });

    expect(screen.getByText("この分類に該当する情報は見つかりませんでした。")).toBeTruthy();
    expect(screen.getByText("別の分類を見るか、年齢・地域の条件を変えて探してください。")).toBeTruthy();
  });

  it("現在の検索条件内に引き継ぎ URL を持つ「相談メモを作る」導線を表示する", () => {
    const prepareHref = "/result/prepare?age=adult&municipality=%E5%8F%B0%E6%9D%B1%E5%8C%BA";
    renderFacilityResults({ prepareHref });

    const conditions = screen.getByLabelText("現在の検索条件");
    const prepareLink = screen.getByText("相談メモを作る（任意）").closest("a");
    expect(conditions.contains(prepareLink)).toBe(true);
    expect(prepareLink?.getAttribute("href")).toBe(prepareHref);
  });

  it("現在の検索条件内に引き継ぎ URL を持つ「相談先のヒントを見る」導線を表示する", () => {
    const recommendHref = "/result/recommend?age=adult&municipality=%E5%8F%B0%E6%9D%B1%E5%8C%BA";
    renderFacilityResults({ recommendHref });

    const conditions = screen.getByLabelText("現在の検索条件");
    const recommendLink = screen.getByText("相談先のヒントを見る").closest("a");
    expect(conditions.contains(recommendLink)).toBe(true);
    expect(recommendLink?.getAttribute("href")).toBe(recommendHref);
  });

  it("該当タブが0件の場合は地図を開くボタンを表示しない(FR-02A, TICKET-0028)", () => {
    render(
      <FacilityResultsView
        activeTab="支援制度"
        facilitiesByCategory={emptyFacilitiesByCategory()}
        tabs={makeTabs()}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.queryByRole("button", { name: "地図で位置を確認する" })).toBeNull();
  });

  it("地図に表示できる施設(lat/lng あり)が1件以上ある場合は表示切り替えを表示する", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["相談窓口"] = [makeFacilityDisplay({ lat: 35.6467, lng: 139.6531 })];

    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 相談窓口: 1 })}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "表示方法" })).toBeTruthy();
  });

  it("並び替え行右側の表示切り替えで一覧と地図の表示を切り替えられる", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["相談窓口"] = [makeFacilityDisplay({ lat: 35.6467, lng: 139.6531 })];

    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 相談窓口: 1 })}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    const facilityHeadingName = "世田谷区 発達障がい相談支援センター";
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.getByRole("heading", { name: facilityHeadingName })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "一覧と地図" }));
    expect(screen.getByTestId("map")).toBeTruthy();
    expect(screen.getByRole("heading", { name: facilityHeadingName })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "地図のみ" }));
    expect(screen.getByTestId("map")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: facilityHeadingName })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "一覧のみ" }));
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.getByRole("heading", { name: facilityHeadingName })).toBeTruthy();
  });

  it("支援制度等、地図に表示できる施設(lat/lng)が1件も無い場合は表示切り替えを表示しない", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["支援制度"] = [makeFacilityDisplay({ categoryType: "支援制度", lat: null, lng: null })];

    render(
      <FacilityResultsView
        activeTab="支援制度"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 支援制度: 1 })}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.queryByRole("radiogroup", { name: "表示切り替え" })).toBeNull();
  });

  it("フォールバック時は案内文言を表示する(FR-022, AC-3)", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["相談窓口"] = [makeFacilityDisplay({ municipality: "東京都" })];

    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 相談窓口: 1 })}
        isFallback={true}
        fallbackMessage="お住まいの区市町村のデータが見つからないため、都の広域窓口を表示しています。"
        hasUnhealthyDatasets={false}
        isDegraded={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(
      screen.getByText("お住まいの区市町村のデータが見つからないため、都の広域窓口を表示しています。"),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "検索結果のお知らせ" })).toBeTruthy();
    expect(screen.getByText("選択地域外の広域窓口です。")).toBeTruthy();
  });

  it("リンク切れ・鮮度超過のデータセットがある場合は注記を表示する(FR-029, NFR-25)", () => {
    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={emptyFacilitiesByCategory()}
        tabs={makeTabs()}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={true}
        isDegraded={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.getByText("一部のデータが取得できていません。")).toBeTruthy();
    expect(screen.getByText(/更新が古い可能性があります/)).toBeTruthy();
  });

  it("低リスク(mode=full)の施設カードは住所・電話操作・詳細リンク・出典クレジットを表示する", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["相談窓口"] = [makeFacilityDisplay()];

    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 相談窓口: 1 })}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        isDegraded={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.getByText("世田谷区 発達障がい相談支援センター")).toBeTruthy();
    expect(screen.getByText("東京都世田谷区XX 1-2-3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "電話する" }).getAttribute("href")).toBe("tel:0300000001");
    expect(screen.getByRole("button", { name: "詳細を見る" }).getAttribute("href")).toBe(
      "https://example.setagaya.tokyo.jp/soudan",
    );
    expect(screen.getByText(/出典: 発達障害支援機関の情報/)).toBeTruthy();
  });

  it("中〜高リスク(mode=summary)の施設カードは住所・電話を表示せず、公式サイトへ誘導する(FR-027)", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["相談窓口"] = [
      makeFacilityDisplay({ mode: "summary", address: null, phone: null, summary: "要約テキスト" }),
    ];

    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 相談窓口: 1 })}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        isDegraded={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.queryByText("東京都世田谷区XX 1-2-3")).toBeNull();
    expect(screen.queryByText("03-0000-0001")).toBeNull();
    expect(screen.getByText("要約テキスト")).toBeTruthy();
    expect(screen.getByRole("button", { name: "公式サイトで確認する" })).toBeTruthy();
  });

  it("タグを引き継いだ場合、「条件を変える」導線は tags クエリ付きの /support へ戻る", () => {
    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={emptyFacilitiesByCategory()}
        tabs={makeTabs()}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        isDegraded={false}
        backHref="/support?tags=%E3%81%93%E3%81%A0%E3%82%8F%E3%82%8A"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA&tags=%E3%81%93%E3%81%A0%E3%82%8F%E3%82%8A"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
        tags={["こだわり"]}
      />,
    );

    expect(screen.getByText("相談分野: こだわり")).toBeTruthy();

    const backLink = screen.getAllByText("条件を見直す")[0].closest("a");
    expect(backLink?.getAttribute("href")).toBe("/support?tags=%E3%81%93%E3%81%A0%E3%82%8F%E3%82%8A");

    expect(screen.getByRole("link", { name: "← 結果に戻る" }).getAttribute("href")).toBe("/result");
  });

  it("タグを引き継いでいない場合、「結果に戻る」の代わりに「前の画面に戻る」リンクを表示する", () => {
    renderFacilityResults({ tags: [] });

    expect(screen.queryByRole("link", { name: "← 結果に戻る" })).toBeNull();
    const backLink = screen.getByRole("link", { name: "← 前の画面に戻る" });
    expect(backLink.getAttribute("href")).toBe("/support");
  });

  it("不健全データセット検知による縮退表示時は専用の案内文言を表示する(TICKET-0012 AC-3 積み残し, TICKET-0033 AC-3)", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["相談窓口"] = [makeFacilityDisplay({ municipality: "東京都" })];

    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 相談窓口: 1 })}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={true}
        isDegraded={true}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.getByText(/都の広域窓口のみを表示しています/)).toBeTruthy();
  });

  it("手動調査データの有効期限切れによる縮退表示時は専用の案内文言を表示する(2026-08是正)", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["相談窓口"] = [makeFacilityDisplay({ municipality: "東京都" })];

    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 相談窓口: 1 })}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        isDegraded={false}
        isExpiredDegraded={true}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.getByText(/この自治体の調査データの有効期限が過ぎたため/)).toBeTruthy();
    expect(screen.queryByText(/この分野のデータで確認が必要な状態が続いているため/)).toBeNull();
  });

  it("表示中のデータセットの鮮度注記を表示する(TICKET-0033 AC-1)", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["相談窓口"] = [
      makeFacilityDisplay({ datasetTitle: "発達障害支援機関の情報", fetchedAt: "2026-07-01T00:00:00.000Z" }),
    ];

    render(
      <FacilityResultsView
        activeTab="相談窓口"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 相談窓口: 1 })}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        isDegraded={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.getByText(/発達障害支援機関の情報は2026\/07\/01時点の情報です。/)).toBeTruthy();
  });

  it("selectedPurposeLabel を渡した場合は、選んだ目的を見出しに表示する", () => {
    renderFacilityResults({ selectedPurposeLabel: "児童発達支援・療育を利用したい" });

    expect(screen.getByRole("heading", { name: "「児童発達支援・療育を利用したい」を選んだ方への案内" })).toBeTruthy();
  });

  it("selectedPurposeLabel を渡さない場合は、目的を含む見出しを表示しない", () => {
    renderFacilityResults();

    expect(screen.queryByRole("heading", { name: /を選んだ方への案内/ })).toBeNull();
  });

  it("frozen なデータセットは通常の鮮度注記に加えて更新終了の注記を表示する(FR-034 AC-6, TICKET-0033 AC-2)", () => {
    const facilitiesByCategory = emptyFacilitiesByCategory();
    facilitiesByCategory["発達障害支援資料"] = [
      makeFacilityDisplay({
        categoryType: "発達障害支援資料",
        datasetId: "ds-kodomo-dx-registry",
        datasetTitle: "こどもDX障害福祉レジストリ",
        fetchedAt: "2026-06-01T00:00:00.000Z",
        frozen: true,
      }),
    ];

    render(
      <FacilityResultsView
        activeTab="発達障害支援資料"
        facilitiesByCategory={facilitiesByCategory}
        tabs={makeTabs({ 発達障害支援資料: 1 })}
        isFallback={false}
        fallbackMessage={null}
        hasUnhealthyDatasets={false}
        isDegraded={false}
        backHref="/support"
        prepareHref="/result/prepare?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        recommendHref="/result/recommend?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA"
        municipality="世田谷区"
      />,
    );

    expect(screen.getByText(/こどもDX障害福祉レジストリは2026\/06\/01時点の情報です。/)).toBeTruthy();
    expect(screen.getByText("このデータの更新は終了しています。最新の情報は各リンク先でご確認ください。")).toBeTruthy();
  });

  it("supportPathway を渡した場合、想定ルートセクション(見出し・ステップ)を表示する", () => {
    renderFacilityResults({
      supportPathway: {
        id: "pathway-1",
        municipality: "世田谷区",
        lifestage: "preschool",
        purposeId: "child-development-support",
        purposeLabel: "児童発達支援・療育を利用したい",
        status: "confirmed",
        steps: [
          { order: 1, title: "窓口に電話で相談する", actor: "台東区子ども家庭支援センター", contact: "03-1234-5678", isConditional: false, note: null },
        ],
        sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
      },
    });

    expect(screen.getByRole("heading", { name: /想定ルート/ })).toBeTruthy();
    expect(screen.getByText("窓口に電話で相談する")).toBeTruthy();
  });

  it("supportPathway を渡さない(undefined)場合、想定ルートセクションを表示しない", () => {
    renderFacilityResults();

    expect(screen.queryByRole("heading", { name: /想定ルート/ })).toBeNull();
    expect(screen.queryByText(/この地域では、選んだ目的に合わせた案内をまだ準備できていません/)).toBeNull();
  });

  it("supportPathway に null を渡した場合、想定ルートセクションを表示しない", () => {
    renderFacilityResults({ supportPathway: null });

    expect(screen.queryByRole("heading", { name: /想定ルート/ })).toBeNull();
    expect(screen.queryByText(/この地域では、選んだ目的に合わせた案内をまだ準備できていません/)).toBeNull();
  });

  it("supportPathwayRequested かつ supportPathway が null の場合、「まずすること」見出しと準備中メッセージを表示する", () => {
    renderFacilityResults({ supportPathway: null, supportPathwayRequested: true });

    expect(screen.getByRole("heading", { name: "まずすること" })).toBeTruthy();
    expect(screen.getByText(/この地域では、選んだ目的に合わせた案内をまだ準備できていません/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /想定ルート/ })).toBeNull();
  });

  it("supportPathwayRequested でも supportPathway がある場合は準備中メッセージを表示しない", () => {
    renderFacilityResults({
      supportPathway: {
        id: "pathway-1",
        municipality: "世田谷区",
        lifestage: "preschool",
        purposeId: "child-development-support",
        purposeLabel: "児童発達支援・療育を利用したい",
        status: "confirmed",
        steps: [
          { order: 1, title: "窓口に電話で相談する", actor: "台東区子ども家庭支援センター", contact: "03-1234-5678", isConditional: false, note: null },
        ],
        sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
      },
      supportPathwayRequested: true,
    });

    expect(screen.getByRole("heading", { name: /想定ルート/ })).toBeTruthy();
    expect(screen.getByText("窓口に電話で相談する")).toBeTruthy();
    expect(screen.queryByText(/この地域では、選んだ目的に合わせた案内をまだ準備できていません/)).toBeNull();
  });

  it("福祉ガイドタブでは、探す内容を選ぶ(表示切り替えUI)の近くに「1分でわかる」ガイドを表示する", () => {
    renderFacilityResults({ activeTab: "福祉ガイド" });

    const section = screen.getByRole("heading", { name: "探す内容を選ぶ" }).closest("section");
    expect(section).not.toBeNull();
    const guideHeading = screen.getByRole("heading", { name: "療育サービスの費用と手続き" });
    expect(guideHeading).toBeTruthy();
    expect(section?.contains(guideHeading)).toBe(true);
  });

  it("resultsGuideNoteに自治体固有の補足がある場合、汎用ガイドに加えてその本文・出典も表示する", () => {
    renderFacilityResults({
      activeTab: "福祉ガイド",
      resultsGuideNote: {
        id: "guide-note-1",
        body: ["台東区では障害児通所支援の利用者負担の無償化が段階的に進められています。"],
        sources: [{ label: "台東区公式サイト", url: "https://example.city.taito.lg.jp", confirmedOn: "2026-08-01" }],
      },
    });

    expect(
      screen.getByText("台東区では障害児通所支援の利用者負担の無償化が段階的に進められています。"),
    ).toBeTruthy();
    expect(screen.getByText("台東区公式サイト")).toBeTruthy();
  });

  it("「データについて」のdetailsが閉じた状態でも、LatestInfoNoticeの文言は常時表示される(自治体の二次利用許諾条件対応)", () => {
    renderFacilityResults();

    const details = screen.getByText("データについて").closest("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(
      screen.getByText(
        "掲載している情報は、各データの取得・確認時点のものです。最新・正確な情報は、各自治体・機関等の公式サイトや窓口で必ずご確認ください。",
      ),
    ).toBeTruthy();
  });

  it("福祉ガイドタブでは、ResultsTabGuideに現在の自治体コードが渡され、その解説の訂正・更新報告リンクに反映される", () => {
    renderFacilityResults({ activeTab: "福祉ガイド", municipality: "世田谷区", municipalityCode: "13112" });

    const link = screen.getByRole("link", { name: "療育サービスの費用と手続きの解説の訂正・更新を報告" });
    expect(link).not.toBeNull();
    const href = link?.getAttribute("href") ?? "";
    expect(href).toContain("targetType=guide");
    expect(href).toContain(`municipality=${encodeURIComponent("13112")}`);
  });
});
