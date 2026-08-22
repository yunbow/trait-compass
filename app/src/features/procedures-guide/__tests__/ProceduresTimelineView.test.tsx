import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProceduresTimelineView } from "@/features/procedures-guide/components/ProceduresTimelineView";
import { PROCEDURES_TIMELINE_STAGES } from "@/features/procedures-guide/constants/procedures-timeline";
import { BANNED_WORDS } from "@/lib/copy/banned-words";

describe("ProceduresTimelineView", () => {
  it("すべての段階見出しと手続き項目名を表示する(AC-1, AC-2)", () => {
    render(<ProceduresTimelineView />);

    for (const stage of PROCEDURES_TIMELINE_STAGES) {
      expect(screen.getByText(stage.label)).toBeTruthy();
      for (const procedure of stage.procedures) {
        expect(screen.getByText(procedure.name)).toBeTruthy();
      }
    }
  });

  it("非診断の免責表示を含む", () => {
    render(<ProceduresTimelineView />);
    expect(
      screen.getByText("これは医学的な診断ではありません。傾向を知るための、日常の困りごとチェックの目安です。"),
    ).toBeTruthy();
  });

  it("具体的な期日を示せない旨と自治体窓口への確認誘導を常設表示する", () => {
    render(<ProceduresTimelineView />);
    expect(screen.getByText(/詳しくは各自治体の窓口でご確認ください/)).toBeTruthy();
  });

  it("自治体の窓口をさがす内部リンク(/support)を表示する(AC-3)", () => {
    render(<ProceduresTimelineView />);
    const link = screen.getByRole("link", { name: "相談窓口をさがす" });
    expect(link.getAttribute("href")).toBe("/support");
  });

  it("外部参考リンク(発達障害情報・支援センター、東京都オープンデータカタログ)を表示する(AC-3)", () => {
    render(<ProceduresTimelineView />);
    expect(screen.getByRole("link", { name: /発達障害情報・支援センター/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /東京都オープンデータカタログ/ })).toBeTruthy();
  });

  it("画面全体のテキストに非診断表現の禁止語(診断/判定等)が含まれない(AC-5)", () => {
    const { container } = render(<ProceduresTimelineView />);
    const text = container.textContent ?? "";

    for (const word of BANNED_WORDS) {
      // DisclaimerNotice の正文(「診断ではありません」等)のみ許容する既存の
      // 否定文脈の例外(copy-guidelines.md §1)は、本テストでは画面全体に対する粗いチェックの
      // ため、"診断" 自体は免責文中に含まれ得る。ここでは「判定」「あなたは」「罹患」「重症度」の
      // ような、免責文に含まれない禁止語のみを厳密にチェックする。
      if (word === "診断") continue;
      expect(text.includes(word)).toBe(false);
    }
  });
});
