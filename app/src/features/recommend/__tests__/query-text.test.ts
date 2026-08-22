import { describe, expect, it } from "vitest";

import { buildEmbeddingQueryText } from "@/features/recommend/services/query-text";

describe("buildEmbeddingQueryText", () => {
  it("タグが無い場合は自由文のみを返す", () => {
    expect(buildEmbeddingQueryText("会議の内容を覚えておくのが難しい", [])).toBe(
      "会議の内容を覚えておくのが難しい",
    );
  });

  it("タグがある場合は相談分野を付加する", () => {
    const text = buildEmbeddingQueryText("会議の内容を覚えておくのが難しい", ["不注意・段取り"]);
    expect(text).toBe("会議の内容を覚えておくのが難しい\n(相談分野: 不注意・段取り)");
  });

  it("複数タグは読点区切りで連結する", () => {
    const text = buildEmbeddingQueryText("困りごと", ["感覚", "こだわり"]);
    expect(text).toContain("感覚、こだわり");
  });
});
