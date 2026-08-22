import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HistoryToggle } from "@/features/settings/components/HistoryToggle";

describe("HistoryToggle(TICKET-0027)", () => {
  it("無効時は role=switch・aria-checked=false で描画され、無効である旨を表示する", () => {
    render(<HistoryToggle enabled={false} onToggle={vi.fn()} />);

    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("無効(初期設定)")).toBeTruthy();
    expect(screen.getByText("結果は履歴に保存されません。")).toBeTruthy();
  });

  it("有効時は aria-checked=true で描画され、有効である旨を表示する", () => {
    render(<HistoryToggle enabled={true} onToggle={vi.fn()} />);

    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("有効")).toBeTruthy();
    expect(screen.getByText("結果画面から履歴を保存できます。")).toBeTruthy();
  });

  it("クリックすると現在値を反転させた値で onToggle を呼ぶ(自身では永続化しない)", () => {
    const onToggle = vi.fn();
    render(<HistoryToggle enabled={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("switch"));

    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("有効な状態でクリックすると false で onToggle を呼ぶ", () => {
    const onToggle = vi.fn();
    render(<HistoryToggle enabled={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("switch"));

    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
