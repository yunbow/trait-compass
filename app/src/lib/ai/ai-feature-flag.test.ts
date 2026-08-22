import { describe, expect, it } from "vitest";

import { isAiFeatureEnabled } from "@/lib/ai/ai-feature-flag";

describe("isAiFeatureEnabled", () => {
  it.each([
    [undefined, true],
    ["", true],
    ["true", true],
    ["false", false],
    ["FALSE", false],
    ["1", false],
    ["yes", false],
  ] as const)("%j は %s", (raw, expected) => {
    expect(isAiFeatureEnabled(raw)).toBe(expected);
  });
});
