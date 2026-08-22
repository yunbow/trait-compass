import { describe, expect, it } from "vitest";

import { buildTagOverlap } from "@/features/result/services/tag-overlap";
import type { CategoryScores } from "@/features/survey/services/scoring";

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

describe("buildTagOverlap", () => {
  it("2件以上のタグが閾値以上のとき、両方のタグ名を含む文章を返す(診断カテゴリ名・%は含まない)", () => {
    const scores: CategoryScores = {
      ...EMPTY_CATEGORY_SCORES,
      communication: 80, // 対人・コミュニケーション
      "restricted-repetitive": 70, // こだわり
      sensory: 50, // 感覚
      "emotion-regulation": 40, // こころ・感情
    };

    const result = buildTagOverlap(scores);

    expect(result.tags.length).toBeGreaterThanOrEqual(2);
    expect(result.sentence).not.toBeNull();
    expect(result.sentence).toContain(`「${result.tags[0]}」`);
    expect(result.sentence).toContain(`「${result.tags[1]}」`);
    expect(result.sentence).not.toMatch(/ASD|ADHD|LD|DCD/);
    expect(result.sentence).not.toContain("%");
  });

  it("閾値以上のタグがちょうど1件のとき、sentence は null になる", () => {
    const scores: CategoryScores = { ...EMPTY_CATEGORY_SCORES, communication: 80 };

    const result = buildTagOverlap(scores);

    expect(result.tags).toEqual(["対人・コミュニケーション"]);
    expect(result.sentence).toBeNull();
  });

  it("閾値以上のタグが0件(全スコアが null または40未満)のとき、tags は空配列で sentence は null になる", () => {
    const allBelowThreshold: CategoryScores = {
      ...EMPTY_CATEGORY_SCORES,
      communication: 30,
      motor: 10,
    };

    expect(buildTagOverlap(EMPTY_CATEGORY_SCORES)).toEqual({ tags: [], sentence: null });
    expect(buildTagOverlap(allBelowThreshold)).toEqual({ tags: [], sentence: null });
  });

  it("TAG_PAIR_ADVICE に定義済みの組み合わせ(対人・コミュニケーション+感覚)は、その専用の助言文を使う", () => {
    const scores: CategoryScores = {
      ...EMPTY_CATEGORY_SCORES,
      communication: 100, // 対人・コミュニケーション
      sensory: 80, // 感覚
    };

    const result = buildTagOverlap(scores);

    expect(result.tags).toEqual(["対人・コミュニケーション", "感覚"]);
    expect(result.sentence).toBe(
      "「対人・コミュニケーション」と「感覚」の両方が高めに出ています。人とのやり取りに加えて、音や光などの環境面の負担も一緒に伝えると、相談先で状況が伝わりやすくなります。",
    );
  });

  it("TAG_PAIR_ADVICE に定義されていない組み合わせは、既定の助言文にフォールバックする", () => {
    const scores: CategoryScores = {
      ...EMPTY_CATEGORY_SCORES,
      communication: 100, // 対人・コミュニケーション
      "restricted-repetitive": 80, // こだわり
    };

    const result = buildTagOverlap(scores);

    expect(result.tags).toEqual(["対人・コミュニケーション", "こだわり"]);
    expect(result.sentence).toBe(
      "「対人・コミュニケーション」と「こだわり」の両方が高めに出ています。複数の場面に関わる困りごととして、相談時にまとめて伝えると整理しやすくなります。",
    );
  });
});
