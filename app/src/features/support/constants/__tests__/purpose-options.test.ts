import { describe, expect, it } from "vitest";

import { PURPOSE_OPTIONS_BY_LIFESTAGE, PURPOSE_OTHER_ID } from "@/features/support/constants/purpose-options";
import { LIFESTAGE_VALUES } from "@/features/support/services/lifestage-mapping";

const EXPECTED_COUNTS: Record<(typeof LIFESTAGE_VALUES)[number], number> = {
  preschool: 6,
  "elementary-junior-high": 4,
  "high-school": 4,
  "university-vocational": 3,
  "working-adult": 3,
};

describe("PURPOSE_OPTIONS_BY_LIFESTAGE", () => {
  it("5つのライフステージすべてにキーが存在する", () => {
    for (const lifestage of LIFESTAGE_VALUES) {
      expect(PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage]).toBeDefined();
    }
  });

  it("各ライフステージの目的数が仕様通りである(university-vocational/working-adult は同一配列を共有するため、共有分を1回だけ数えた合計は17件)", () => {
    for (const lifestage of LIFESTAGE_VALUES) {
      expect(PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage].length).toBe(EXPECTED_COUNTS[lifestage]);
    }
    // university-vocational と working-adult は同じ配列(同一オブジェクト参照)を共有する仕様
    // (実装コメント参照)なので、単純に5キー分を合計すると20件になり二重計上してしまう。
    // 参照の重複を除いた「投入した17目的」(preschool 6 + elementary-junior-high 4 +
    // high-school 4 + 共通の大人向け3)であることを確認する。
    const uniqueLists = new Set(LIFESTAGE_VALUES.map((lifestage) => PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage]));
    const total = [...uniqueLists].reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(17);
  });

  it("university-vocational と working-adult は同じ内容(同じid/labelの配列)である", () => {
    expect(PURPOSE_OPTIONS_BY_LIFESTAGE["university-vocational"]).toEqual(
      PURPOSE_OPTIONS_BY_LIFESTAGE["working-adult"],
    );
  });

  it("同一ライフステージ内で id が重複しない(異なるライフステージ間の再利用はOK)", () => {
    for (const lifestage of LIFESTAGE_VALUES) {
      const ids = PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage].map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("各 id/label が空文字でない", () => {
    for (const lifestage of LIFESTAGE_VALUES) {
      for (const option of PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage]) {
        expect(option.id.length).toBeGreaterThan(0);
        expect(option.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("PURPOSE_OTHER_ID はどの目的の id とも重複しない", () => {
    for (const lifestage of LIFESTAGE_VALUES) {
      const ids = PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage].map((option) => option.id);
      expect(ids).not.toContain(PURPOSE_OTHER_ID);
    }
  });
});
