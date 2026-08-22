import { describe, expect, it } from "vitest";

import {
  meanMunicipalityHitRateAtK,
  meanPrecisionAtK,
  meanRecallAtK,
  meanRecallAtKCapped,
  meanReciprocalRank,
  municipalityHitRateAtK,
  precisionAtK,
  recallAtK,
  recallAtKCapped,
  reciprocalRank,
} from "./metrics";
import type { RetrievalCase, TieredRetrievalCase } from "./metrics";

describe("precisionAtK", () => {
  it("上位K件すべてが正解なら1", () => {
    expect(precisionAtK(["a", "b"], new Set(["a", "b", "c"]), 2)).toBe(1);
  });

  it("上位K件の一部のみ正解なら按分される", () => {
    expect(precisionAtK(["a", "x", "b"], new Set(["a", "b"]), 3)).toBeCloseTo(2 / 3);
  });

  it("検索結果がK件未満の場合は実際の件数で按分する(0埋めしない)", () => {
    expect(precisionAtK(["a"], new Set(["a"]), 5)).toBe(1);
  });

  it("検索結果が空なら0", () => {
    expect(precisionAtK([], new Set(["a"]), 5)).toBe(0);
  });

  it("正解が1件も含まれなければ0", () => {
    expect(precisionAtK(["x", "y"], new Set(["a"]), 2)).toBe(0);
  });
});

describe("recallAtK", () => {
  it("正解集合の全件が上位K件に含まれれば1", () => {
    expect(recallAtK(["a", "b", "c"], new Set(["a", "b"]), 3)).toBe(1);
  });

  it("正解集合の一部のみ上位K件に含まれれば按分される", () => {
    expect(recallAtK(["a", "x", "y"], new Set(["a", "b"]), 3)).toBeCloseTo(0.5);
  });

  it("K件より後ろにしか無い正解はカウントされない", () => {
    expect(recallAtK(["x", "y", "a"], new Set(["a"]), 2)).toBe(0);
  });

  it("正解集合が空なら1(見逃しようがないため)", () => {
    expect(recallAtK(["a", "b"], new Set(), 2)).toBe(1);
  });
});

describe("reciprocalRank", () => {
  it("1位に正解があれば1", () => {
    expect(reciprocalRank(["a", "b"], new Set(["a"]))).toBe(1);
  });

  it("3位に初めて正解があれば1/3", () => {
    expect(reciprocalRank(["x", "y", "a"], new Set(["a"]))).toBeCloseTo(1 / 3);
  });

  it("正解が1件も含まれなければ0", () => {
    expect(reciprocalRank(["x", "y"], new Set(["a"]))).toBe(0);
  });
});

describe("mean* 集計関数", () => {
  const cases: RetrievalCase[] = [
    { rankedIds: ["a", "b"], relevantIds: new Set(["a"]) }, // precision@2=0.5, recall@2=1, RR=1
    { rankedIds: ["x", "a"], relevantIds: new Set(["a"]) }, // precision@2=0.5, recall@2=1, RR=1/2
  ];

  it("meanPrecisionAtKはケースごとのPrecision@Kの平均", () => {
    expect(meanPrecisionAtK(cases, 2)).toBeCloseTo(0.5);
  });

  it("meanRecallAtKはケースごとのRecall@Kの平均", () => {
    expect(meanRecallAtK(cases, 2)).toBeCloseTo(1);
  });

  it("meanReciprocalRankはケースごとのRRの平均(MRR)", () => {
    expect(meanReciprocalRank(cases)).toBeCloseTo((1 + 0.5) / 2);
  });

  it("ケースが0件なら全て0", () => {
    expect(meanPrecisionAtK([], 5)).toBe(0);
    expect(meanRecallAtK([], 5)).toBe(0);
    expect(meanReciprocalRank([])).toBe(0);
  });
});

