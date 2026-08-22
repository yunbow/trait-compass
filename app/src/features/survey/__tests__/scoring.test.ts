import { describe, expect, it } from "vitest";

import type { Question } from "@/features/survey/schema/question";
import {
  calculateCategoryScores,
  calculateGrayZoneMeta,
  calculateOverlapCounts,
  calculateTraitScores,
  getTopCategories,
  scoreSurvey,
  type SurveyAnswer,
} from "@/features/survey/services/scoring";

// テスト用の質問マスタ(本番の242問データには依存しない、手計算しやすい最小構成)。
const q = (
  id: string,
  category: Question["category"],
  traits: Question["traits"],
  grayZone = false,
): Question => ({
  id,
  text: `${id} のテスト設問文`,
  category,
  traits,
  grayZone,
});

const QUESTIONS: Question[] = [
  q("ND-0001", "communication", ["ASD", "ADHD"]), // Q1
  q("ND-0002", "communication", ["ASD"]), // Q2
  q("ND-0003", "communication", ["ADHD"]), // Q3
  q("ND-0004", "sensory", ["DCD"]), // Q4
  q("ND-0005", "learning", ["LD"]), // Q5
  q("ND-0006", "communication", ["ASD", "ADHD", "LD"]), // Q6 (3 trait)
  q("ND-0007", "motor", ["DCD", "ADHD"]), // Q7
  q("ND-0008", "sensory", ["ASD"], true), // Q8 (gray-zone)
];

const answer = (questionId: string, value: 0 | 1 | 2): SurveyAnswer => ({ questionId, value });

describe("calculateCategoryScores", () => {
  it("複数回答から sum(value) / (count * 2) * 100 を計算する(手計算: 3/4 = 75)", () => {
    const answers = [answer("ND-0001", 2), answer("ND-0002", 1)];
    const scores = calculateCategoryScores(answers, QUESTIONS);
    expect(scores.communication).toBe(75);
  });

  it("満点(value=2 のみ)を回答すると 100 になる", () => {
    const answers = [answer("ND-0001", 2), answer("ND-0002", 2), answer("ND-0003", 2)];
    const scores = calculateCategoryScores(answers, QUESTIONS);
    expect(scores.communication).toBe(100);
  });

  it("value が全て 0 の場合は 0 になる(null にはならない)", () => {
    const answers = [answer("ND-0001", 0), answer("ND-0002", 0)];
    const scores = calculateCategoryScores(answers, QUESTIONS);
    expect(scores.communication).toBe(0);
  });

  it("回答が割り切れない場合は四捨五入する(手計算: 2/6 * 100 = 33.33... → 33)", () => {
    const answers = [answer("ND-0001", 1), answer("ND-0002", 1), answer("ND-0003", 0)];
    const scores = calculateCategoryScores(answers, QUESTIONS);
    expect(scores.communication).toBe(33);
  });

  it("回答済みが0件のカテゴリは null を返す(AC-3)", () => {
    const answers = [answer("ND-0001", 2)];
    const scores = calculateCategoryScores(answers, QUESTIONS);
    expect(scores.sensory).toBeNull();
    expect(scores.motor).toBeNull();
    expect(scores.learning).toBeNull();
  });

  it("単一カテゴリのみ回答した場合、他カテゴリは null のまま維持される", () => {
    const answers = [answer("ND-0001", 2), answer("ND-0002", 1), answer("ND-0003", 1)];
    const scores = calculateCategoryScores(answers, QUESTIONS);
    expect(scores.communication).not.toBeNull();
    expect(scores.sensory).toBeNull();
    expect(scores.motor).toBeNull();
    expect(scores.learning).toBeNull();
    expect(scores["emotion-regulation"]).toBeNull();
    expect(scores["impulse-memory"]).toBeNull();
    expect(scores["executive-function"]).toBeNull();
    expect(scores["kindness-misread"]).toBeNull();
    expect(scores["restricted-repetitive"]).toBeNull();
    expect(scores["social-reading"]).toBeNull();
  });

  it("全設問未回答の場合、全カテゴリが null になる", () => {
    const scores = calculateCategoryScores([], QUESTIONS);
    for (const value of Object.values(scores)) {
      expect(value).toBeNull();
    }
  });

  it("未回答の設問は分母・分子どちらにも含めない(手計算: ND-0003 未回答なら 3/4=75 のまま)", () => {
    const answers = [answer("ND-0001", 2), answer("ND-0002", 1)];
    const scores = calculateCategoryScores(answers, QUESTIONS);
    // ND-0003(communication)を未回答のままにしても、回答済みの2問だけで計算される。
    expect(scores.communication).toBe(75);
  });
});

