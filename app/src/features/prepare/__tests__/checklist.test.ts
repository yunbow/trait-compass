import { describe, expect, it } from "vitest";

import { buildPrepareChecklist, buildPrepareFlow, buildPrepareQuestions } from "@/features/prepare/services/checklist";
import { containsBannedWord } from "@/lib/copy/banned-words";

describe("buildPrepareChecklist", () => {
  it("タグ未選択でも基本項目を返す", () => {
    const checklist = buildPrepareChecklist([]);
    expect(checklist.length).toBeGreaterThan(0);
  });

  it("選択したタグに応じた追加項目を含む", () => {
    const checklist = buildPrepareChecklist(["感覚"]);
    expect(checklist.some((item) => item.includes("感覚"))).toBe(true);
  });

  it("同じタグを複数回渡しても重複しない", () => {
    const once = buildPrepareChecklist(["感覚"]);
    const twice = buildPrepareChecklist(["感覚", "感覚"]);
    expect(twice).toEqual(once);
  });

  it("すべてのタグの組み合わせで禁止語(NFR-51)を含まない", () => {
    const checklist = buildPrepareChecklist(["対人・コミュニケーション", "こころ・感情", "不注意・段取り", "感覚", "学習・からだ", "こだわり"]);
    for (const item of checklist) {
      expect(containsBannedWord(item)).toBe(false);
    }
  });
});

describe("buildPrepareFlow", () => {
  it("空でない配列を返す", () => {
    expect(buildPrepareFlow().length).toBeGreaterThan(0);
  });

  it("禁止語(NFR-51)を含まない", () => {
    for (const item of buildPrepareFlow()) {
      expect(containsBannedWord(item)).toBe(false);
    }
  });
});

describe("buildPrepareQuestions", () => {
  it("タグ未選択でも基本項目を返す", () => {
    expect(buildPrepareQuestions([]).length).toBeGreaterThan(0);
  });

  it("選択したタグに応じた追加項目を含む", () => {
    const questions = buildPrepareQuestions(["こだわり"]);
    expect(questions.some((item) => item.includes("切り替え"))).toBe(true);
  });

  it("すべてのタグの組み合わせで禁止語(NFR-51)を含まない", () => {
    const questions = buildPrepareQuestions(["対人・コミュニケーション", "こころ・感情", "不注意・段取り", "感覚", "学習・からだ", "こだわり"]);
    for (const item of questions) {
      expect(containsBannedWord(item)).toBe(false);
    }
  });
});
