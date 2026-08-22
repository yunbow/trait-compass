import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FullPageFallback } from "@/components/common/FullPageFallback";

describe("FullPageFallback", () => {
  it("title/description を表示する", () => {
    render(<FullPageFallback title="検索条件を確認できませんでした。" description="年齢と区市町村を選び直してください。" />);

    expect(screen.getByText("検索条件を確認できませんでした。")).toBeTruthy();
    expect(screen.getByText("年齢と区市町村を選び直してください。")).toBeTruthy();
  });

  it("action の有無に関わらず、非診断の免責(DisclaimerNotice)を表示する", () => {
    render(<FullPageFallback title="タイトル" description="説明" />);

    expect(screen.getByRole("note")).toBeTruthy();
  });

  it("action を渡した場合、その内容を表示する", () => {
    render(<FullPageFallback title="タイトル" description="説明" action={<button type="button">条件を入力しなおす</button>} />);

    expect(screen.getByRole("button", { name: "条件を入力しなおす" })).toBeTruthy();
    expect(screen.getByRole("note")).toBeTruthy();
  });

  it("action を渡さない場合、ボタン等の余分な要素を表示しない", () => {
    render(<FullPageFallback title="タイトル" description="説明" />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
