import { describe, expect, it } from "vitest";

import { buildCategoryEvidence } from "@/features/explain/services/category-evidence";
import type { Question } from "@/features/survey/schema/question";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "ND-0001",
    text: "ダミー質問文",
    category: "communication",
    traits: ["ASD"],
    grayZone: false,
    ...overrides,
  };
}

describe("buildCategoryEvidence", () => {
  it("カテゴリごとにラベル・説明・根拠質問文(掲載順、既定3件)を組み立てる", () => {
    const questions = [
      makeQuestion({ id: "ND-0001", text: "質問1", category: "communication" }),
      makeQuestion({ id: "ND-0002", text: "質問2", category: "communication" }),
      makeQuestion({ id: "ND-0003", text: "質問3", category: "communication" }),
      makeQuestion({ id: "ND-0004", text: "質問4", category: "communication" }),
      makeQuestion({ id: "ND-0005", text: "質問5", category: "sensory" }),
    ];

    const evidence = buildCategoryEvidence(["communication"], questions);

    expect(evidence).toHaveLength(1);
    expect(evidence[0].category).toBe("communication");
    expect(evidence[0].label.length).toBeGreaterThan(0);
    expect(evidence[0].description.length).toBeGreaterThan(0);
    expect(evidence[0].sampleQuestionTexts).toEqual(["質問1", "質問2", "質問3"]);
  });

  it("sampleSize を指定するとその件数まで抜粋する", () => {
    const questions = [
      makeQuestion({ id: "ND-0001", text: "質問1", category: "sensory" }),
      makeQuestion({ id: "ND-0002", text: "質問2", category: "sensory" }),
    ];

    const evidence = buildCategoryEvidence(["sensory"], questions, 1);

    expect(evidence[0].sampleQuestionTexts).toEqual(["質問1"]);
  });

  it("該当カテゴリの質問が無い場合は空配列を返す(例外にしない)", () => {
    const evidence = buildCategoryEvidence(["motor"], []);
    expect(evidence[0].sampleQuestionTexts).toEqual([]);
  });

  it("複数カテゴリを渡した場合は入力順に組み立てる", () => {
    const questions = [
      makeQuestion({ id: "ND-0001", text: "コミュ質問", category: "communication" }),
      makeQuestion({ id: "ND-0002", text: "感覚質問", category: "sensory" }),
    ];

    const evidence = buildCategoryEvidence(["sensory", "communication"], questions);

    expect(evidence.map((e) => e.category)).toEqual(["sensory", "communication"]);
  });
});
