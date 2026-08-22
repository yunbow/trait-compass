import { describe, expect, it } from "vitest";

import { scoreToLevel } from "@/features/result/services/score-level";

describe("scoreToLevel", () => {
  it("67以上は「高め」を返す", () => {
    expect(scoreToLevel(67)).toBe("高め");
    expect(scoreToLevel(100)).toBe("高め");
  });

  it("34以上67未満は「やや高め」を返す", () => {
    expect(scoreToLevel(34)).toBe("やや高め");
    expect(scoreToLevel(66)).toBe("やや高め");
  });

  it("34未満は「低め」を返す", () => {
    expect(scoreToLevel(33)).toBe("低め");
    expect(scoreToLevel(0)).toBe("低め");
  });
});