describe("calculateTraitScores", () => {
  it("trait 別に sum(value) / (count * 2) * 100 を計算する(手計算: ASD 3/4=75, ADHD 2/2=100)", () => {
    const answers = [answer("ND-0001", 2), answer("ND-0002", 1)];
    const scores = calculateTraitScores(answers, QUESTIONS);
    expect(scores.ASD).toBe(75);
    expect(scores.ADHD).toBe(100);
  });

  it("複数 trait を持つ設問は各 trait に同じ回答値を加算する(按分しない、AC-5)", () => {
    // ND-0006 は ASD/ADHD/LD の3 trait を持ち、value=2 が各 trait にそのまま加算される。
    const answers = [answer("ND-0006", 2)];
    const scores = calculateTraitScores(answers, QUESTIONS);
    expect(scores.ASD).toBe(100); // 2/2*100
    expect(scores.ADHD).toBe(100); // 2/2*100
    expect(scores.LD).toBe(100); // 2/2*100
    expect(scores.DCD).toBeNull(); // 該当設問が回答されていない
  });

  it("gray-zone 設問は trait を持っていても計算対象から除外される(AC-6)", () => {
    // ND-0008 は ASD trait を持つが grayZone: true。ASD スコアには反映されない。
    const answers = [answer("ND-0008", 2)];
    const scores = calculateTraitScores(answers, QUESTIONS);
    expect(scores.ASD).toBeNull();
  });

  it("該当 trait の回答済み設問が0件の場合は null になる", () => {
    const answers = [answer("ND-0004", 2)]; // DCD のみ回答
    const scores = calculateTraitScores(answers, QUESTIONS);
    expect(scores.ASD).toBeNull();
    expect(scores.ADHD).toBeNull();
    expect(scores.LD).toBeNull();
    expect(scores.DCD).toBe(100);
  });

  it("全設問未回答の場合、全 trait が null になる", () => {
    const scores = calculateTraitScores([], QUESTIONS);
    expect(scores.ASD).toBeNull();
    expect(scores.ADHD).toBeNull();
    expect(scores.LD).toBeNull();
    expect(scores.DCD).toBeNull();
  });

  it("value が全て 0 の場合は 0 になる(null にはならない)", () => {
    const answers = [answer("ND-0001", 0), answer("ND-0002", 0)];
    const scores = calculateTraitScores(answers, QUESTIONS);
    expect(scores.ASD).toBe(0);
    expect(scores.ADHD).toBe(0);
  });
});

describe("calculateGrayZoneMeta", () => {
  it("gray-zone 設問のみ回答した場合、grayZoneCount にのみ計上される", () => {
    const answers = [answer("ND-0008", 2)];
    const meta = calculateGrayZoneMeta(answers, QUESTIONS);
    expect(meta.grayZoneCount).toBe(1);
  });

  it("gray-zone 以外の設問は grayZoneCount に含めない", () => {
    const answers = [answer("ND-0001", 2), answer("ND-0008", 1)];
    const meta = calculateGrayZoneMeta(answers, QUESTIONS);
    expect(meta.grayZoneCount).toBe(1);
  });

  it("未回答の gray-zone 設問は数えない", () => {
    const meta = calculateGrayZoneMeta([], QUESTIONS);
    expect(meta.grayZoneCount).toBe(0);
  });
});

