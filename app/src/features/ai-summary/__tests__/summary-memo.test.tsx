import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SummaryMemo } from "@/features/ai-summary/components/SummaryMemo";

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-print-mode");
});

describe("SummaryMemo", () => {
  it("要約本文にAI由来ラベルを表示する", () => {
    render(<SummaryMemo summary="傾向の要約です。" />);

    expect(screen.getByText("AIによる要約(参考情報)")).toBeTruthy();
    expect(screen.getByText("傾向の要約です。")).toBeTruthy();
  });

  it("「印刷する」を押すと <html> に印刷モード属性を付与し window.print() を呼ぶ", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<SummaryMemo summary="傾向の要約です。" />);

    fireEvent.click(screen.getByRole("button", { name: /印刷する/ }));

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute("data-print-mode")).toBe("prepare-memo");
  });

  it("afterprint イベントで印刷モード属性を除去する", () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    render(<SummaryMemo summary="傾向の要約です。" />);

    fireEvent.click(screen.getByRole("button", { name: /印刷する/ }));
    expect(document.documentElement.getAttribute("data-print-mode")).toBe("prepare-memo");

    fireEvent(window, new Event("afterprint"));
    expect(document.documentElement.hasAttribute("data-print-mode")).toBe(false);
  });

  it("「コピーする」を押すとクリップボードへ要約文字列をそのまま書き出す", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SummaryMemo summary="傾向の要約です。" />);
    fireEvent.click(screen.getByRole("button", { name: /コピーする/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("傾向の要約です。");
    expect(await screen.findByText("コピーしました")).toBeTruthy();
  });

  it("クリップボード書き込みが失敗した場合はエラー表示に切り替える", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SummaryMemo summary="傾向の要約です。" />);
    fireEvent.click(screen.getByRole("button", { name: /コピーする/ }));

    expect(await screen.findByText("コピーに失敗しました。お使いのブラウザの設定をご確認ください。")).toBeTruthy();
  });
});
