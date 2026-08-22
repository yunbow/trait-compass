import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FacilityListSection } from "@/features/support/components/FacilityListSection";
import { setCurrentLocationEnabled } from "@/features/history/services/settings";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Map: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  AdvancedMarker: ({ title, onClick, children }: { title?: string; onClick?: () => void; children?: ReactNode }) =>
    onClick ? <button type="button" aria-label={title} onClick={onClick}>{children}</button> : <div aria-label={title}>{children}</div>,
  Pin: () => null,
  InfoWindow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// FacilityListSection は `useSearchParams()` で `subtype` クエリを読み、`window.history.replaceState`
// でURLを直接書き換える(router.push を使わないため、next/navigation 標準のテスト用ルーター
// モックだけでは反映されない)。実ブラウザでは Next.js が history.replaceState 呼び出しを検知して
// 内部の searchParams を更新し再レンダーする(TICKET未詳: facilitySubtype 絞り込み)。
// テストではその挙動を模し、history.replaceState を1度だけラップしてカスタムイベントを発火し、
// useSyncExternalStore でそのイベントを購読して最新の URLSearchParams を返す。
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const URL_CHANGE_EVENT = "test:facility-list-section:urlchange";

  type PatchableHistory = History & { __subtypeTestPatched?: boolean };
  const history = window.history as PatchableHistory;
  if (!history.__subtypeTestPatched) {
    const originalReplaceState = window.history.replaceState.bind(window.history);
    window.history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
      originalReplaceState(...args);
      window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    }) as History["replaceState"];
    history.__subtypeTestPatched = true;
  }

  let cachedSearch = window.location.search;
  let cachedParams = new URLSearchParams(cachedSearch);
  const getSnapshot = () => {
    if (window.location.search !== cachedSearch) {
      cachedSearch = window.location.search;
      cachedParams = new URLSearchParams(cachedSearch);
    }
    return cachedParams;
  };
  const subscribe = (callback: () => void) => {
    window.addEventListener(URL_CHANGE_EVENT, callback);
    return () => window.removeEventListener(URL_CHANGE_EVENT, callback);
  };

  return {
    useSearchParams: () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    // FacilityCard(掲載情報の誤り報告リンク、TICKET-0064)が usePathname() も呼ぶため、
    // この最小限のモックにも含めておく。
    usePathname: () => "/support/results",
  };
});

function makeFacility(overrides: Partial<FacilityDisplayData> = {}): FacilityDisplayData {
  return {
    id: "fac-001",
    name: "世田谷区発達障がい相談支援センター",
    municipality: "世田谷区",
    categoryType: "相談窓口",
    mode: "full",
    address: "東京都世田谷区XX 1-2-3",
    phone: "03-0000-0001",
    summary: "説明",
    url: "https://example.com",
    matchesTags: true,
    facilitySubtype: null,
    sourceCredit: "出典: ダミーデータセット",
    sourceUrl: null,
    lat: 35.6467,
    lng: 139.6531,
    datasetId: "ds-a",
    datasetTitle: "ダミーデータセット",
    fetchedAt: "2026-07-01T00:00:00.000Z",
    frozen: false,
    noDiagnosisOk: false,
    contactMethods: null,
    isPathwayFacility: false,
    ...overrides,
  };
}

