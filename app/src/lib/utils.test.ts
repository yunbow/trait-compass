import { afterEach, describe, expect, it, vi } from "vitest";
import { cn, prefersReducedMotion } from "@/lib/utils";

describe("cn", () => {
  it("結合したクラス名を返す", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("falsy な値を無視する", () => {
    expect(cn("px-2", false, undefined, null, "py-1")).toBe("px-2 py-1");
  });

  it("Tailwind の競合クラスを後勝ちでマージする", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("prefersReducedMotion (NFR-41)", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("matchMedia が reduce 一致を返す場合は true", () => {
    // jsdom は matchMedia を実装していないため、spyOn ではなく直接差し替える。
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
  });

  it("matchMedia が一致しない場合は false", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });

  it("matchMedia が未実装の環境(jsdom の既定状態)では例外を投げず false を返す(NFR-31 と同様の安全策)", () => {
    // @ts-expect-error -- 未実装環境を模した意図的な削除
    delete window.matchMedia;
    expect(() => prefersReducedMotion()).not.toThrow();
    expect(prefersReducedMotion()).toBe(false);
  });
});
