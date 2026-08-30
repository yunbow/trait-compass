import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FacilityCompareView } from "@/features/support/components/FacilityCompareView";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";

function makeFacility(overrides: Partial<FacilityDisplayData> = {}): FacilityDisplayData {
  return {
    id: "fac-001",
    name: "比較施設",
    municipality: "世田谷区",
    categoryType: "相談窓口",
    mode: "full",
    address: "東京都",
    phone: "03-0000-0000",
    summary: "説明",
    url: null,
    matchesTags: true,
    facilitySubtype: null,
    sourceCredit: "出典",
    sourceUrl: null,
    lat: 35.6,
    lng: 139.6,
    datasetId: "ds",
    datasetTitle: "データ",
    fetchedAt: "2026-01-01",
    frozen: false,
    noDiagnosisOk: false,
    contactMethods: null,
    confirmationStatus: null,
    confirmedOn: null,
    isPathwayFacility: false,
    ...overrides,
  };
}

const FACILITIES: FacilityDisplayData[] = [makeFacility()];

describe("FacilityCompareView", () => {
  it("比較表をフルスクリーン表示に切り替え、元に戻せる", () => {
    render(<FacilityCompareView facilities={FACILITIES} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "比較表を拡大" }));
    const dialog = screen.getByRole("dialog", { name: "施設の比較" });
    expect(dialog.className).toContain("fixed");
    expect(dialog.className).toContain("inset-0");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("button", { name: "元のサイズに戻す" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "元のサイズに戻す" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "比較表を拡大" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("Escapeはフルスクリーンだけを解除し、一覧には戻らない", () => {
    const onBack = vi.fn();
    render(<FacilityCompareView facilities={FACILITIES} onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "比較表を拡大" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe("FacilityCompareView: 情報の確認状態(migration 0034)", () => {
  it("confirmationStatus='confirmed' かつ confirmedOn がある場合、確認日を含めて表示する", () => {
    render(
      <FacilityCompareView
        facilities={[makeFacility({ confirmationStatus: "confirmed", confirmedOn: "2026-07-01" })]}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("確認済み(2026年7月1日時点)")).toBeTruthy();
  });

  it("confirmationStatus='confirmed' かつ confirmedOn が無い場合、確認日無しで表示する", () => {
    render(
      <FacilityCompareView
        facilities={[makeFacility({ confirmationStatus: "confirmed", confirmedOn: null })]}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("確認済み")).toBeTruthy();
  });

  it("confirmationStatus='phone_required' の場合、電話確認待ちと表示する(施設利用に電話確認が必要という誤解を招く文言にしない、2026-08是正)", () => {
    render(
      <FacilityCompareView facilities={[makeFacility({ confirmationStatus: "phone_required" })]} onBack={vi.fn()} />,
    );

    expect(screen.getByText("電話確認待ち")).toBeTruthy();
  });

  it("confirmationStatus='unconfirmed' の場合、未確認と表示する", () => {
    render(
      <FacilityCompareView facilities={[makeFacility({ confirmationStatus: "unconfirmed" })]} onBack={vi.fn()} />,
    );

    expect(screen.getByText("未確認")).toBeTruthy();
  });

  it("confirmationStatus=null(CKAN/オープンデータ由来でこの概念を持たない施設)の場合、「—」を表示する", () => {
    render(<FacilityCompareView facilities={[makeFacility({ confirmationStatus: null })]} onBack={vi.fn()} />);

    const row = screen.getByText("情報の確認状態").closest("tr");
    expect(row?.textContent).toContain("—");
  });
});
