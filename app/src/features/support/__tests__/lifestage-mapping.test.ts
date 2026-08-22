import { describe, expect, it } from "vitest";

import {
  LIFESTAGE_OPTIONS,
  LIFESTAGE_VALUES,
  mapLifestageToAgeGroup,
} from "@/features/support/services/lifestage-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";

describe("LIFESTAGE_OPTIONS", () => {
  it("5区分(未就学児/小学生・中学生/高校生/大学生・専門学校生/社会人)を定義する(TICKET-0044 AC-1)", () => {
    expect(LIFESTAGE_OPTIONS.map((option) => option.label)).toEqual([
      "未就学児",
      "小学生・中学生",
      "高校生",
      "大学生・専門学校生",
      "社会人",
    ]);
  });

  it("LIFESTAGE_VALUES と過不足なく対応する", () => {
    expect(LIFESTAGE_OPTIONS.map((option) => option.value).sort()).toEqual([...LIFESTAGE_VALUES].sort());
  });
});

describe("mapLifestageToAgeGroup", () => {
  it("未就学児〜高校生は child、大学生・専門学校生・社会人は adult へマッピングする(AC-2)", () => {
    expect(mapLifestageToAgeGroup("preschool")).toBe("child");
    expect(mapLifestageToAgeGroup("elementary-junior-high")).toBe("child");
    expect(mapLifestageToAgeGroup("high-school")).toBe("child");
    expect(mapLifestageToAgeGroup("university-vocational")).toBe("adult");
    expect(mapLifestageToAgeGroup("working-adult")).toBe("adult");
  });

  describe.each(LIFESTAGE_VALUES)("網羅性: %s", (lifestage: Lifestage) => {
    it("child/adult のいずれかにマッピングされる(AC-2, AC-3)", () => {
      expect(["child", "adult"]).toContain(mapLifestageToAgeGroup(lifestage));
    });
  });
});
