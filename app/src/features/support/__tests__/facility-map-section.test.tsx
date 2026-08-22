import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FacilityMapSection } from "@/features/support/components/FacilityMapSection";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";

// MapView が使う @vis.gl/react-google-maps は jsdom で動作しないためスタブに差し替える
// (詳細な検証意図は map-view.test.tsx 側のコメント参照)。ここでは「地図が開閉できること」
// だけを見たいので、中身はごく簡単なもので十分。
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Map: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  AdvancedMarker: ({ title, onClick, children }: { title?: string; onClick?: () => void; children?: ReactNode }) =>
    onClick ? (
      <button type="button" aria-label={title} onClick={onClick}>
        {children}
      </button>
    ) : (
      <div aria-label={title}>{children}</div>
    ),
  Pin: () => null,
  InfoWindow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

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

describe("FacilityMapSection", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("layout に応じた地図を常に表示し、pins に施設データを渡す", () => {
    render(<FacilityMapSection municipality="世田谷区" facilities={[makeFacility()]} layout="full" popupVariant="full" />);

    expect(screen.getByText("Google Maps")).toBeTruthy();
    expect(screen.getByRole("button", { name: "世田谷区発達障がい相談支援センター" })).toBeTruthy();
  });

  it("lat/lng が無い施設が混在する場合、「◯件中◯件」の注記を表示する", () => {
    const facilities = [
      makeFacility({ id: "fac-with-coords", lat: 35.6467, lng: 139.6531 }),
      makeFacility({ id: "fac-no-coords", lat: null, lng: null }),
    ];
    render(<FacilityMapSection municipality="世田谷区" facilities={facilities} layout="sidebar" popupVariant="compact" />);

    expect(screen.getByText(/2件中1件を地図に表示しています/)).toBeTruthy();
  });

  it("すべての施設に lat/lng が無い場合、地図の代わりに案内文を表示する", () => {
    const facilities = [makeFacility({ lat: null, lng: null })];
    render(<FacilityMapSection municipality="世田谷区" facilities={facilities} layout="full" popupVariant="full" />);

    expect(screen.getByText("このタブには地図に表示できる位置情報を持つ施設がありません。")).toBeTruthy();
    expect(screen.queryByText("Google Maps")).toBeNull();
    expect(screen.getByText("一覧のみに切り替えて確認してください。")).toBeTruthy();
  });
});
