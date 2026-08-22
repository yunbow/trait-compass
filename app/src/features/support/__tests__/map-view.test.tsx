import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MapView } from "@/features/support/components/MapView";
import type { MapPin } from "@/features/support/components/MapView";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";

// full popup では FacilityCard を描画する。FacilityCard は掲載情報の誤り報告リンク
// (TICKET-0064)の href 組み立てに usePathname()/useSearchParams() を使うため、
// next/navigation をモックする。
vi.mock("next/navigation", () => ({
  usePathname: () => "/support/results",
  useSearchParams: () => new URLSearchParams(),
}));

const CENTER = { lat: 35.6938, lng: 139.7036 }; // 新宿区役所付近

function facility(id: string, name: string): FacilityDisplayData { return { id, name, municipality: "世田谷区", categoryType: "相談窓口", mode: "full", address: "東京都", phone: "03-0000-0000", summary: "説明", url: null, matchesTags: true, facilitySubtype: null, sourceCredit: "出典", sourceUrl: null, lat: 35.6467, lng: 139.6531, datasetId: "ds", datasetTitle: "データ", fetchedAt: "2026-01-01", frozen: false, noDiagnosisOk: false, contactMethods: null, isPathwayFacility: false }; }
const PINS: MapPin[] = [
  { id: "fac-001", name: "世田谷区発達障がい相談支援センター", lat: 35.6467, lng: 139.6531, facility: facility("fac-001", "世田谷区発達障がい相談支援センター") },
  { id: "fac-002", name: "新宿区発達障害者支援窓口", lat: 35.694, lng: 139.7038, facility: facility("fac-002", "新宿区発達障害者支援窓口") },
];

/**
 * @vis.gl/react-google-maps は実ブラウザで Google のスクリプトを読み込む前提のため、
 * jsdom では動作しない。テストでは「MapView がライブラリへ正しい props を渡し、
 * クリックで onPinSelect/スクロールが動く」ことだけを検証できれば十分なため、
 * 最小限のスタブに差し替える。
 *
 * キーボード操作(Enter/Space での選択)は Advanced Markers 自体が
 * (gmpClickable な要素として)提供する機能であり、このスタブでは検証しない。
 */
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Map: ({ mapId, defaultCenter, defaultZoom, children }: {
    mapId: string;
    defaultCenter: { lat: number; lng: number };
    defaultZoom: number;
    children: ReactNode;
  }) => (
    <div data-testid="map" data-map-id={mapId} data-center={JSON.stringify(defaultCenter)} data-zoom={defaultZoom}>
      {children}
    </div>
  ),
  AdvancedMarker: ({
    position,
    title,
    onClick,
    children,
  }: {
    position: { lat: number; lng: number };
    title?: string;
    onClick?: () => void;
    children?: ReactNode;
  }) =>
    onClick ? (
      <button type="button" aria-label={title} onClick={onClick} data-position={JSON.stringify(position)}>
        {children}
      </button>
    ) : (
      <div aria-label={title} data-position={JSON.stringify(position)}>
        {children}
      </div>
    ),
  Pin: ({ background }: { background?: string }) => <span data-testid="pin" data-background={background} />,
  InfoWindow: ({ children }: { children: ReactNode }) => <div aria-label="施設情報">{children}</div>,
}));

