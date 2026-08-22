import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistoryTopLink } from "@/features/history/components/HistoryTopLink";
import type { HistoryEntry } from "@/features/history/services/history-store";

const listResults = vi.fn();

vi.mock("@/features/history/services/history-store", () => ({
  listResults: (...args: unknown[]) => listResults(...args),
}));

const SAMPLE_ENTRY = {
  id: "entry-1",
  savedAt: "2026-06-01T00:00:00.000Z",
  categoryScores: {
    communication: 80,
    "social-reading": null,
    "emotion-regulation": null,
    "impulse-memory": null,
    "executive-function": null,
    "kindness-misread": null,
    sensory: null,
    motor: null,
    learning: null,
    "restricted-repetitive": null,
  },
  traitScores: { ASD: 80, ADHD: null, LD: null, DCD: null },
  grayZoneCount: 0,
  overlapCounts: {},
} satisfies HistoryEntry;

afterEach(() => {
  vi.clearAllMocks();
});

describe("HistoryTopLink(TICKET-0026)", () => {
  it("履歴が0件の場合は何も表示しない", async () => {
    listResults.mockResolvedValue([]);

    render(<HistoryTopLink />);

    await waitFor(() => {
      expect(listResults).toHaveBeenCalled();
    });
    expect(screen.queryByText("これまでの記録を見る")).toBeNull();
  });

  it("履歴が1件以上ある場合は /history への導線を表示する", async () => {
    listResults.mockResolvedValue([SAMPLE_ENTRY]);

    render(<HistoryTopLink />);

    const link = await screen.findByText("これまでの記録を見る");
    expect(link.closest("a")?.getAttribute("href")).toBe("/history");
  });
});
