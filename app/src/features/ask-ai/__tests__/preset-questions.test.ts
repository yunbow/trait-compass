import { describe, expect, it } from "vitest";

import {
  ALL_PRESET_QUESTIONS,
  FACILITY_PRESET_QUESTIONS,
  findPresetQuestion,
  INSTITUTION_PRESET_QUESTIONS,
} from "@/features/ask-ai/services/preset-questions";
import { containsCrisisSignal } from "@/features/ai-summary/services/crisis-detection";
import { containsBannedWord } from "@/lib/copy/banned-words";

describe("preset-questions", () => {
  it("FACILITY_PRESET_QUESTIONS はすべて targetType='facility' である", () => {
    for (const question of FACILITY_PRESET_QUESTIONS) {
      expect(question.targetType).toBe("facility");
    }
  });

  it("INSTITUTION_PRESET_QUESTIONS はすべて targetType='institution' である", () => {
    for (const question of INSTITUTION_PRESET_QUESTIONS) {
      expect(question.targetType).toBe("institution");
    }
  });

  it("id はすべて一意である(重複が無い)", () => {
    const ids = ALL_PRESET_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("すべての質問文が禁止語(NFR-51)を含まない", () => {
    for (const question of ALL_PRESET_QUESTIONS) {
      expect(containsBannedWord(question.label)).toBe(false);
    }
  });

  it("findPresetQuestion は既知の id を解決する", () => {
    const question = findPresetQuestion(FACILITY_PRESET_QUESTIONS[0].id);
    expect(question).toEqual(FACILITY_PRESET_QUESTIONS[0]);
  });

  it("findPresetQuestion は未知の id に対して undefined を返す", () => {
    expect(findPresetQuestion("not-a-real-id")).toBeUndefined();
  });

  it("すべての質問文が危機介入キーワード検知(crisis-detection.ts)を誘発しない(簡易な許可リスト方式の前提)", () => {
    for (const question of ALL_PRESET_QUESTIONS) {
      expect(containsCrisisSignal(question.label)).toBe(false);
    }
  });
});
