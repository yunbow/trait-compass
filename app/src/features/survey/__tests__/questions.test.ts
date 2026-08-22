import { describe, expect, it } from "vitest";

import { CATEGORY_KEYS, type CategoryKey } from "@/features/survey/schema/question";
import { P0_QUESTION_IDS, getAllQuestions, getP0Questions } from "@/features/survey/services/questions";

// app/src/data/questions.json のカテゴリ別内訳(合計242問)。
const EXPECTED_CATEGORY_COUNTS: Record<CategoryKey, number> = {
  communication: 27,
  "social-reading": 27,
  "emotion-regulation": 25,
  "impulse-memory": 25,
  "executive-function": 25,
  "kindness-misread": 26,
  sensory: 26,
  motor: 27,
  learning: 26,
  "restricted-repetitive": 8,
};

// 各カテゴリの P0 出題 ID の期待値(カテゴリ内定義順)。
const EXPECTED_P0_IDS_BY_CATEGORY: Record<CategoryKey, string[]> = {
  communication: ["ND-0001", "ND-0005", "ND-0011"],
  "social-reading": ["ND-0002", "ND-0006", "ND-0013"],
  "emotion-regulation": ["ND-0052", "ND-0073", "ND-0087"],
  "impulse-memory": ["ND-0003", "ND-0007", "ND-0015"],
  "executive-function": ["ND-0010", "ND-0021", "ND-0022"],
  "kindness-misread": ["ND-0004", "ND-0008", "ND-0017"],
  sensory: ["ND-0009", "ND-0019", "ND-0020"],
  motor: ["ND-0079", "ND-0080", "ND-0112"],
  learning: ["ND-0107", "ND-0108", "ND-0109"],
  "restricted-repetitive": ["ND-0034", "ND-0239", "ND-0240"],
};

describe("getAllQuestions", () => {
  it("242問すべてをロードできる", () => {
    expect(getAllQuestions()).toHaveLength(242);
  });

  it("ID が重複しない", () => {
    const ids = getAllQuestions().map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("10カテゴリすべてが存在する", () => {
    const categories = new Set(getAllQuestions().map((question) => question.category));
    expect(categories.size).toBe(10);
    for (const key of CATEGORY_KEYS) {
      expect(categories.has(key)).toBe(true);
    }
  });

  it.each(Object.entries(EXPECTED_CATEGORY_COUNTS))("カテゴリ %s の問数が期待値と一致する", (category, expectedCount) => {
    const count = getAllQuestions().filter((question) => question.category === category).length;
    expect(count).toBe(expectedCount);
  });
});

describe("getP0Questions", () => {
  it("30問を返す", () => {
    expect(getP0Questions()).toHaveLength(30);
  });

  it("ID が重複しない", () => {
    const ids = getP0Questions().map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("P0_QUESTION_IDS はすべて全242問データ中に実在する", () => {
    const allIds = new Set(getAllQuestions().map((question) => question.id));
    for (const id of P0_QUESTION_IDS) {
      expect(allIds.has(id)).toBe(true);
    }
  });

  it("各カテゴリちょうど3問ずつ返す", () => {
    const countByCategory = new Map<string, number>();
    for (const question of getP0Questions()) {
      countByCategory.set(question.category, (countByCategory.get(question.category) ?? 0) + 1);
    }
    expect(countByCategory.size).toBe(10);
    for (const count of countByCategory.values()) {
      expect(count).toBe(3);
    }
  });

  it.each(Object.entries(EXPECTED_P0_IDS_BY_CATEGORY))(
    "カテゴリ %s の出題 ID が spec の表と完全一致する(カテゴリ内定義順)",
    (category, expectedIds) => {
      const actualIds = getP0Questions()
        .filter((question) => question.category === category)
        .map((question) => question.id);
      expect(actualIds).toEqual(expectedIds);
    },
  );

  it("カテゴリ順・カテゴリ内定義順で全30 ID が spec の表と完全一致する", () => {
    const expectedIds = CATEGORY_KEYS.flatMap((category) => EXPECTED_P0_IDS_BY_CATEGORY[category]);
    expect(P0_QUESTION_IDS).toEqual(expectedIds);
    expect(getP0Questions().map((question) => question.id)).toEqual(expectedIds);
  });

  it("複数回呼び出しても常に同じ結果を返す(非ランダム)", () => {
    const first = getP0Questions().map((question) => question.id);
    const second = getP0Questions().map((question) => question.id);
    expect(second).toEqual(first);
  });
});
