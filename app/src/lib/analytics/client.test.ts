import { afterEach, describe, expect, it, vi } from "vitest";

import { trackPageReached } from "@/lib/analytics/client";
import type { TrackableScreen } from "@/lib/analytics/client";

describe("trackPageReached", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("POST /api/track へ screen のみを含む body を送信する", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    trackPageReached("top");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/track");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ screen: "top" });
  });

  it("navigator.doNotTrack === '1' の場合は送信しない", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "doNotTrack");
    Object.defineProperty(window.navigator, "doNotTrack", { value: "1", configurable: true });

    try {
      trackPageReached("survey");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window.navigator, "doNotTrack", originalDescriptor);
      } else {
        // @ts-expect-error: jsdom の Navigator にはデフォルトで doNotTrack が定義されていないため削除して復元する。
        delete window.navigator.doNotTrack;
      }
    }
  });

  it("fetch が reject しても例外を投げない(fire-and-forget)", () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    expect(() => trackPageReached("result")).not.toThrow();
  });

  it("fetch が同期的に例外を投げても呼び出し側には伝播しない", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("sync failure");
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(() => trackPageReached("support-results")).not.toThrow();
  });

  it("閉じた union 型以外の screen 値は型エラーになる(コンパイル時の制約)", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    // @ts-expect-error: TrackableScreen に含まれない値は渡せない。
    trackPageReached("invalid-screen");
    // @ts-expect-error: 第2引数(任意ペイロード)は受け付けない。
    trackPageReached("top", { score: 42 });

    const screen: TrackableScreen = "top";
    expect(screen).toBe("top");
  });
});
