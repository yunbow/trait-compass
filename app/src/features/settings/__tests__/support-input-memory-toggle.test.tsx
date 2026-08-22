import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SupportInputMemoryToggle } from "@/features/settings/components/SupportInputMemoryToggle";

describe("SupportInputMemoryToggle(TICKET-0027)", () => {
  it("無効時は role=switch・aria-checked=false で描画され、無効である旨を表示する", () => {
    render(<SupportInputMemoryToggle enabled={false} onToggle={vi.fn()} />);

    const toggle = screen.getByRole("switch", { name: "年齢と地域の保存" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("無効(初期設定)")).toBeTruthy();
    expect(screen.getByText("支援情報を探す画面での年齢・区市町村の入力は保存されません。")).toBeTruthy();
  });

  it("有効時は aria-checked=true で描画され、有効である旨を表示する", () => {
    render(<SupportInputMemoryToggle enabled={true} onToggle={vi.fn()} />);

    const toggle = screen.getByRole("switch", { name: "年齢と地域の保存" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("有効")).toBeTruthy();
    expect(screen.getByText("支援情報を探す画面(/support)で入力した年齢・区市町村を、このブラウザに保存して次回の入力を省略します。")).toBeTruthy();
  });

  it("クリックすると現在値を反転させた値で onToggle を呼ぶ(自身では永続化しない)", () => {
    const onToggle = vi.fn();
    render(<SupportInputMemoryToggle enabled={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("switch", { name: "年齢と地域の保存" }));

    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("有効な状態でクリックすると false で onToggle を呼ぶ", () => {
    const onToggle = vi.fn();
    render(<SupportInputMemoryToggle enabled={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("switch", { name: "年齢と地域の保存" }));

    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
