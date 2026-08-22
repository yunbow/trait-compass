import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// SmartBackLink(クライアントコンポーネント)が useRouter() を呼ぶため、
// ReportPageShell のテストと同じ方針で next/navigation をモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import { InfoPageShell } from "@/components/common/InfoPageShell";

describe("InfoPageShell", () => {
  it("mainにid=main-contentとtabIndex=-1を付与する", () => {
    render(
      <InfoPageShell backHref="/" eyebrow="TEST" title="タイトル" lead="リード文">
        <p>本文</p>
      </InfoPageShell>,
    );

    const main = screen.getByRole("main");
    expect(main.id).toBe("main-content");
    expect(main.getAttribute("tabindex")).toBe("-1");
  });

  it("戻るリンクが「前の画面に戻る」でhrefがbackHrefになる", () => {
    render(
      <InfoPageShell backHref="/settings" eyebrow="TEST" title="タイトル" lead="リード文">
        <p>本文</p>
      </InfoPageShell>,
    );

    const link = screen.getByRole("link", { name: /前の画面に戻る/ });
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("h1がgetByRoleで引ける", () => {
    render(
      <InfoPageShell backHref="/" eyebrow="TEST" title="タイトル" lead="リード文">
        <p>本文</p>
      </InfoPageShell>,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("タイトル");
  });

  it("heroExtraがheader内(h1の後)に描画される", () => {
    render(
      <InfoPageShell
        backHref="/"
        eyebrow="TEST"
        title="タイトル"
        lead="リード文"
        heroExtra={<p data-testid="hero-extra">追加要素</p>}
      >
        <p>本文</p>
      </InfoPageShell>,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    const heroExtra = screen.getByTestId("hero-extra");
    expect(heading.closest("header")?.contains(heroExtra)).toBe(true);
    // h1 より後ろに描画されている(DOM順)
    const position = heading.compareDocumentPosition(heroExtra);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("classNameを渡すと最終classNameに含まれ、twMergeで既定値が上書きされる", () => {
    render(
      <InfoPageShell backHref="/" eyebrow="TEST" title="タイトル" lead="リード文" className="max-w-3xl gap-8">
        <p>本文</p>
      </InfoPageShell>,
    );

    const main = screen.getByRole("main");
    const classes = main.className.split(" ");
    expect(classes).toContain("max-w-3xl");
    expect(classes).toContain("gap-8");
    expect(classes).not.toContain("max-w-2xl");
    expect(classes).not.toContain("gap-6");
  });
});
