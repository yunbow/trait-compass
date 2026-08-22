import { describe, expect, it } from "vitest";

import {
  PrepareRequestSchema,
  PrepareResponseSchema,
} from "@/features/prepare/schema/prepare";

describe("PrepareRequestSchema", () => {
  it("正常な入力を受理する(自由記述フィールドは存在しない)", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: ["executive-function"],
      tags: ["不注意・段取り"],
      age: "adult",
      municipality: "世田谷区",
    });
    expect(result.success).toBe(true);
  });

  it("relationship 未指定時は既定値 self にフォールバックする(TICKET-0047 AC-1)", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: [],
      age: "adult",
      municipality: "世田谷区",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relationship).toBe("self");
    }
  });

  it("relationship に self/guardian 以外の値を渡すとエラーになる(TICKET-0047 AC-2)", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: [],
      age: "adult",
      municipality: "世田谷区",
      relationship: "other",
    });
    expect(result.success).toBe(false);
  });

  it("relationship に guardian を明示指定すると受理する", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: [],
      age: "adult",
      municipality: "世田谷区",
      relationship: "guardian",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relationship).toBe("guardian");
    }
  });

  it("tags に SUPPORT_TAGS 外の値が含まれる場合はエラーになる", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: ["存在しないタグ"],
      age: "adult",
      municipality: "世田谷区",
    });
    expect(result.success).toBe(false);
  });

  it("topCategories に未知のカテゴリ key(ホワイトリスト外)が含まれる場合はエラーになる", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: ["not-a-real-category"],
      tags: [],
      age: "adult",
      municipality: "世田谷区",
    });
    expect(result.success).toBe(false);
  });

  it("age が child/adult 以外の場合はエラーになる", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: [],
      age: "senior",
      municipality: "世田谷区",
    });
    expect(result.success).toBe(false);
  });

  it("lifestage は省略可能(未指定でも受理する、既存/古いクライアントとの後方互換性)", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: [],
      age: "adult",
      municipality: "世田谷区",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lifestage).toBeUndefined();
    }
  });

  it("lifestage に LIFESTAGE_VALUES の値を指定すると受理する", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: [],
      age: "child",
      lifestage: "preschool",
      municipality: "世田谷区",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lifestage).toBe("preschool");
    }
  });

  it("lifestage に LIFESTAGE_VALUES 外の値を指定するとエラーになる", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: [],
      age: "adult",
      lifestage: "senior",
      municipality: "世田谷区",
    });
    expect(result.success).toBe(false);
  });

  it("municipality が62リスト外の場合はエラーになる", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: [],
      age: "adult",
      municipality: "存在しない市",
    });
    expect(result.success).toBe(false);
  });

  it("freeText 等の自由記述フィールドを含んでいても無視される(スキーマ上そもそも定義されていない)", () => {
    const result = PrepareRequestSchema.safeParse({
      topCategories: [],
      tags: [],
      age: "adult",
      municipality: "世田谷区",
      freeText: "自由記述を紛れ込ませてみる",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("freeText");
    }
  });
});

describe("PrepareResponseSchema", () => {
  it("正常なレスポンスを受理する", () => {
    const result = PrepareResponseSchema.safeParse({
      summary: "要約テキスト",
      checklist: ["項目1"],
      flow: ["流れ1"],
      questions: ["質問1"],
      facilities: [],
      isFallback: false,
      fallbackMessage: null,
    });
    expect(result.success).toBe(true);
  });

  it("summary が空文字列の場合はエラーになる", () => {
    const result = PrepareResponseSchema.safeParse({
      summary: "",
      checklist: ["項目1"],
      flow: ["流れ1"],
      questions: ["質問1"],
      facilities: [],
      isFallback: false,
      fallbackMessage: null,
    });
    expect(result.success).toBe(false);
  });
});
