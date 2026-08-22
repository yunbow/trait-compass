import { describe, expect, it } from "vitest";

import { AskRequestSchema, AskResponseSchema } from "@/features/ask-ai/schema/ask";
import { FACILITY_PRESET_QUESTIONS, INSTITUTION_PRESET_QUESTIONS } from "@/features/ask-ai/services/preset-questions";

describe("AskRequestSchema", () => {
  it("targetType='facility' + 有効な questionId + facilityId を受理する", () => {
    const result = AskRequestSchema.safeParse({
      targetType: "facility",
      questionId: FACILITY_PRESET_QUESTIONS[0].id,
      facilityId: "fac-1",
    });
    expect(result.success).toBe(true);
  });

  it("targetType='facility' で facilityId が無い場合はエラーになる", () => {
    const result = AskRequestSchema.safeParse({
      targetType: "facility",
      questionId: FACILITY_PRESET_QUESTIONS[0].id,
    });
    expect(result.success).toBe(false);
  });

  it("targetType='facility' で questionId が制度向けの id の場合はエラーになる(ホワイトリストの分離)", () => {
    const result = AskRequestSchema.safeParse({
      targetType: "facility",
      questionId: INSTITUTION_PRESET_QUESTIONS[0].id,
      facilityId: "fac-1",
    });
    expect(result.success).toBe(false);
  });

  it("targetType='institution' + 有効な questionId を受理する(facilityId 不要)", () => {
    const result = AskRequestSchema.safeParse({
      targetType: "institution",
      questionId: INSTITUTION_PRESET_QUESTIONS[0].id,
    });
    expect(result.success).toBe(true);
  });

  it("questionId が自由文字列(定型質問マスタ外)の場合はエラーになる(AC-2)", () => {
    const result = AskRequestSchema.safeParse({
      targetType: "institution",
      questionId: "自由に入力された質問文",
    });
    expect(result.success).toBe(false);
  });

  it("targetType が未知の値の場合はエラーになる", () => {
    const result = AskRequestSchema.safeParse({ targetType: "other", questionId: "x" });
    expect(result.success).toBe(false);
  });
});

describe("AskResponseSchema", () => {
  it("正常なレスポンスを受理する", () => {
    const result = AskResponseSchema.safeParse({
      answer: "回答テキスト",
      sources: [{ credit: "出典: テスト", sourceUrl: null }],
      isFallback: false,
      fallbackMessage: null,
    });
    expect(result.success).toBe(true);
  });

  it("isFallback=true かつ sources が空配列でも受理する(根拠データ不足時のグレースフルフォールバック)", () => {
    const result = AskResponseSchema.safeParse({
      answer: "根拠データがありません。",
      sources: [],
      isFallback: true,
      fallbackMessage: "根拠データがありません。",
    });
    expect(result.success).toBe(true);
  });

  it("answer が空文字列の場合はエラーになる", () => {
    const result = AskResponseSchema.safeParse({
      answer: "",
      sources: [],
      isFallback: false,
      fallbackMessage: null,
    });
    expect(result.success).toBe(false);
  });
});
