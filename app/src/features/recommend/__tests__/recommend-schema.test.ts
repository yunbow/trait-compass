import { describe, expect, it } from "vitest";

import { RecommendRequestSchema } from "@/features/recommend/schema/recommend";

const VALID_BODY = {
  query: "会議の内容を覚えておくのが難しい",
  age: "adult",
  municipality: "世田谷区",
};

describe("RecommendRequestSchema", () => {
  it("正常な入力を受理する(lifestage 未指定)", () => {
    const result = RecommendRequestSchema.safeParse(VALID_BODY);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lifestage).toBeUndefined();
    }
  });

  it("lifestage は省略可能(未指定でも受理する、既存/古いクライアントとの後方互換性)", () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_BODY });
    expect(result.success).toBe(true);
  });

  it("lifestage に LIFESTAGE_VALUES の値を指定すると受理する", () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_BODY, lifestage: "high-school" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lifestage).toBe("high-school");
    }
  });

  it("lifestage に LIFESTAGE_VALUES 外の値を指定するとエラーになる", () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_BODY, lifestage: "senior" });
    expect(result.success).toBe(false);
  });

  it("age が child/adult 以外の場合はエラーになる", () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_BODY, age: "senior" });
    expect(result.success).toBe(false);
  });

  it("municipality が62リスト外の場合はエラーになる", () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_BODY, municipality: "存在しない市" });
    expect(result.success).toBe(false);
  });

  it("query が空文字列の場合はエラーになる", () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_BODY, query: "" });
    expect(result.success).toBe(false);
  });
});
