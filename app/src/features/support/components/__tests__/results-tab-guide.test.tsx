import { fireEvent, render, screen } from "@testing-library/react";
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

  it("詳しい説明を開くと、訂正・更新報告リンクに自治体コードを使う", () => {
    render(<ResultsTabGuide municipalityCode="13106" activeTab="福祉ガイド" municipalityNote={null} lifestage="preschool" />);
    fireEvent.click(screen.getByText("詳しい説明・出典を開く"));
    const link = screen.getByRole("link", { name: "児童発達支援の費用と手続きの解説の訂正・更新を報告" });
    expect(link.getAttribute("href")).toContain("municipality=13106");
    expect(link.getAttribute("href")).toContain("lifestage=preschool");
    expect(screen.getByText(/障害児通所支援事業/)).toBeTruthy();
  });

  it("サマリー文言は「詳しい説明・出典を開く」で、閉じている間は出典と訂正・更新を表示しない", () => {
    render(<ResultsTabGuide municipalityCode="13106" activeTab="福祉ガイド" municipalityNote={null} lifestage="preschool" />);

    const summary = screen.getByText("詳しい説明・出典を開く").closest("summary");
    expect(summary).toBeTruthy();
    const details = summary?.closest("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(screen.getByText(/障害児通所支援事業/).closest("details")).toBe(details);
    expect(screen.getByRole("link", { name: "児童発達支援の費用と手続きの解説の訂正・更新を報告" }).closest("details")).toBe(details);
  });

  it("出典と訂正・更新は<details>内にあり、開いたときに確認できる", () => {
    render(<ResultsTabGuide municipalityCode="13106" activeTab="福祉ガイド" municipalityNote={null} lifestage="preschool" />);

    const summary = screen.getByText("詳しい説明・出典を開く").closest("summary");
    const details = summary?.closest("details");
    expect(details?.hasAttribute("open")).toBe(false);

    fireEvent.click(summary!);
    expect(details?.hasAttribute("open")).toBe(true);
    const sourceText = screen.getByText(/障害児通所支援事業/);
    expect(sourceText.closest("details")).toBe(details);
    expect(screen.getByRole("link", { name: "児童発達支援の費用と手続きの解説の訂正・更新を報告" }).closest("details")).toBe(details);
  });
});
