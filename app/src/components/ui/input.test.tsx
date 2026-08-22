import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("value・placeholder 等のpropsがレンダリングに反映される", () => {
    render(<Input value="困りごとメモ" placeholder="困りごとを入力" onChange={() => {}} aria-label="メモ" />);

    const input = screen.getByLabelText("メモ") as HTMLInputElement;
    expect(input.value).toBe("困りごとメモ");
    expect(input.getAttribute("placeholder")).toBe("困りごとを入力");
  });

  it("className を渡した場合、ベースクラスを保ったまま追加のclassNameがマージされる", () => {
    render(<Input aria-label="メモ" className="h-40" />);

    const input = screen.getByLabelText("メモ");
    expect(input.className).toContain("rounded-lg");
    expect(input.className).toContain("h-40");
  });

  it("ユーザー入力時に onChange が呼ばれる", () => {
    const handleChange = vi.fn();
    render(<Input aria-label="メモ" onChange={handleChange} />);

    fireEvent.change(screen.getByLabelText("メモ"), { target: { value: "テスト入力" } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("メモ") as HTMLInputElement).value).toBe("テスト入力");
  });
});
