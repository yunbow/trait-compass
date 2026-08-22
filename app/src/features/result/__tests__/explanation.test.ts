import { describe, expect, it } from "vitest";

import { CATEGORY_DESCRIPTIONS } from "@/features/result/constants/category-descriptions";
import { getAllCategoryLevels, getCategoryExplanations } from "@/features/result/services/explanation";
import type { CategoryScores } from "@/features/survey/services/scoring";
import { BANNED_WORDS } from "@/lib/copy/banned-words";

const CATEGORY_SCORES: CategoryScores = {
  communication: 40,
  "social-reading": null,
  "emotion-regulation": 90,
  "impulse-memory": 10,
  "executive-function": 60,
  "kindness-misread": null,
  sensory: 20,
  motor: null,
  learning: 75,
  "restricted-repetitive": 30,
};

describe("getCategoryExplanations", () => {
  it("スコア降順で上位N件を返し、null(未算出)カテゴリは除外する(FR-017)", () => {
    const result = getCategoryExplanations(CATEGORY_SCORES, 3);

    expect(result.map((r) => r.category)).toEqual(["emotion-regulation", "learning", "executive-function"]);
    expect(result.every((r) => r.score !== null)).toBe(true);
  });

  it("各エントリに表示ラベルと説明文を付与する", () => {
    const [top] = getCategoryExplanations(CATEGORY_SCORES, 1);

    expect(top).toEqual({
      category: "emotion-regulation",
      label: "感情の調整",
      score: 90,
      description: CATEGORY_DESCRIPTIONS["emotion-regulation"],
    });
  });

  it("回答が全て null の場合は空配列を返す", () => {
    const allNull: CategoryScores = {
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

    expect(getCategoryExplanations(allNull)).toEqual([]);
  });
});

describe("getAllCategoryLevels", () => {
  it("全10カテゴリを、スコア降順(未算出は最後)の質的表現で返す(P0対応)", () => {
    const result = getAllCategoryLevels(CATEGORY_SCORES);

    expect(result).toHaveLength(10);
    expect(result.map((r) => r.category)).toEqual([
      "emotion-regulation",
      "learning",
      "executive-function",
      "communication",
      "restricted-repetitive",
      "sensory",
      "impulse-memory",
      "social-reading",
      "kindness-misread",
      "motor",
    ]);
    expect(result.find((r) => r.category === "emotion-regulation")?.level).toBe("高め");
    expect(result.find((r) => r.category === "social-reading")?.level).toBeNull();
  });
});

describe("CATEGORY_DESCRIPTIONS", () => {
  it("いずれの説明文にも診断・判定を示唆する断定表現を含まない(NFR-51)", () => {
    for (const [category, description] of Object.entries(CATEGORY_DESCRIPTIONS)) {
      for (const banned of BANNED_WORDS) {
        expect(description, `${category} の説明文に「${banned}」が含まれています`).not.toContain(banned);
      }
    }
  });
});
