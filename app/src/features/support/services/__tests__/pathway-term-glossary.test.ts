import { describe, expect, it } from "vitest";

import { BANNED_WORDS } from "@/lib/copy/banned-words";
import { PATHWAY_TERM_GLOSSARY, findPathwayTerms } from "@/features/support/services/pathway-term-glossary";
import type { SupportPathwayStepData } from "@/features/support/services/support-pathway";

function makeStep(overrides: Partial<SupportPathwayStepData> = {}): SupportPathwayStepData {
  return {
    order: 1,
    title: "窓口に電話で相談する",
    actor: null,
    contact: null,
    isConditional: false,
    note: null,
    ...overrides,
  };
}

describe("findPathwayTerms", () => {
  it("title に用語を含むステップがあれば検出される", () => {
    const steps = [makeStep({ order: 1, title: "特別支援教室の利用を相談する" })];

    const matches = findPathwayTerms(steps);

    expect(matches).toEqual([{ order: 1, term: "特別支援教室", description: PATHWAY_TERM_GLOSSARY["特別支援教室"] }]);
  });

  it("note に用語を含むステップがあれば検出される", () => {
    const steps = [makeStep({ order: 1, title: "申請する", note: "受給者証の交付を受けます" })];

    const matches = findPathwayTerms(steps);

    expect(matches).toEqual([{ order: 1, term: "受給者証", description: PATHWAY_TERM_GLOSSARY["受給者証"] }]);
  });

  it("同じ用語が複数ステップに出現する場合、初出のステップのみ返す", () => {
    const steps = [
      makeStep({ order: 1, title: "受給者証の申請をする" }),
      makeStep({ order: 2, title: "面談を受ける", note: "受給者証がまだ無くても相談は可能です" }),
    ];

    const matches = findPathwayTerms(steps);

    expect(matches).toHaveLength(1);
    expect(matches[0].order).toBe(1);
  });

  it("登録されていない用語は検出されない", () => {
    const steps = [makeStep({ order: 1, title: "窓口に電話で相談する", note: "受付は平日9時〜17時です" })];

    const matches = findPathwayTerms(steps);

    expect(matches).toEqual([]);
  });

  it("ステップが空配列の場合、空配列を返す", () => {
    expect(findPathwayTerms([])).toEqual([]);
  });

  describe("禁止語スキャン", () => {
    it.each(Object.entries(PATHWAY_TERM_GLOSSARY))("「%s」の説明文に禁止語(診断/判定/あなたは/罹患/重症度)を含まない", (_term, description) => {
      for (const word of BANNED_WORDS) {
        expect(description).not.toContain(word);
      }
    });
  });
});