/** 施設名に含まれ得る記号(括弧等)を正規表現の特殊文字として解釈させないための簡易エスケープ。 */
function namePattern(name: string): RegExp {
  return new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

describe("MapView", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("APIキー・マップIDが未設定の場合は地図の代わりに案内文を表示する", () => {
    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);

    expect(screen.getByText("Google Mapsの設定が未完了です。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: namePattern(PINS[0].name) })).toBeNull();
  });

  it("中心座標・ズームレベルを Map に渡す", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    const { container } = render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);

    const map = container.querySelector('[data-testid="map"]');
    expect(map?.getAttribute("data-map-id")).toBe("test-map-id");
    expect(map?.getAttribute("data-center")).toBe(JSON.stringify(CENTER));
    expect(map?.getAttribute("data-zoom")).toBe("13");
  });

  it("出典表記(Google Maps)を表示する", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);

    expect(screen.getByText("Google Maps")).toBeTruthy();
  });

  it("渡した施設ピンの件数分だけボタン(role=button)を描画する", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);

    for (const pin of PINS) {
      expect(screen.getByRole("button", { name: namePattern(pin.name) })).toBeTruthy();
    }
  });

  it("Google Mapsでは施設ピンを赤、中心ピンを既存の中立色で描画する", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);

    expect(screen.getAllByTestId("pin").map((pin) => pin.getAttribute("data-background"))).toEqual([
      "var(--foreground)",
      "var(--destructive)",
      "var(--destructive)",
    ]);
  });

  it("Google Mapsでは現在地マーカーを非インタラクティブに表示し、凡例にも追加する", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} currentLocation={{ lat: 35.68, lng: 139.7 }} />);

    expect(screen.getByLabelText("現在地")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "現在地" })).toBeNull();
    expect(within(screen.getByText("施設").parentElement!).getByText("現在地")).toBeTruthy();
  });

  it("現在地座標が無い場合は現在地マーカーと凡例を表示しない", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);

    expect(screen.queryByLabelText("現在地")).toBeNull();
    expect(screen.queryByText("現在地")).toBeNull();
  });

  it("ピンをクリックすると情報ウィンドウを表示し、詳細ボタンで onPinSelect が呼ばれる", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");
    const onPinSelect = vi.fn();

    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} onPinSelect={onPinSelect} />);
    fireEvent.click(screen.getByRole("button", { name: namePattern(PINS[0].name) }));
    expect(screen.getByLabelText("施設情報")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "一覧で詳細を見る" }));
    expect(onPinSelect).toHaveBeenCalledWith("fac-001");
  });

  it("ピンをクリックすると対応する facility-card-{id} へスクロールする", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    const card = document.createElement("div");
    card.id = "facility-card-fac-002";
    document.body.appendChild(card);
    const scrollIntoViewMock = vi.fn();
    card.scrollIntoView = scrollIntoViewMock;
    const focusSpy = vi.spyOn(card, "focus");

    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);
    fireEvent.click(screen.getByRole("button", { name: namePattern(PINS[1].name) }));
    fireEvent.click(screen.getByRole("button", { name: "一覧で詳細を見る" }));

    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();

    document.body.removeChild(card);
  });

  it("ピンが無い場合は button を描画しない", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    render(<MapView center={CENTER} centerLabel="新宿区" pins={[]} />);
    for (const pin of PINS) expect(screen.queryByRole("button", { name: namePattern(pin.name) })).toBeNull();
  });

  it("full popup では一覧への詳細ボタンを表示せず、施設カードを表示する", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");
    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} popupVariant="full" />);
    fireEvent.click(screen.getByRole("button", { name: namePattern(PINS[0].name) }));
    expect(screen.getByText("東京都")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "一覧で詳細を見る" })).toBeNull();
  });

  it("fullPopup を優先し、指定したカード接頭辞へスクロールする", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");
    const pin: MapPin = { ...PINS[0], id: "school-1", fullPopup: <p>学校のポップアップ</p> };
    const card = document.createElement("div");
    card.id = "school-card-school-1";
    card.scrollIntoView = vi.fn();
    document.body.appendChild(card);
    render(<MapView center={CENTER} centerLabel="新宿区" pins={[pin]} popupVariant="full" cardDomIdPrefix="school-card" />);
    fireEvent.click(screen.getByRole("button", { name: namePattern(pin.name) }));
    expect(screen.getByText("学校のポップアップ")).toBeTruthy();
    document.body.removeChild(card);
  });

  it("NEXT_PUBLIC_MAP_PROVIDER=gsi で地理院タイルへ切り替える", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_PROVIDER", "gsi");
    const { container } = render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);
    expect(screen.getByText("国土地理院")).toBeTruthy();
    expect(screen.getByText("地理院タイル")).toBeTruthy();
    expect(container.querySelector("image")?.getAttribute("href")).toContain("cyberjapandata.gsi.go.jp/xyz/std/");
  });

  it("GSIでは施設ピンを赤にし、現在地マーカーを非インタラクティブに表示する", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_PROVIDER", "gsi");
    const { container } = render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} currentLocation={{ lat: 35.68, lng: 139.7 }} />);

    expect(container.querySelector('g[role="button"] path')?.getAttribute("class")).toContain("fill-destructive");
    expect(screen.getByRole("img", { name: "現在地" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "現在地" })).toBeNull();
    expect(within(screen.getByText("施設").parentElement!).getByText("現在地")).toBeTruthy();
  });

  it("「地図を拡大」でフルスクリーン表示に切り替わり、再クリックで元に戻る", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);
    const toggle = screen.getByRole("button", { name: "地図を拡大" });

    fireEvent.click(toggle);
    expect(screen.getByRole("dialog", { name: "新宿区の施設地図" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "元のサイズに戻す" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "元のサイズに戻す" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "地図を拡大" })).toBeTruthy();
  });

  it("フルスクリーン表示中にEscapeキーを押すと元に戻る", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");

    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} />);
    fireEvent.click(screen.getByRole("button", { name: "地図を拡大" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("GSIのピンでも情報ウィンドウを表示して一覧へ移動できる", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_PROVIDER", "gsi");
    const onPinSelect = vi.fn();
    render(<MapView center={CENTER} centerLabel="新宿区" pins={PINS} onPinSelect={onPinSelect} />);

    fireEvent.click(screen.getByRole("button", { name: `${PINS[0].name}の施設情報を表示` }));
    expect(screen.getAllByText(PINS[0].name).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: "一覧で詳細を見る" }));
    expect(onPinSelect).toHaveBeenCalledWith(PINS[0].id);
  });
});