describe("calculateOverlapCounts", () => {
  it("value>=1 かつ 2 trait 以上の設問を trait 組み合わせ別に集計する(手計算)", () => {
    const answers = [
      answer("ND-0001", 2), // ASD+ADHD → "ADHD+ASD"
      answer("ND-0006", 1), // ASD+ADHD+LD → "ADHD+ASD+LD"
      answer("ND-0007", 2), // DCD+ADHD → "ADHD+DCD"
    ];
    const overlaps = calculateOverlapCounts(answers, QUESTIONS);
    expect(overlaps).toEqual({
      "ADHD+ASD": 1,
      "ADHD+ASD+LD": 1,
      "ADHD+DCD": 1,
    });
  });

  it("同じ trait 組み合わせを持つ設問は加算される", () => {
    // ND-0001 に加え、同じ ASD+ADHD の別設問がもう1問回答された場合、件数が2になることを確認する。
    const extraQuestions = [...QUESTIONS, q("ND-0009", "communication", ["ASD", "ADHD"])];
    const answers = [answer("ND-0001", 2), answer("ND-0009", 1)];
    const overlaps = calculateOverlapCounts(answers, extraQuestions);
    expect(overlaps["ADHD+ASD"]).toBe(2);
  });

  it("単一 trait の設問は重なり件数に含めない", () => {
    const answers = [answer("ND-0002", 2), answer("ND-0004", 2)]; // どちらも trait 1つのみ
    const overlaps = calculateOverlapCounts(answers, QUESTIONS);
    expect(overlaps).toEqual({});
  });

  it("回答値が0の設問は複数 trait を持っていても数えない", () => {
    const answers = [answer("ND-0001", 0)];
    const overlaps = calculateOverlapCounts(answers, QUESTIONS);
    expect(overlaps).toEqual({});
  });

  it("未回答の設問は数えない", () => {
    const overlaps = calculateOverlapCounts([], QUESTIONS);
    expect(overlaps).toEqual({});
  });
});

describe("getTopCategories", () => {
  it("スコア降順・null 除外で上位 N 件を返す", () => {
    const categoryScores = {
      communication: 80,
      "social-reading": null,
      "emotion-regulation": 40,
      "impulse-memory": 60,
      "executive-function": null,
      "kindness-misread": 10,
      sensory: 90,
      motor: null,
      learning: 20,
      "restricted-repetitive": 30,
    };
    const top = getTopCategories(categoryScores, 3);
    expect(top).toEqual([
      { category: "sensory", score: 90 },
      { category: "communication", score: 80 },
      { category: "impulse-memory", score: 60 },
    ]);
  });

  it("既定の上位件数は3件", () => {
    const categoryScores = {
      communication: 10,
      "social-reading": 20,
      "emotion-regulation": 30,
      "impulse-memory": 40,
      "executive-function": null,
      "kindness-misread": null,
      sensory: null,
      motor: null,
      learning: null,
      "restricted-repetitive": null,
    };
    expect(getTopCategories(categoryScores)).toHaveLength(3);
  });

  it("スコアが0のカテゴリは除外する", () => {
    const categoryScores = {
      communication: 0,
      "social-reading": 0,
      "emotion-regulation": null,
      "impulse-memory": 20,
      "executive-function": null,
      "kindness-misread": null,
      sensory: null,
      motor: null,
      learning: null,
      "restricted-repetitive": null,
    };
    expect(getTopCategories(categoryScores, 3)).toEqual([{ category: "impulse-memory", score: 20 }]);
  });

  it("全カテゴリが0の場合は空配列を返す", () => {
    const categoryScores = {
      communication: 0,
      "social-reading": 0,
      "emotion-regulation": null,
      "impulse-memory": null,
      "executive-function": null,
      "kindness-misread": null,
      sensory: null,
      motor: null,
      learning: null,
      "restricted-repetitive": null,
    };
    expect(getTopCategories(categoryScores)).toEqual([]);
  });
});

describe("scoreSurvey", () => {
  it("カテゴリスコア・特性スコア・gray-zone メタデータ・重なり件数をまとめて返す", () => {
    const answers = [answer("ND-0001", 2), answer("ND-0008", 1)];
    const result = scoreSurvey(answers, QUESTIONS);

    expect(result.categoryScores.communication).toBe(100);
    expect(result.traitScores.ASD).toBe(100);
    expect(result.traitScores.ADHD).toBe(100);
    expect(result.grayZoneMeta.grayZoneCount).toBe(1);
    expect(result.overlapCounts).toEqual({ "ADHD+ASD": 1 });
  });

  it("全設問未回答の場合、全てが null/0 の初期状態になる", () => {
    const result = scoreSurvey([], QUESTIONS);
    for (const value of Object.values(result.categoryScores)) {
      expect(value).toBeNull();
    }
    for (const value of Object.values(result.traitScores)) {
      expect(value).toBeNull();
    }
    expect(result.grayZoneMeta.grayZoneCount).toBe(0);
    expect(result.overlapCounts).toEqual({});
  });

  it("同一入力に対して常に同一出力を返す(純関数であること)", () => {
    const answers = [answer("ND-0001", 2), answer("ND-0006", 1)];
    const first = scoreSurvey(answers, QUESTIONS);
    const second = scoreSurvey(answers, QUESTIONS);
    expect(second).toEqual(first);
  });
});
