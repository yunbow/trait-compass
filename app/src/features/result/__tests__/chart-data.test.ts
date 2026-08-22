import { describe, expect, it } from "vitest";

import { buildRadarAriaLabel, buildRadarData } from "@/features/result/services/chart-data";
import type { CategoryScores } from "@/features/survey/services/scoring";

const FULL_CATEGORY_SCORES: CategoryScores = {
  communication: 80,
  "social-reading": 60,
  "emotion-regulation": 40,
  "impulse-memory": 20,
  "executive-function": 0,
  "kindness-misread": 100,
  sensory: 50,
  motor: 10,
  learning: 30,
  "restricted-repetitive": 70,
};

describe("buildRadarData", () => {
  it("10カテゴリすべてを掲載順で返し、算出済みのスコアをそのまま保持する", () => {
    const result = buildRadarData(FULL_CATEGORY_SCORES);

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({
      category: "communication",
      label: "会話・伝え方",
      score: 80,
      isUnavailable: false,
    });
    expect(result.every((d) => !d.isUnavailable)).toBe(true);
  });

  it("スコアが null のカテゴリは isUnavailable=true としてマークし、他カテゴリと同列の数値にしない(AC-2)", () => {
    const scores: CategoryScores = { ...FULL_CATEGORY_SCORES, sensory: null };

    const result = buildRadarData(scores);

    const sensory = result.find((d) => d.category === "sensory");
    expect(sensory).toEqual({ category: "sensory", label: "感覚", score: null, isUnavailable: true });
  });
});

describe("buildRadarAriaLabel", () => {
  it("未算出カテゴリは数値ではなく「未算出」と表現する", () => {
    const data = buildRadarData({ ...FULL_CATEGORY_SCORES, motor: null });

    const label = buildRadarAriaLabel(data);

    expect(label).toContain("運動・不器用さ: 未算出");
    expect(label).toContain("会話・伝え方: 80%");
  });
});
