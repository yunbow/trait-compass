import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const trackPageReachedMock = vi.fn();
vi.mock("@/lib/analytics/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics/client")>("@/lib/analytics/client");
  return {
    ...actual,
    trackPageReached: (...args: unknown[]) => trackPageReachedMock(...args),
  };
});

import { PageReachTracker } from "@/components/common/PageReachTracker";

describe("PageReachTracker", () => {
  it("マウント時に trackPageReached(screen) を1回だけ呼び出す", () => {
    render(<PageReachTracker screen="support-results" />);

    expect(trackPageReachedMock).toHaveBeenCalledTimes(1);
    expect(trackPageReachedMock).toHaveBeenCalledWith("support-results");
  });

  it("何も描画しない", () => {
    const { container } = render(<PageReachTracker screen="top" />);

    expect(container.innerHTML).toBe("");
  });
});
