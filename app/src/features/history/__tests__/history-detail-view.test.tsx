import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HistoryDetailView } from "@/features/history/components/HistoryDetailView";
import type { HistoryEntry } from "@/features/history/services/history-store";
import type { CategoryScores, OverlapCounts, TraitScores } from "@/features/survey/services/scoring";

const EMPTY_CATEGORY_SCORES: CategoryScores = {
  communication: null,
  "social-reading": null,
  "emotion-regulation": null,
  "impulse-memory": null,
  "executive-function": null,
  "kindness-misread": null,
  sensory: null,
  motor: null,
  learning: null,
  "restricted-repetitive": null,
};

const SAMPLE_TRAIT_SCORES: TraitScores = { ASD: 80, ADHD: null, LD: null, DCD: null };
const SAMPLE_OVERLAP_COUNTS: OverlapCounts = {};

function buildEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "entry-1",
    savedAt: "2026-06-01T00:00:00.000Z",
    categoryScores: EMPTY_CATEGORY_SCORES,
    traitScores: SAMPLE_TRAIT_SCORES,
    grayZoneCount: 0,
    overlapCounts: SAMPLE_OVERLAP_COUNTS,
    ...overrides,
  };
}

describe("HistoryDetailView", () => {
  it("保存時点のスコアから導いた相談分野タグをASCII IDへ変換した tags クエリで「地域の相談先を探す」リンクを組み立てる", () => {
    const entry = buildEntry({ categoryScores: { ...EMPTY_CATEGORY_SCORES, communication: 80 } });
    render(<HistoryDetailView entry={entry} onBack={() => {}} />);

    const link = screen.getByRole("button", { name: "地域の相談先を探す" }).closest("a");
    expect(link?.getAttribute("href")).toBe("/support?tags=social");
  });

  it("相談分野タグが無い場合は「全般」扱いとし、tags クエリを付けずに /support を指す", () => {
    const entry = buildEntry({ categoryScores: EMPTY_CATEGORY_SCORES });
    render(<HistoryDetailView entry={entry} onBack={() => {}} />);

    const link = screen.getByRole("button", { name: "地域の相談先を探す" }).closest("a");
    expect(link?.getAttribute("href")).toBe("/support");
  });
});
