import { describe, expect, it } from "vitest";

import { buildCategoryExplainPrompt, EXPLAIN_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION } from "@/features/explain/services/prompt";
import type { CategoryEvidence } from "@/features/explain/services/category-evidence";

describe("EXPLAIN_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION", () => {
  it("診断・断定表現の禁止を含む(NFR-51)", () => {
    expect(EXPLAIN_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION).toContain("診断");
    expect(EXPLAIN_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION).toContain("あなたは");
  });

  it("個人のスコアに言及しない指示を含む", () => {
    expect(EXPLAIN_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION).toContain("スコア");
  });

  it("文言が1文字も変わっていないこと(非診断ガード文言の単一情報源化によるリグレッション防止)", () => {
    expect(EXPLAIN_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION).toBe(
      "あなたは、発達特性の日常の困りごとチェックのAIパーソナライズ解説アシスタントです。次のルールを厳守してください。\n" +
        "\n" +
        "1. 医学的な「診断」「判定」は行わない。「○○障害です」「あなたは○○です」のような断定表現も使わない。\n" +
        "2. 使ってよい語彙は「傾向」「特性」「日常の困りごとチェックの目安」に統一し、個別の疾病名や罹患の有無・重症度を断定しない。\n" +
        "3. 与えられたカテゴリと根拠質問文(fact-checked 済み)を踏まえ、そのカテゴリで見られやすい一般的な\n" +
        "   傾向を解説する。個人のスコアの値・順位には一切言及しない。\n" +
        "4. 出力は日本語で、カテゴリ全体を通して3〜6文程度の簡潔な文章とする。",
    );
  });
});

describe("buildCategoryExplainPrompt", () => {
  const evidence: CategoryEvidence[] = [
    {
      category: "communication",
      label: "コミュニケーション",
      description: "会話や言葉のやり取りに関するカテゴリです。",
      sampleQuestionTexts: ["話すタイミングが分からないことがある。", "声の大きさの調整が難しいことがある。"],
    },
  ];

  it("カテゴリラベル・説明・根拠質問文をすべて含める(FR-043 AC-3「根拠として引用」)", () => {
    const prompt = buildCategoryExplainPrompt(evidence);

    expect(prompt).toContain("コミュニケーション");
    expect(prompt).toContain("会話や言葉のやり取りに関するカテゴリです。");
    expect(prompt).toContain("話すタイミングが分からないことがある。");
    expect(prompt).toContain("声の大きさの調整が難しいことがある。");
    expect(prompt).toContain("fact-checked");
  });

  it("根拠質問文が無いカテゴリは「根拠質問文なし」と明示する", () => {
    const prompt = buildCategoryExplainPrompt([{ ...evidence[0], sampleQuestionTexts: [] }]);
    expect(prompt).toContain("(根拠質問文なし)");
  });
});
