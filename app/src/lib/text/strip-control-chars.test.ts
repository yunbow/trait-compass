import { describe, expect, it } from "vitest";

import { stripControlChars } from "@/lib/text/strip-control-chars";

describe("stripControlChars", () => {
  it("制御文字(改行・タブを除く)を除去する", () => {
    expect(stripControlChars("a\x00b\x08c\x0Bd\x0Ce\x0Ef\x1Fg\x7Fh")).toBe("abcdefgh");
  });

  it("通常文字・改行・タブはそのまま保持する", () => {
    const value = "施設の説明文です。\n改行あり\tタブあり。全角文字も含む: 東京都渋谷区";
    expect(stripControlChars(value)).toBe(value);
  });
});
