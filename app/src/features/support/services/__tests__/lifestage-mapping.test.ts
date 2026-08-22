import { describe, expect, it } from "vitest";

import {
  LIFESTAGE_ORDINAL,
  LIFESTAGE_VALUES,
  lifestageToOrdinal,
} from "@/features/support/services/lifestage-mapping";

describe("LIFESTAGE_ORDINAL", () => {
  it("LIFESTAGE_VALUES と過不足なく同じキーを持つ(5区分)", () => {
    expect(Object.keys(LIFESTAGE_ORDINAL).sort()).toEqual([...LIFESTAGE_VALUES].sort());
  });

  it("LIFESTAGE_VALUES の並び順(未就学児=0…社会人=4)と厳密に一致する序数を持つ(migration 0016)", () => {
    expect(LIFESTAGE_ORDINAL).toEqual({
      preschool: 0,
      "elementary-junior-high": 1,
      "high-school": 2,
      "university-vocational": 3,
      "working-adult": 4,
    });
  });
});

describe("lifestageToOrdinal", () => {
  it.each(LIFESTAGE_VALUES.map((lifestage, index) => [lifestage, index] as const))(
    "%s は序数 %i を返す",
    (lifestage, expected) => {
      expect(lifestageToOrdinal(lifestage)).toBe(expected);
    },
  );
});
