import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NextActionsHub } from "@/features/result/components/NextActionsHub";

describe("NextActionsHub", () => {
  it("相談先検索を主導線にし、相談準備への実リンクをまとめて表示する", () => {
    render(<NextActionsHub supportHref="/support?tags=%E6%84%9F%E8%A6%9A" supportTags={["感覚"]} />);

    expect(screen.getByRole("heading", { name: "次にできること" })).toBeTruthy();
    expect(screen.getByText("感覚")).toBeTruthy();
    expect(screen.getByRole("button", { name: "地域の相談先を探す" }).getAttribute("href")).toBe("/support?tags=%E6%84%9F%E8%A6%9A");
    expect(screen.getByRole("button", { name: "相談時に渡すメモを作る" }).getAttribute("href")).toBe("/result/prepare");

    // 旧・別導線(AIで困りごとを要約する→/result/summarize)は単一導線への統合により消えている。
    expect(screen.queryByRole("button", { name: "AIで困りごとを要約する" })).toBeNull();
    expect(screen.queryByText("AIで困りごとを要約する")).toBeNull();
  });

  it("途中回答の場合は、回答を続ける導線を追加する", () => {
    render(<NextActionsHub isPartial />);

    expect(screen.getByRole("button", { name: "回答を続ける" }).getAttribute("href")).toBe("/survey");
  });

  it("相談分野タグは上位3件のみ表示し、残りは「+N件」でまとめて変更可能な旨を示す(P0対応)", () => {
    render(
      <NextActionsHub
        supportTags={["対人・コミュニケーション", "こころ・感情", "不注意・段取り", "感覚", "学習・からだ", "こだわり"]}
      />,
    );

    expect(screen.getByText("対人・コミュニケーション")).toBeTruthy();
    expect(screen.getByText("こころ・感情")).toBeTruthy();
    expect(screen.getByText("不注意・段取り")).toBeTruthy();
    expect(screen.queryByText("感覚")).toBeNull();
    expect(screen.queryByText("学習・からだ")).toBeNull();
    expect(screen.queryByText("こだわり")).toBeNull();
    expect(screen.getByText("+3件")).toBeTruthy();
    expect(screen.getByText("相談分野は次の画面で変更できます。")).toBeTruthy();
  });
});
