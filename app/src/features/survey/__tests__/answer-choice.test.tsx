import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnswerChoice } from "@/features/survey/components/AnswerChoice";
import { ANSWER_OPTIONS } from "@/features/survey/constants/answer-labels";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("AnswerChoice", () => {
  it("各選択肢に連番の数字バッジを描画する", () => {
    render(<AnswerChoice selectedValue={undefined} onSelect={vi.fn()} />);

    for (const number of ["1", "2", "3"]) {
      expect(screen.getByText(number, { selector: 'span[aria-hidden="true"]' })).toBeTruthy();
    }
  });

  it("高精度ポインタ環境では数字キーで対応する選択肢を選ぶ", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const onSelect = vi.fn();
    render(<AnswerChoice selectedValue={undefined} onSelect={onSelect} />);

    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "2" });
    fireEvent.keyDown(window, { key: "3" });

    expect(onSelect).toHaveBeenNthCalledWith(1, ANSWER_OPTIONS[0].value);
    expect(onSelect).toHaveBeenNthCalledWith(2, ANSWER_OPTIONS[1].value);
    expect(onSelect).toHaveBeenNthCalledWith(3, ANSWER_OPTIONS[2].value);
  });

  it("高精度ポインタがない環境では数字キーを無効にする", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    const onSelect = vi.fn();
    render(<AnswerChoice selectedValue={undefined} onSelect={onSelect} />);

    fireEvent.keyDown(window, { key: "1" });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Ctrl または Cmd と組み合わせた数字キーは処理しない", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const onSelect = vi.fn();
    render(<AnswerChoice selectedValue={undefined} onSelect={onSelect} />);

    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    fireEvent.keyDown(window, { key: "1", metaKey: true });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