describe("recallAtKCapped", () => {
  it("正解集合がK以下の場合は既存recallAtKと同じ値になる", () => {
    const rankedIds = ["x", "a", "y", "b"];
    const relevantIds = new Set(["a", "b"]);
    expect(recallAtKCapped(rankedIds, relevantIds, 4)).toBe(recallAtK(rankedIds, relevantIds, 4));
    expect(recallAtKCapped(rankedIds, relevantIds, 4)).toBe(1);
  });

  it("正解集合の一部のみ上位K件に含まれる場合も既存recallAtKと同じ値になる(正解集合がK以下)", () => {
    const rankedIds = ["a", "x", "y"];
    const relevantIds = new Set(["a", "b"]);
    expect(recallAtKCapped(rankedIds, relevantIds, 3)).toBe(recallAtK(rankedIds, relevantIds, 3));
    expect(recallAtKCapped(rankedIds, relevantIds, 3)).toBeCloseTo(0.5);
  });

  it("正解集合がKを超える場合、分母がKに正規化される(既存recallAtKとは異なる値になる)", () => {
    // 正解50件のうち上位10件(K=10)に5件ヒット。
    const relevantIds = new Set(Array.from({ length: 50 }, (_, i) => `r${i}`));
    const rankedIds = ["r0", "r1", "r2", "r3", "r4", "x0", "x1", "x2", "x3", "x4"];
    // 既存recallAtKは分母50のため 5/50=0.1
    expect(recallAtK(rankedIds, relevantIds, 10)).toBeCloseTo(5 / 50);
    // recallAtKCappedは分母min(50,10)=10のため 5/10=0.5
    expect(recallAtKCapped(rankedIds, relevantIds, 10)).toBeCloseTo(0.5);
  });

  it("正解集合が空なら1(見逃しようがないため)", () => {
    expect(recallAtKCapped(["a", "b"], new Set(), 2)).toBe(1);
  });
});

describe("meanRecallAtKCapped", () => {
  it("ケースごとのrecallAtKCappedの平均を返す", () => {
    const cases: RetrievalCase[] = [
      { rankedIds: ["a", "b"], relevantIds: new Set(["a"]) }, // capped recall@2 = 1
      {
        rankedIds: ["r0", "x"],
        relevantIds: new Set(Array.from({ length: 10 }, (_, i) => `r${i}`)),
      }, // 正解10件・K=2・ヒット1件 → capped recall@2 = 1/2
    ];
    expect(meanRecallAtKCapped(cases, 2)).toBeCloseTo((1 + 0.5) / 2);
  });

  it("ケースが0件なら0", () => {
    expect(meanRecallAtKCapped([], 5)).toBe(0);
  });
});

describe("municipalityHitRateAtK", () => {
  it("上位K件にrequiredIdsが1件でも含まれれば1", () => {
    expect(municipalityHitRateAtK(["x", "a", "y"], new Set(["a", "b"]), 3)).toBe(1);
  });

  it("上位K件にrequiredIdsが1件も含まれなければ0", () => {
    expect(municipalityHitRateAtK(["x", "y", "z"], new Set(["a", "b"]), 3)).toBe(0);
  });

  it("K件より後ろにしかrequiredIdsが無い場合は0(取りこぼしとして検知する)", () => {
    expect(municipalityHitRateAtK(["x", "y", "a"], new Set(["a"]), 2)).toBe(0);
  });

  it("requiredIdsが空なら1(取りこぼしようがないため)", () => {
    expect(municipalityHitRateAtK(["x", "y"], new Set(), 2)).toBe(1);
  });
});

describe("meanMunicipalityHitRateAtK", () => {
  it("ケースごとのmunicipalityHitRateAtKの平均(ヒットしたケースの割合)を返す", () => {
    const cases: TieredRetrievalCase[] = [
      { rankedIds: ["a", "x"], requiredIds: new Set(["a"]), acceptableIds: new Set() }, // hit
      { rankedIds: ["x", "y"], requiredIds: new Set(["a"]), acceptableIds: new Set() }, // miss
    ];
    expect(meanMunicipalityHitRateAtK(cases, 2)).toBeCloseTo(0.5);
  });

  it("ケースが0件なら0", () => {
    expect(meanMunicipalityHitRateAtK([], 5)).toBe(0);
  });
});
