import { describe, expect, it } from "vitest";

import { CATEGORY_KEYS } from "@/features/survey/schema/question";
import type { CategoryKey } from "@/features/survey/schema/question";
import type { CategoryScores } from "@/features/survey/services/scoring";
import { mapScoresToTags, SUPPORT_TAGS } from "@/features/support/services/category-tag-mapping";

/** 全カテゴリ null のベーススコア(個別テストで一部だけ上書きして使う)。 */
function emptyScores(): CategoryScores {
  return Object.fromEntries(CATEGORY_KEYS.map((category) => [category, null])) as CategoryScores;
}

describe("SUPPORT_TAGS", () => {
  it("診断名・症状ラベルを想起させる禁止語を含まない(FR-023, NFR-51)", () => {
    const forbiddenWords = ["診断", "障害", "症状", "多動", "判定", "ASD", "ADHD", "LD", "DCD"];
    for (const tag of SUPPORT_TAGS) {
      for (const word of forbiddenWords) {
        expect(tag).not.toContain(word);
      }
    }
  });

  it("4〜6個に集約されている", () => {
    expect(SUPPORT_TAGS.length).toBeGreaterThanOrEqual(4);
    expect(SUPPORT_TAGS.length).toBeLessThanOrEqual(6);
  });
});

describe("mapScoresToTags", () => {
  it("全カテゴリが null の場合は空配列を返す(呼び出し側で SUPPORT_TAGS フォールバック可能)", () => {
    expect(mapScoresToTags(emptyScores())).toEqual([]);
  });

  it("全カテゴリが閾値未満の場合は空配列を返す", () => {
    const scores = emptyScores();
    for (const category of CATEGORY_KEYS) {
      scores[category] = 10;
    }
    expect(mapScoresToTags(scores)).toEqual([]);
  });

  it("既定閾値(40)ちょうどは対象に含める(境界値)", () => {
    const scores = emptyScores();
    scores.sensory = 40;
    expect(mapScoresToTags(scores)).toEqual(["感覚"]);
  });

  it("既定閾値未満(39)は対象から除外する(境界値)", () => {
    const scores = emptyScores();
    scores.sensory = 39;
    expect(mapScoresToTags(scores)).toEqual([]);
  });

  it("threshold を指定できる", () => {
    const scores = emptyScores();
    scores.sensory = 39;
    expect(mapScoresToTags(scores, 30)).toEqual(["感覚"]);
  });

  it("スコア降順でタグを返す", () => {
    const scores = emptyScores();
    scores.sensory = 60; // 「感覚」
    scores["restricted-repetitive"] = 90; // 「こだわり」
    scores["emotion-regulation"] = 75; // 「こころ・感情」
    expect(mapScoresToTags(scores)).toEqual(["こだわり", "こころ・感情", "感覚"]);
  });

  it("複数カテゴリが同一タグへ集約される場合は重複を排除する", () => {
    const scores = emptyScores();
    scores.communication = 90; // 「対人・コミュニケーション」
    scores["social-reading"] = 80; // 同上
    scores["kindness-misread"] = 70; // 同上
    expect(mapScoresToTags(scores)).toEqual(["対人・コミュニケーション"]);
  });

  it("スコアが同点の場合も重複なく1件のタグとして返す", () => {
    const scores = emptyScores();
    scores["impulse-memory"] = 50;
    scores["executive-function"] = 50; // 同じ「不注意・段取り」
    expect(mapScoresToTags(scores)).toEqual(["不注意・段取り"]);
  });

  describe.each(CATEGORY_KEYS)("カテゴリ網羅性: %s", (category: CategoryKey) => {
    it("いずれかの SUPPORT_TAGS へマッピングされる(AC-1)", () => {
      const scores = emptyScores();
      scores[category] = 100;
      const tags = mapScoresToTags(scores);
      expect(tags.length).toBe(1);
      expect(SUPPORT_TAGS).toContain(tags[0]);
    });
  });
});
