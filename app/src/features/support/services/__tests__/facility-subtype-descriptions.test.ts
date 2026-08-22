import { describe, expect, it } from "vitest";

import {
  FACILITY_SUBTYPE_DESCRIPTIONS,
  getFacilitySubtypeDescription,
} from "@/features/support/services/facility-subtype-descriptions";

describe("getFacilitySubtypeDescription", () => {
  it.each(Object.entries(FACILITY_SUBTYPE_DESCRIPTIONS))(
    "%s の場合、キュレーション済みの説明文(非空文字列)を返す",
    (subtype, expected) => {
      expect(getFacilitySubtypeDescription(subtype)).toBe(expected);
      expect(getFacilitySubtypeDescription(subtype)).not.toBe("");
    },
  );

  it("未知の(対応表に無い)任意の文字列の場合は null を返す", () => {
    expect(getFacilitySubtypeDescription("架空の分類")).toBeNull();
  });

  it("null の場合は null を返す", () => {
    expect(getFacilitySubtypeDescription(null)).toBeNull();
  });
});
