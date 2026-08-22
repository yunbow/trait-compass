import { describe, expect, it } from "vitest";

import {
  buildInstitutionAnswerPrompt,
  INSTITUTION_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
} from "@/features/ask-ai/services/institution-prompt";
import type { InstitutionKnowledgeRow } from "@/features/ask-ai/services/knowledge";

const EVIDENCE: InstitutionKnowledgeRow[] = [
  {
    name: "テスト制度",
    description: "テスト制度の説明文です。",
    datasetTitle: "テストデータセット",
    sourceOrg: "テスト組織",
    license: "cc-by-4.0",
    sourceUrl: "https://example.com/dataset",
  },
];

describe("buildInstitutionAnswerPrompt", () => {
  it("質問文と根拠データ(説明文)の両方をプロンプトに含める", () => {
    const prompt = buildInstitutionAnswerPrompt("利用するにはどうしたらいいですか", EVIDENCE);

    expect(prompt).toContain("利用するにはどうしたらいいですか");
    expect(prompt).toContain("テスト制度");
    expect(prompt).toContain("テスト制度の説明文です。");
  });

  it("根拠データが複数ある場合はすべて含める", () => {
    const prompt = buildInstitutionAnswerPrompt("質問", [
      ...EVIDENCE,
      { ...EVIDENCE[0], name: "別の制度", description: "別の制度の説明。" },
    ]);
    expect(prompt).toContain("テスト制度");
    expect(prompt).toContain("別の制度");
  });
});

describe("INSTITUTION_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION", () => {
  it("断定表現の禁止・傾向/特性への統一・根拠データの範囲内での回答を明記する(FR-044, NFR-51, AC-3)", () => {
    expect(INSTITUTION_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION).toContain("診断");
    expect(INSTITUTION_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION).toContain("傾向");
    expect(INSTITUTION_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION).toContain("根拠データ");
  });

  it("文言が1文字も変わっていないこと(非診断ガード文言の単一情報源化によるリグレッション防止)", () => {
    expect(INSTITUTION_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION).toBe(
      "あなたは、発達特性に関する制度・手続きについて案内するアシスタントです。次のルールを厳守してください。\n" +
        "\n" +
        "1. 医学的な「診断」「判定」は行わない。「○○障害です」「あなたは○○です」のような断定表現も使わない。\n" +
        "2. 使ってよい語彙は「傾向」「特性」「日常の困りごとチェックの目安」に統一し、個別の疾病名や罹患の有無・重症度を断定しない。\n" +
        "3. 回答は必ず与えられた根拠データ(データセットの説明文)の範囲内で書く。根拠データに無い制度名・\n" +
        "   金額・手続き方法・連絡先を新たに作り出したり、一般論として断定したりしない。\n" +
        "4. 根拠データだけでは質問に十分答えられない場合は、その旨を伝えたうえで一般的な相談窓口への\n" +
        "   相談を促す(架空の情報で埋めない)。\n" +
        "5. 出力は日本語で、2〜4文程度の簡潔な文章とする。",
    );
  });
});
