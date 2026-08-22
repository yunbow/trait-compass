import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// SmartBackLink(クライアントコンポーネント)が useRouter() を呼ぶため、
// facility-report/content-report のページテストと同じ方針で next/navigation をモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import { ReportPageShell } from "@/components/common/report-form/ReportPageShell";

describe("ReportPageShell", () => {
  it("h1が固定文言で表示される", () => {
    render(
      <ReportPageShell backHref="/support" targetHeading="対象名" targetContext="補足">
        <div>フォーム本体</div>
      </ReportPageShell>,
    );

    expect(screen.getByRole("heading", { name: "掲載情報の訂正・更新を報告", level: 1 })).toBeTruthy();
  });

  it("対象カードの見出しと補足が描画される", () => {
    render(
      <ReportPageShell backHref="/support" targetHeading="世田谷区 発達障がい相談支援センター" targetContext="世田谷区 ／ 相談窓口">
        <div>フォーム本体</div>
      </ReportPageShell>,
    );

    expect(screen.getByRole("heading", { name: "世田谷区 発達障がい相談支援センター", level: 2 })).toBeTruthy();
    expect(screen.getByText("世田谷区 ／ 相談窓口")).toBeTruthy();
  });

  it("aria-labelledbyがh2のidと一致する", () => {
    render(
      <ReportPageShell backHref="/support" targetHeading="対象名" targetContext="補足">
        <div>フォーム本体</div>
      </ReportPageShell>,
    );

    const heading = screen.getByRole("heading", { name: "対象名", level: 2 });
    const section = heading.closest("section");
    expect(section?.getAttribute("aria-labelledby")).toBe(heading.id);
  });

  it("戻るリンクのhrefがbackHrefと一致する", () => {
    render(
      <ReportPageShell backHref="/support/results?age=child" targetHeading="対象名" targetContext="補足">
        <div>フォーム本体</div>
      </ReportPageShell>,
    );

    const backLink = screen.getByRole("link", { name: "← 検索結果に戻る" });
    expect(backLink.getAttribute("href")).toBe("/support/results?age=child");
  });

  it("targetLabelを省略した場合、既定文言「報告する掲載情報」が表示される", () => {
    render(
      <ReportPageShell backHref="/support" targetHeading="対象名" targetContext="補足">
        <div>フォーム本体</div>
      </ReportPageShell>,
    );

    expect(screen.getByText("報告する掲載情報")).toBeTruthy();
  });

  it("heading/targetLabelを指定した場合、既定文言の代わりにその文言が表示される(/support/ask で使う)", () => {
    render(
      <ReportPageShell
        backHref="/support"
        heading="掲載情報についてAIに質問する"
        targetLabel="質問する掲載情報"
        targetHeading="対象名"
        targetContext="補足"
      >
        <div>フォーム本体</div>
      </ReportPageShell>,
    );

    expect(screen.getByRole("heading", { name: "掲載情報についてAIに質問する", level: 1 })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "掲載情報の訂正・更新を報告", level: 1 })).toBeNull();
    expect(screen.getByText("質問する掲載情報")).toBeTruthy();
    expect(screen.queryByText("報告する掲載情報")).toBeNull();
  });

  it("子要素(フォーム本体)を描画する", () => {
    render(
      <ReportPageShell backHref="/support" targetHeading="対象名" targetContext="補足">
        <div>フォーム本体</div>
      </ReportPageShell>,
    );

    expect(screen.getByText("フォーム本体")).toBeTruthy();
  });
});
