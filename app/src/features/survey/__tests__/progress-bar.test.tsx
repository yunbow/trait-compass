import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "@/features/survey/components/ProgressBar";

describe("ProgressBar", () => {
  it("role=progressbar と aria-valuenow/min/max/label を持つ(NFR-46)", () => {
    render(<ProgressBar currentCategory="emotion-regulation" currentQuestion={7} totalQuestions={30} />);

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("7");
    expect(bar.getAttribute("aria-valuemin")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("30");
    expect(bar.getAttribute("aria-label")).toContain("7/30問目");
    expect(bar.getAttribute("aria-label")).toContain("カテゴリ3/10");
    expect(screen.queryByText("7 / 30")).toBeNull();
  });

  it("%数値のテキストを表示しない(NFR-45)", () => {
    render(<ProgressBar currentCategory="communication" currentQuestion={1} totalQuestions={30} />);

    expect(screen.queryByText(/%/)).toBeNull();
  });
});
