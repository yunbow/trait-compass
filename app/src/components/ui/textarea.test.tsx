import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Textarea } from "@/components/ui/textarea";

describe("Textarea", () => {
  it("value・placeholder 等のpropsがレンダリングに反映される", () => {
    render(<Textarea value="困りごとメモ" placeholder="困りごとを入力" onChange={() => {}} aria-label="メモ" />);

    const textarea = screen.getByLabelText("メモ") as HTMLTextAreaElement;
    expect(textarea.value).toBe("困りごとメモ");
    expect(textarea.getAttribute("placeholder")).toBe("困りごとを入力");
  });

  it("className を渡した場合、ベースクラスを保ったまま追加のclassNameがマージされる", () => {
    render(<Textarea aria-label="メモ" className="h-40" />);

    const textarea = screen.getByLabelText("メモ");
    expect(textarea.className).toContain("rounded-lg");
    expect(textarea.className).toContain("h-40");
  });

  it("ユーザー入力時に onChange が呼ばれる", () => {
    const handleChange = vi.fn();
    render(<Textarea aria-label="メモ" onChange={handleChange} />);

    fireEvent.change(screen.getByLabelText("メモ"), { target: { value: "テスト入力" } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("メモ") as HTMLTextAreaElement).value).toBe("テスト入力");
  });
});
