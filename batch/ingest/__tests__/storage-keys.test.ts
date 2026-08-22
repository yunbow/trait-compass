import { describe, expect, it } from "vitest";

import { buildDerivedMarkdownKey, buildRawObjectKey } from "../storage-keys";

describe("buildRawObjectKey", () => {
  it("dataset/resource/format から原本の R2 キーを組み立てる", () => {
    expect(buildRawObjectKey("ds-tokyo-fukushi-shisetsu", "res-xlsx-0001", "XLSX")).toBe(
      "raw/ds-tokyo-fukushi-shisetsu/res-xlsx-0001.xlsx",
    );
  });

  it("同じ入力からは常に同じキーになる(冪等な再取込のため)", () => {
    const a = buildRawObjectKey("ds-1", "res-1", "CSV");
    const b = buildRawObjectKey("ds-1", "res-1", "CSV");
    expect(a).toBe(b);
  });
});

describe("buildDerivedMarkdownKey", () => {
  it("toMarkdown 整形結果の R2 キーを組み立てる", () => {
    expect(buildDerivedMarkdownKey("ds-tokyo-fukushi-shisetsu", "res-xlsx-0001")).toBe(
      "derived/ds-tokyo-fukushi-shisetsu/res-xlsx-0001.md",
    );
  });
});
