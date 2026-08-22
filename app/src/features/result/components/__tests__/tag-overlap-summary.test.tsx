import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TagOverlapSummary } from "@/features/result/components/TagOverlapSummary";

describe("TagOverlapSummary", () => {
  it("2つのタグと文章を渡すと、両方のタグ名と文章を表示し、診断カテゴリ名・%は一切表示しない(安全性の中核アサーション)", () => {
    const { container } = render(
      <TagOverlapSummary
        tags={["対人・コミュニケーション", "感覚"]}
        sentence="「対人・コミュニケーション」と「感覚」の両方が高めに出ています。人とのやり取りに加えて、音や光などの環境面の負担も一緒に伝えると、相談先で状況が伝わりやすくなります。"
      />,
    );

    expect(screen.getByText("対人・コミュニケーション")).toBeTruthy();
    expect(screen.getByText("感覚")).toBeTruthy();
    expect(
      screen.getByText(
        "「対人・コミュニケーション」と「感覚」の両方が高めに出ています。人とのやり取りに加えて、音や光などの環境面の負担も一緒に伝えると、相談先で状況が伝わりやすくなります。",
      ),
    ).toBeTruthy();

    const renderedText = container.textContent ?? "";
    expect(renderedText).not.toMatch(/ASD|ADHD|LD|DCD/);
    expect(renderedText).not.toContain("%");
  });

  it("タグが1件・sentence が null のとき、1件用のフォールバック文言を表示する", () => {
    render(<TagOverlapSummary tags={["こだわり"]} sentence={null} />);

    expect(screen.getByText("こだわり")).toBeTruthy();
    expect(screen.getByText("「こだわり」の傾向が比較的高めに出ています。")).toBeTruthy();
  });

  it("タグが0件のとき、「特に高めに出ている項目はありませんでした」というメッセージを表示する", () => {
    render(<TagOverlapSummary tags={[]} sentence={null} />);

    expect(screen.getByText("今回は、特に高めに出ている項目はありませんでした。")).toBeTruthy();
  });
});
