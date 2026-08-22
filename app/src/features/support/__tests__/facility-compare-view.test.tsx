import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FacilityCompareView } from "@/features/support/components/FacilityCompareView";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";

const FACILITIES: FacilityDisplayData[] = [{ id: "fac-001", name: "比較施設", municipality: "世田谷区", categoryType: "相談窓口", mode: "full", address: "東京都", phone: "03-0000-0000", summary: "説明", url: null, matchesTags: true, facilitySubtype: null, sourceCredit: "出典", sourceUrl: null, lat: 35.6, lng: 139.6, datasetId: "ds", datasetTitle: "データ", fetchedAt: "2026-01-01", frozen: false, noDiagnosisOk: false, contactMethods: null, isPathwayFacility: false }];

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
