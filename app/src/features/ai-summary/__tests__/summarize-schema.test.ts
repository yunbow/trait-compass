import { describe, expect, it } from "vitest";

import {
  FREE_TEXT_MAX_LENGTH,
  SummarizeRequestSchema,
  SummarizeResponseSchema,
  TOP_CATEGORIES_MAX_LENGTH,
} from "@/features/ai-summary/schema/summarize";

describe("SummarizeRequestSchema", () => {
  it("正常な入力を受理する", () => {
    const result = SummarizeRequestSchema.safeParse({
      freeText: "会議の内容を覚えておくのが難しい",
      topCategories: ["executive-function", "impulse-memory"],
    });
    expect(result.success).toBe(true);
  });

  it("freeText が空文字列の場合はエラーになる", () => {
    const result = SummarizeRequestSchema.safeParse({ freeText: "", topCategories: [] });
    expect(result.success).toBe(false);
  });

  it(`freeText が ${FREE_TEXT_MAX_LENGTH} 文字を超える場合はエラーになる`, () => {
    const result = SummarizeRequestSchema.safeParse({
      freeText: "あ".repeat(FREE_TEXT_MAX_LENGTH + 1),
      topCategories: [],
    });
    expect(result.success).toBe(false);
  });

  it(`freeText が ${FREE_TEXT_MAX_LENGTH} 文字ちょうどの場合は受理する`, () => {
    const result = SummarizeRequestSchema.safeParse({
      freeText: "あ".repeat(FREE_TEXT_MAX_LENGTH),
      topCategories: [],
    });
    expect(result.success).toBe(true);
  });

  it("topCategories に未知のカテゴリ key(ホワイトリスト外)が含まれる場合はエラーになる", () => {
    const result = SummarizeRequestSchema.safeParse({
      freeText: "困りごと",
      topCategories: ["not-a-real-category"],
    });
    expect(result.success).toBe(false);
  });

  it(`topCategories が ${TOP_CATEGORIES_MAX_LENGTH} 件を超える場合はエラーになる`, () => {
    const result = SummarizeRequestSchema.safeParse({
      freeText: "困りごと",
      topCategories: ["communication", "social-reading", "emotion-regulation", "impulse-memory"],
    });
    expect(result.success).toBe(false);
  });
});

describe("SummarizeResponseSchema", () => {
  it("正常なレスポンスを受理する", () => {
    const result = SummarizeResponseSchema.safeParse({ summary: "要約テキスト", isCrisisResponse: false });
    expect(result.success).toBe(true);
  });

  it("summary が空文字列の場合はエラーになる", () => {
    const result = SummarizeResponseSchema.safeParse({ summary: "", isCrisisResponse: false });
    expect(result.success).toBe(false);
  });
});
