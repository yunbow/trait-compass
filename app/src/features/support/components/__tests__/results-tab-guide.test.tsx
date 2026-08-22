import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResultsTabGuide } from "@/features/support/components/ResultsTabGuide";
import { setGuideExplanationsEnabled } from "@/features/history/services/settings";

afterEach(() => window.localStorage.clear());

describe("ResultsTabGuide", () => {
  it("登録タブでは解説を表示する", () => {
    render(<ResultsTabGuide municipalityCode="13106" activeTab="福祉ガイド" municipalityNote={null} />);
    expect(screen.getByRole("heading", { name: "療育サービスの費用と手続き" })).toBeTruthy();
  });

  it("未登録タブでは何も描画しない", () => {
    const { container } = render(<ResultsTabGuide municipalityCode="13106" activeTab="支援制度" municipalityNote={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("設定で無効化されている場合は描画しない", () => {
    setGuideExplanationsEnabled(false);
    const { container } = render(<ResultsTabGuide municipalityCode="13106" activeTab="学校情報" municipalityNote={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("訂正・更新報告リンクに自治体コードを使う", () => {
    render(<ResultsTabGuide municipalityCode="13106" activeTab="福祉ガイド" municipalityNote={null} lifestage="preschool" />);
    const link = screen.getByRole("link", { name: "児童発達支援の費用と手続きの解説の訂正・更新を報告" });
    expect(link.getAttribute("href")).toContain("municipality=13106");
    expect(link.getAttribute("href")).toContain("lifestage=preschool");
    expect(screen.getByText(/障害児通所支援事業/)).toBeTruthy();
  });

  it("サマリー文言は「制度の説明を詳しく読む」で、出典・更新ボタンは表示しない", () => {
    render(<ResultsTabGuide municipalityCode="13106" activeTab="福祉ガイド" municipalityNote={null} lifestage="preschool" />);

    expect(screen.getByText("制度の説明を詳しく読む").closest("summary")).toBeTruthy();
    expect(screen.queryByText("制度の説明・出典を詳しく読む")).toBeNull();
    expect(screen.queryByRole("button", { name: "出典・更新" })).toBeNull();
  });

  it("出典は<details>の外に常時表示され、<details>が閉じた状態でも見える", () => {
    render(<ResultsTabGuide municipalityCode="13106" activeTab="福祉ガイド" municipalityNote={null} lifestage="preschool" />);

    const summary = screen.getByText("制度の説明を詳しく読む").closest("summary");
    const details = summary?.closest("details");
    expect(details?.hasAttribute("open")).toBe(false);

    const sourceText = screen.getByText(/障害児通所支援事業/);
    expect(sourceText.closest("details")).toBeNull();
  });
});
