import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoAnswersFallback } from "@/components/common/NoAnswersFallback";

describe("NoAnswersFallback", () => {
  it("見出しと説明文を表示する", () => {
    render(<NoAnswersFallback />);

    expect(screen.getByText("まだ回答がありません。")).toBeTruthy();
    expect(screen.getByText("アンケートに回答すると、この機能が使えます。")).toBeTruthy();
  });

  it("チェックを始めるボタン(/survey へのリンク)を表示する", () => {
    render(<NoAnswersFallback />);

    const link = screen.getByRole("button", { name: "チェックを始める" });
    expect(link.getAttribute("href")).toBe("/survey");
  });

  it("結果画面へ戻るボタン(/result へのリンク)を表示する", () => {
    render(<NoAnswersFallback />);

    const link = screen.getByRole("button", { name: "結果画面へ戻る" });
    expect(link.getAttribute("href")).toBe("/result");
  });
});
