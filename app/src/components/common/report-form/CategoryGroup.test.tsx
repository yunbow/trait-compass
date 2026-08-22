import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportCategoryGroup } from "@/components/common/report-form/CategoryGroup";

const OPTIONS = [
  { value: "phone", label: "電話番号が違う・つながらない" },
  { value: "address", label: "所在地や地図が違う" },
] as const;

describe("ReportCategoryGroup(Phase 2: 2-10 ReportFormParts)", () => {
  it("選択肢をボタンとして表示し、選択済みの値には aria-pressed=true が付く", () => {
    render(<ReportCategoryGroup options={OPTIONS} selectedValue="address" onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "電話番号が違う・つながらない" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "所在地や地図が違う" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("selectedValueがnullの場合、どのボタンにも aria-pressed=true が付かない", () => {
    render(<ReportCategoryGroup options={OPTIONS} selectedValue={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "電話番号が違う・つながらない" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "所在地や地図が違う" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("ボタンをクリックするとonSelectが選択した値とともに呼ばれる", () => {
    const onSelect = vi.fn();
    render(<ReportCategoryGroup options={OPTIONS} selectedValue={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "所在地や地図が違う" }));

    expect(onSelect).toHaveBeenCalledWith("address");
  });

  it("見出し(legend)「何を訂正・更新しますか？」を表示する", () => {
    render(<ReportCategoryGroup options={OPTIONS} selectedValue={null} onSelect={vi.fn()} />);

    expect(screen.getByText("何を訂正・更新しますか？")).toBeTruthy();
  });
});
