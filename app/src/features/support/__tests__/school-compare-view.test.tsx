import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SchoolCompareView } from "@/features/support/components/SchoolCompareView";
import type { School } from "@/features/support/components/SchoolCard";

const SCHOOLS: School[] = [{ name: "比較小学校", level: "elementary", fixedClasses: [] }];

describe("SchoolCompareView", () => {
  it("比較表をフルスクリーン表示に切り替え、元に戻せる", () => {
    render(<SchoolCompareView schools={SCHOOLS} allSchools={SCHOOLS} municipality="世田谷区" onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "比較表を拡大" }));
    const dialog = screen.getByRole("dialog", { name: "学校の比較" });
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
    render(<SchoolCompareView schools={SCHOOLS} allSchools={SCHOOLS} municipality="世田谷区" onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "比較表を拡大" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });
});
