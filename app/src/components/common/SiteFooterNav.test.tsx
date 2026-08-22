import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooterNav } from "@/components/common/SiteFooterNav";

/**
 * `SiteFooterNav` は `app/layout.tsx` から全画面で描画されるため、ここでの
 * 表示確認がそのまま「全画面で到達できる」ことの担保になる(旧・page.test.tsx から移設)。
 */
describe("SiteFooterNav", () => {
  it("常に「設定」への導線が /settings へのリンクとして表示される(TICKET-0027 AC-4)", () => {
    render(<SiteFooterNav />);

    const settingsLink = screen.getByText("設定").closest("a");
    expect(settingsLink?.getAttribute("href")).toBe("/settings");
  });

  it("プロジェクトの外部リンクを新しいタブで開く", () => {
    render(<SiteFooterNav />);

    const siteName = screen.getByRole("link", { name: "Trait Compass" });
    expect(siteName.getAttribute("href")).toBe("/");

    const github = screen.getByRole("link", { name: /ソースコード/ });
    expect(github.getAttribute("href")).toBe("https://github.com/yunbow/trait-compass");
    expect(github.getAttribute("target")).toBe("_blank");
    expect(github.getAttribute("rel")).toContain("noopener");

    const official = screen.getByRole("link", { name: /プロジェクト公式/ });
    expect(official.getAttribute("href")).toBe("https://yunbow.github.io/civic-unknot/");
    expect(official.getAttribute("target")).toBe("_blank");

    const tokyo = screen.getByRole("link", { name: /東京都知事杯オープンデータ・ハッカソン/ });
    expect(tokyo.getAttribute("href")).toBe("https://odhackathon.metro.tokyo.lg.jp/");
    expect(tokyo.getAttribute("target")).toBe("_blank");
  });

  it("このプロジェクトについて・プライバシーポリシー・利用規約への導線を表示する", () => {
    render(<SiteFooterNav />);

    expect(screen.getByText("このプロジェクトについて").closest("a")?.getAttribute("href")).toBe("/about");
    expect(screen.getByText("プライバシーポリシー").closest("a")?.getAttribute("href")).toBe("/privacy");
    expect(screen.getByText("利用規約").closest("a")?.getAttribute("href")).toBe("/terms");
  });

  it("使い方・用語の説明への導線を表示する", () => {
    render(<SiteFooterNav />);

    expect(screen.getByText("使い方").closest("a")?.getAttribute("href")).toBe("/help");
    expect(screen.getByText("用語の説明").closest("a")?.getAttribute("href")).toBe("/guide");
  });

  it("非公式サービスである旨・自治体等の免責を role=note の常時表示として明記する(自治体の二次利用許諾条件対応)", () => {
    render(<SiteFooterNav />);

    const note = screen.getByRole("note");
    expect(note.textContent).toContain("有志プロジェクト CivicUnknot が開発・運営する非公式のサービス");
    expect(note.textContent).toContain("国や自治体（都道府県・区市町村）等が提供する公式サービス・公式アプリではありません");
    expect(note.textContent).toContain("掲載情報の提供元である自治体等が責任を負うものではありません");
  });
});