function mockGeolocation() {
  let success: PositionCallback | undefined;
  let failure: PositionErrorCallback | undefined;
  const getCurrentPosition = vi.fn((nextSuccess: PositionCallback, nextFailure: PositionErrorCallback) => { success = nextSuccess; failure = nextFailure; });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return { getCurrentPosition, resolve: (lat: number, lng: number) => success?.({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition), reject: (code: number) => failure?.({ code } as GeolocationPositionError) };
}

describe("FacilityListSection", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("支援制度等、地図に表示できる施設が1件も無い場合は viewMode='map' が指定されても一覧のみ表示する", () => {
    const facilities = [
      makeFacility({ id: "fac-a", name: "支援制度A", lat: null, lng: null }),
      makeFacility({ id: "fac-b", name: "支援制度B", lat: null, lng: null }),
    ];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} viewMode="map" />);

    expect(screen.getByText("支援制度A")).toBeTruthy();
    expect(screen.getByText("支援制度B")).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
  });

  it("現在地の利用が有効でも、初期表示が一覧のみの場合は現在地を取得しない", () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();

    render(<FacilityListSection municipality="世田谷区" facilities={[makeFacility()]} />);

    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("地図に表示できる施設が無い場合は、現在地の利用が有効でも取得しない", () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();

    render(<FacilityListSection municipality="世田谷区" facilities={[makeFacility({ lat: null, lng: null })]} />);

    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("現在地の利用が無効の場合は、地図を表示していても取得しない", () => {
    const geo = mockGeolocation();

    render(<FacilityListSection municipality="世田谷区" facilities={[makeFacility()]} viewMode="list-map" />);

    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("現在地の利用が有効で viewMode='list-map' の場合は現在地を取得する", () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();

    render(<FacilityListSection municipality="世田谷区" facilities={[makeFacility()]} viewMode="list-map" />);

    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("既定では相談分野との関連順を表示する", () => {
    const facilities = [
      makeFacility({ id: "far", name: "遠い窓口", lat: 35.7, lng: 139.8 }),
      makeFacility({ id: "near", name: "近い窓口" }),
    ];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

    expect(screen.getByRole("option", { name: "相談分野との関連順" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["遠い窓口", "近い窓口"]);
  });

  it("相談分野に関連する窓口と、地域でまず相談できる窓口を分けて表示する", () => {
    const facilities = [
      makeFacility({ id: "related", name: "関連する窓口", matchesTags: true }),
      makeFacility({ id: "general", name: "地域の窓口", matchesTags: false }),
    ];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

    expect(screen.getByRole("heading", { level: 3, name: "まず相談する候補" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "ほかの相談先" })).toBeTruthy();
    expect(screen.getByLabelText("まず相談する候補").textContent).toContain("関連する窓口");
    expect(screen.getByLabelText("ほかの相談先").textContent).toContain("地域の窓口");
  });

  it("関連する窓口は最初の8件を表示し、操作で残りも表示する", () => {
    const facilities = Array.from({ length: 9 }, (_, index) => makeFacility({ id: `related-${index}`, name: `関連窓口${index + 1}`, matchesTags: true }));
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

    expect(screen.getByRole("heading", { name: "関連窓口8" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "関連窓口9" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "残り1件を表示する" }));
    expect(screen.getByRole("heading", { name: "関連窓口9" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "表示を減らす" })).toBeTruthy();
  });

  it("地域の窓口だけの場合も、最初の5件から段階的に表示する", () => {
    const facilities = Array.from({ length: 6 }, (_, index) => makeFacility({ id: `general-${index}`, name: `地域窓口${index + 1}`, matchesTags: false }));
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

    expect(screen.getByRole("heading", { level: 3, name: "相談窓口" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "地域窓口6" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "残り1件を表示する" }));
    expect(screen.getByRole("heading", { name: "地域窓口6" })).toBeTruthy();
  });

  it("matchesTags=false でも isPathwayFacility=true の窓口は「まず相談する候補」に含める(想定ルート優先表示)", () => {
    const facilities = [
      makeFacility({ id: "pathway", name: "想定ルートの窓口", matchesTags: false, isPathwayFacility: true }),
      makeFacility({ id: "general", name: "地域の窓口", matchesTags: false, isPathwayFacility: false }),
    ];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

    expect(screen.getByLabelText("まず相談する候補").textContent).toContain("想定ルートの窓口");
    expect(screen.getByLabelText("ほかの相談先").textContent).toContain("地域の窓口");
  });

  it("matchesTags=false かつ isPathwayFacility=false の窓口は「ほかの相談先」に表示される", () => {
    const facilities = [
      makeFacility({ id: "related", name: "関連する窓口", matchesTags: true, isPathwayFacility: false }),
      makeFacility({ id: "general", name: "地域の窓口", matchesTags: false, isPathwayFacility: false }),
    ];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

    expect(screen.getByLabelText("まず相談する候補").textContent).toContain("関連する窓口");
    expect(screen.getByLabelText("まず相談する候補").textContent).not.toContain("地域の窓口");
    expect(screen.getByLabelText("ほかの相談先").textContent).toContain("地域の窓口");
  });

  it("相談窓口以外のタブでは、一致0件時の見出しに固定文字列ではなく現在のカテゴリ名を使う", () => {
    const facilities = [makeFacility({ id: "general", name: "福祉ガイドA", matchesTags: false })];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} categoryLabel="福祉ガイド" />);

    expect(screen.getByRole("heading", { level: 3, name: "福祉ガイド" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "相談窓口" })).toBeNull();
    expect(screen.getByLabelText("福祉ガイド").textContent).toContain("お住まいの地域で利用できる福祉ガイドです。");
  });

  it("近い順を選ぶと区市町村中心から近い施設を先に表示する", () => {
    const facilities = [
      makeFacility({ id: "far", name: "遠い窓口", lat: 35.7, lng: 139.8 }),
      makeFacility({ id: "near", name: "近い窓口" }),
    ];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

    fireEvent.change(screen.getByLabelText("並び替え"), { target: { value: "distance" } });

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["近い窓口", "遠い窓口"]);
  });

  it("診断なしで相談できる窓口だけに絞り込める", () => {
    const facilities = [
      makeFacility({ id: "not-ok", name: "診断が必要な窓口", noDiagnosisOk: false }),
      makeFacility({ id: "ok", name: "診断なしで相談できる窓口", noDiagnosisOk: true }),
    ];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

    fireEvent.click(screen.getByLabelText("診断がなくても相談できる窓口のみ表示"));

    expect(screen.queryByRole("heading", { name: "診断が必要な窓口" })).toBeNull();
    expect(screen.getByRole("heading", { name: "診断なしで相談できる窓口" })).toBeTruthy();
  });

  it("絞り込み結果が0件の場合は解除ボタンで元の一覧に戻せる", () => {
    render(<FacilityListSection municipality="世田谷区" facilities={[makeFacility({ name: "診断が必要な窓口" })]} />);

    fireEvent.click(screen.getByLabelText("診断がなくても相談できる窓口のみ表示"));

    expect(screen.getByText("この条件に一致する窓口は見つかりませんでした。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "フィルタを解除する" }));

    expect(screen.getByRole("heading", { name: "診断が必要な窓口" })).toBeTruthy();
  });

  it("viewMode の既定値(list)では一覧のみを表示し、地図は表示しない", () => {
    render(<FacilityListSection municipality="世田谷区" facilities={[makeFacility()]} />);

    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  });

  it("viewMode='list-map' の場合は一覧と地図を並べて表示する", () => {
    render(<FacilityListSection municipality="世田谷区" facilities={[makeFacility()]} viewMode="list-map" />);

    expect(screen.getByTestId("map")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
  });

  it("viewMode='map' の場合は一覧を隠し地図のみを表示する", () => {
    render(<FacilityListSection municipality="世田谷区" facilities={[makeFacility()]} viewMode="map" />);

    expect(screen.getByTestId("map")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("一覧を表示中は比較用のチェックボックスを表示できる", () => {
    render(<FacilityListSection municipality="世田谷区" facilities={[makeFacility()]} />);
    expect(screen.queryByRole("checkbox", { name: /を比較対象に追加/ })).toBeNull();
    fireEvent.click(screen.getByLabelText("施設を比較する"));
    expect(screen.getByRole("checkbox", { name: /を比較対象に追加/ })).toBeTruthy();
  });

  it("選択数に上限は無く、2件以上で比較画面を開ける", () => {
    const facilities = Array.from({ length: 5 }, (_, index) => makeFacility({ id: `fac-${index}`, name: `窓口${index}` }));
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);
    fireEvent.click(screen.getByLabelText("施設を比較する"));
    const boxes = screen.getAllByRole("checkbox", { name: /を比較対象に追加/ });
    boxes.forEach((box) => fireEvent.click(box));
    boxes.forEach((box) => expect(box).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "比較する(5件)" }));
    expect(screen.getByRole("heading", { name: "施設の比較" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "一覧に戻る" }));
    expect(screen.getByText("5件選択中")).toBeTruthy();
  });

  it("フィルタで隠れた選択は解除せず、フィルタ解除で戻る", () => {
    const facilities = [makeFacility({ id: "required", noDiagnosisOk: false }), makeFacility({ id: "ok", noDiagnosisOk: true })];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);
    fireEvent.click(screen.getByLabelText("施設を比較する"));
    fireEvent.click(screen.getAllByRole("checkbox", { name: /を比較対象に追加/ })[0]);
    fireEvent.click(screen.getByLabelText("診断がなくても相談できる窓口のみ表示"));
    expect(screen.getByText("0件選択中")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("診断がなくても相談できる窓口のみ表示"));
    expect(screen.getByText("1件選択中")).toBeTruthy();
  });

  it("近い順は取得中も区市町村中心で表示し、取得後に現在地で静かに再ソートする", async () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();
    const facilities = [
      makeFacility({ id: "center", name: "区中心に近い窓口", lat: 35.6467, lng: 139.6531 }),
      makeFacility({ id: "live", name: "現在地に近い窓口", lat: 35.7, lng: 139.8 }),
    ];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);
    fireEvent.change(screen.getByLabelText("並び替え"), { target: { value: "distance" } });
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).toBe("区中心に近い窓口");
    act(() => geo.resolve(35.7, 139.8));
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).toBe("現在地に近い窓口"));
    expect(screen.getByRole("option", { name: "近い順(現在地)" })).toBeTruthy();
  });

  it("拒否時は一覧をブロックせず区市町村中心の近い順を使い続ける", async () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();
    const facilities = [makeFacility({ id: "far", name: "遠い窓口", lat: 35.7, lng: 139.8 }), makeFacility({ id: "near", name: "近い窓口" })];
    render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);
    fireEvent.change(screen.getByLabelText("並び替え"), { target: { value: "distance" } });
    act(() => geo.reject(1));
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).toBe("近い窓口"));
    expect(screen.getByRole("option", { name: "近い順" })).toBeTruthy();
  });

  describe("施設サブタイプのバッジによる絞り込み", () => {
    function setSubtypeParam(...subtypes: string[]) {
      const params = new URLSearchParams();
      if (subtypes.length > 0) params.set("subtype", subtypes.join(","));
      const query = params.toString();
      window.history.replaceState(null, "", `/support/results${query ? `?${query}` : ""}`);
    }

    function getSubtypeParam() {
      return new URLSearchParams(window.location.search).get("subtype");
    }

    it("バッジをクリックすると一致する分類の施設だけに絞り込み、facilitySubtype が無い施設は隠れる", () => {
      const facilities = [
        makeFacility({ id: "a", name: "保育施設A", facilitySubtype: "保育施設", lat: null, lng: null }),
        makeFacility({ id: "b", name: "保健施設B", facilitySubtype: "保健施設", lat: null, lng: null }),
        makeFacility({ id: "c", name: "サブタイプ無しC", facilitySubtype: null, lat: null, lng: null }),
      ];
      render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

      fireEvent.click(screen.getByRole("button", { name: "保育施設" }));

      expect(screen.getByRole("heading", { name: "保育施設A" })).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "保健施設B" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "サブタイプ無しC" })).toBeNull();
    });

    it("複数の分類が選択されている場合は、いずれかに一致する施設をOR条件で表示する", () => {
      const facilities = [
        makeFacility({ id: "a", name: "保育施設A", facilitySubtype: "保育施設", lat: null, lng: null }),
        makeFacility({ id: "b", name: "保健施設B", facilitySubtype: "保健施設", lat: null, lng: null }),
        makeFacility({ id: "c", name: "サブタイプ無しC", facilitySubtype: null, lat: null, lng: null }),
      ];
      setSubtypeParam("保育施設", "保健施設");
      render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

      expect(screen.getByRole("heading", { name: "保育施設A" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "保健施設B" })).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "サブタイプ無しC" })).toBeNull();
    });

    it("フィルタ未適用時はチップ行を表示せず、適用後は選択中の分類と「すべて解除」ボタンを表示する", () => {
      const facilities = [makeFacility({ id: "a", name: "保育施設A", facilitySubtype: "保育施設", lat: null, lng: null })];
      render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

      expect(screen.queryByRole("button", { name: "すべて解除" })).toBeNull();
      expect(screen.queryByRole("button", { name: "保育施設の絞り込みを解除" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "保育施設" }));

      expect(screen.getByRole("button", { name: "すべて解除" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "保育施設の絞り込みを解除" })).toBeTruthy();
    });

    it("チップをクリックすると、その分類だけ絞り込みを解除する", () => {
      const facilities = [
        makeFacility({ id: "a", name: "保育施設A", facilitySubtype: "保育施設", lat: null, lng: null }),
        makeFacility({ id: "b", name: "保健施設B", facilitySubtype: "保健施設", lat: null, lng: null }),
      ];
      setSubtypeParam("保育施設", "保健施設");
      render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

      fireEvent.click(screen.getByRole("button", { name: "保育施設の絞り込みを解除" }));

      expect(screen.queryByRole("heading", { name: "保育施設A" })).toBeNull();
      expect(screen.getByRole("heading", { name: "保健施設B" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "保育施設の絞り込みを解除" })).toBeNull();
      expect(screen.getByRole("button", { name: "保健施設の絞り込みを解除" })).toBeTruthy();
    });

    it("「すべて解除」をクリックすると分類の絞り込みをすべて解除する", () => {
      const facilities = [
        makeFacility({ id: "a", name: "保育施設A", facilitySubtype: "保育施設", lat: null, lng: null }),
        makeFacility({ id: "b", name: "保健施設B", facilitySubtype: "保健施設", lat: null, lng: null }),
      ];
      setSubtypeParam("保育施設", "保健施設");
      render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

      fireEvent.click(screen.getByRole("button", { name: "すべて解除" }));

      expect(screen.getByRole("heading", { name: "保育施設A" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "保健施設B" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "すべて解除" })).toBeNull();
    });

    it("バッジのクリック・解除に応じてURLのsubtypeクエリが更新される", () => {
      const facilities = [makeFacility({ id: "a", name: "保育施設A", facilitySubtype: "保育施設", lat: null, lng: null })];
      render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

      expect(getSubtypeParam()).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "保育施設" }));
      expect(getSubtypeParam()).toBe("保育施設");

      fireEvent.click(screen.getByRole("button", { name: "すべて解除" }));
      expect(getSubtypeParam()).toBeNull();
    });

    it("分類の絞り込みと診断なし条件の組み合わせで0件になった場合、解除ボタンで両方の条件を戻せる", () => {
      const facilities = [makeFacility({ id: "a", name: "保育施設A", facilitySubtype: "保育施設", noDiagnosisOk: false, lat: null, lng: null })];
      render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

      fireEvent.click(screen.getByRole("button", { name: "保育施設" }));
      fireEvent.click(screen.getByLabelText("診断がなくても相談できる窓口のみ表示"));

      expect(screen.getByText("この条件に一致する窓口は見つかりませんでした。")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "フィルタを解除する" }));

      expect(screen.getByRole("heading", { name: "保育施設A" })).toBeTruthy();
      expect(getSubtypeParam()).toBeNull();
      expect(screen.queryByRole("button", { name: "すべて解除" })).toBeNull();
    });

    it("facilitySubtype が null の施設はバッジ・チップとも表示されない", () => {
      const facilities = [makeFacility({ id: "c", name: "サブタイプ無しC", facilitySubtype: null, lat: null, lng: null })];
      render(<FacilityListSection municipality="世田谷区" facilities={facilities} />);

      expect(screen.queryByRole("button", { name: /の絞り込みを解除/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "すべて解除" })).toBeNull();
      expect(screen.getByRole("heading", { name: "サブタイプ無しC" })).toBeTruthy();
    });
  });
});
