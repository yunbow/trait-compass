import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMemoPrintCopy } from "@/lib/print/use-memo-print-copy";

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-print-mode");
});

describe("useMemoPrintCopy", () => {
  it("handlePrint で <html> に印刷モード属性を付与し window.print() を呼ぶ", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const { result } = renderHook(() => useMemoPrintCopy({ getCopyText: () => "text" }));

    act(() => result.current.handlePrint());

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute("data-print-mode")).toBe("prepare-memo");
  });

  it("afterprint イベントで印刷モード属性を除去する", () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    const { result } = renderHook(() => useMemoPrintCopy({ getCopyText: () => "text" }));

    act(() => result.current.handlePrint());
    expect(document.documentElement.getAttribute("data-print-mode")).toBe("prepare-memo");

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(document.documentElement.hasAttribute("data-print-mode")).toBe(false);
  });

  it("アンマウント後は afterprint リスナーを解除する", () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useMemoPrintCopy({ getCopyText: () => "text" }));

    act(() => result.current.handlePrint());
    unmount();
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });

    expect(document.documentElement.getAttribute("data-print-mode")).toBe("prepare-memo");
  });

  it("handleCopy は idle から copied へ遷移し、getCopyText の戻り値をそのまま書き出す", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { result } = renderHook(() => useMemoPrintCopy({ getCopyText: () => "コピー対象テキスト" }));

    expect(result.current.copyState).toBe("idle");

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(writeText).toHaveBeenCalledWith("コピー対象テキスト");
    expect(result.current.copyState).toBe("copied");
  });

  it("クリップボード書き込みが失敗した場合は error へ遷移する", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const { result } = renderHook(() => useMemoPrintCopy({ getCopyText: () => "text" }));

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(result.current.copyState).toBe("error");
  });
});
