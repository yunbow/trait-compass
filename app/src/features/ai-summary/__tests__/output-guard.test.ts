import { describe, expect, it } from "vitest";

import { violatesOutputGuard, OUTPUT_GUARD_FALLBACK_TEXT } from "@/features/ai-summary/services/output-guard";

describe("violatesOutputGuard", () => {
  it.each([
    "これはASD診断の結果です。",
    "セルフチェックの判定結果をお知らせします。",
    "あなたはADHDです。",
    "あなたは発達障害です。",
  ])("禁止語・断定表現を含む応答を検知する: %s", (text) => {
    expect(violatesOutputGuard(text)).toBe(true);
  });

  it("非診断語彙のみの応答は許可する", () => {
    const safeText = "会議内容の記憶が難しいという傾向がうかがえます。メモを併用するなどの対処が考えられます。";
    expect(violatesOutputGuard(safeText)).toBe(false);
  });

  it("フォールバック定型文自体は禁止語を含まない", () => {
    expect(violatesOutputGuard(OUTPUT_GUARD_FALLBACK_TEXT)).toBe(false);
  });
});
