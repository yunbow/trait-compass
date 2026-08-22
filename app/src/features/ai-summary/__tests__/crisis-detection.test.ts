import { describe, expect, it } from "vitest";

import { containsCrisisSignal } from "@/features/ai-summary/services/crisis-detection";

describe("containsCrisisSignal", () => {
  it.each(["死にたいと思うことがある", "自傷してしまう", "消えたい気持ちが強い", "リストカットが止められない"])(
    "危機介入キーワードを含む入力を検知する: %s",
    (text) => {
      expect(containsCrisisSignal(text)).toBe(true);
    },
  );

  // TICKET-0024(eval/safety.eval.ts, eval/fixtures/crisis-cases.json)で見逃しが判明し、
  // 辞書に追加した表現バリエーション(NFR-74: 見逃しゼロの回帰防止)。
  it.each([
    "死んでしまいたいと感じる",
    "死んだ方がマシだと思う",
    "飛び降りたい衝動がある",
    "電車に飛び込みたいと考えてしまう",
    "首を吊りたいと思うことがある",
    "手首を切ってしまう",
    "オーバードーズしてしまいそう",
    "自分を傷つけたくなる",
  ])("拡張後の危機介入キーワードを含む入力を検知する: %s", (text) => {
    expect(containsCrisisSignal(text)).toBe(true);
  });

  it("危機介入キーワードを含まない通常の困りごとは検知しない", () => {
    expect(containsCrisisSignal("会議の内容を覚えておくのが難しい")).toBe(false);
  });

  it("空文字列は検知しない", () => {
    expect(containsCrisisSignal("")).toBe(false);
  });
});
