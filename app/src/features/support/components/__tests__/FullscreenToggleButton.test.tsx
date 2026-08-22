import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FULLSCREEN_OVERLAY_CLASSNAME, FullscreenToggleButton } from "@/features/support/components/FullscreenToggleButton";

describe("FullscreenToggleButton", () => {
  it("fullscreen=falseの場合はexpandLabelを表示し、aria-pressedはfalse", () => {
    render(<FullscreenToggleButton fullscreen={false} onToggle={() => {}} expandLabel="地図を拡大" />);

    const button = screen.getByRole("button", { name: "地図を拡大" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("fullscreen=trueの場合は既定のcollapseLabel(「元のサイズに戻す」)を表示し、aria-pressedはtrue", () => {
    render(<FullscreenToggleButton fullscreen={true} onToggle={() => {}} expandLabel="比較表を拡大" />);

    const button = screen.getByRole("button", { name: "元のサイズに戻す" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("collapseLabelを渡した場合はそちらを優先して表示する", () => {
    render(
      <FullscreenToggleButton fullscreen={true} onToggle={() => {}} expandLabel="地図を拡大" collapseLabel="閉じる" />,
    );

    expect(screen.getByRole("button", { name: "閉じる" })).toBeTruthy();
    expect(screen.queryByText("元のサイズに戻す")).toBeNull();
  });

  it("クリックするとonToggleが呼ばれる", () => {
    const onToggle = vi.fn();
    render(<FullscreenToggleButton fullscreen={false} onToggle={onToggle} expandLabel="地図を拡大" />);

    fireEvent.click(screen.getByRole("button", { name: "地図を拡大" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("button要素のtype属性はsubmitではなくbuttonである(フォーム内での誤送信防止)", () => {
    render(<FullscreenToggleButton fullscreen={false} onToggle={() => {}} expandLabel="地図を拡大" />);

    const button = screen.getByRole("button", { name: "地図を拡大" });
    expect(button.getAttribute("type")).toBe("button");
  });

  it("fullscreen=falseとtrueの切り替えでアイコンの見た目(aria-hidden svg)が描画される", () => {
    const { container, rerender } = render(
      <FullscreenToggleButton fullscreen={false} onToggle={() => {}} expandLabel="地図を拡大" />,
    );
    expect(container.querySelector("svg[aria-hidden]")).toBeTruthy();

    rerender(<FullscreenToggleButton fullscreen={true} onToggle={() => {}} expandLabel="地図を拡大" />);
    expect(container.querySelector("svg[aria-hidden]")).toBeTruthy();
  });

  it("FULLSCREEN_OVERLAY_CLASSNAMEはFacilityCompareView/SchoolCompareViewが使っていたオーバーレイクラス文字列と一致する", () => {
    expect(FULLSCREEN_OVERLAY_CLASSNAME).toBe(
      "fixed inset-0 z-50 h-full bg-background p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]",
    );
  });
});
