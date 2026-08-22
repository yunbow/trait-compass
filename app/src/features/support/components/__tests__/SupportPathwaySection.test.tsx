import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SupportPathwaySection } from "@/features/support/components/SupportPathwaySection";
import type { SupportPathwayData } from "@/features/support/services/support-pathway";

function makePathwayData(overrides: Partial<SupportPathwayData> = {}): SupportPathwayData {
  return {
    id: "pathway-1",
    municipality: "台東区",
    lifestage: "preschool",
    purposeId: "child-development-support",
    purposeLabel: "児童発達支援・療育を利用したい",
    status: "confirmed",
    steps: [
      { order: 1, title: "窓口に電話で相談する", actor: "台東区子ども家庭支援センター", contact: "03-1234-5678", isConditional: false, note: "受付は平日9時〜17時です" },
      { order: 2, title: "面談を予約する", actor: "発達支援センター", contact: null, isConditional: true, note: "混雑時は数週間待つ場合があります" },
    ],
    sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
    ...overrides,
  };
}

describe("SupportPathwaySection: ステップ表示", () => {
  it("各ステップの title・actor・note がすべて document 内に表示される", () => {
    render(<SupportPathwaySection data={makePathwayData()} />);

    expect(screen.getByText("窓口に電話で相談する")).toBeTruthy();
    expect(screen.getByText("台東区子ども家庭支援センター")).toBeTruthy();
    expect(screen.getByText("受付は平日9時〜17時です")).toBeTruthy();

    expect(screen.getByText("面談を予約する")).toBeTruthy();
    expect(screen.getByText("発達支援センター")).toBeTruthy();
    expect(screen.getByText("混雑時は数週間待つ場合があります")).toBeTruthy();
  });

  it("contact がある場合、tel: リンクとしてレンダリングされる", () => {
    render(<SupportPathwaySection data={makePathwayData()} />);

    const contactLink = screen.getByText("03-1234-5678").closest("a");
    expect(contactLink).toBeTruthy();
    expect(contactLink?.getAttribute("href")).toMatch(/^tel:/);
  });

  it("contact が無いステップには tel: リンクが無い", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          steps: [{ order: 1, title: "窓口で相談する", actor: null, contact: null, isConditional: false, note: null }],
        })}
      />,
    );

    expect(screen.queryByRole("link", { name: /tel:/ })).toBeNull();
    const links = screen.queryAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("tel:"));
    expect(links).toHaveLength(0);
  });

  it("isConditional: true のステップには「必要に応じて」相当の表示がある", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          steps: [{ order: 1, title: "追加の書類を提出する", actor: null, contact: null, isConditional: true, note: null }],
        })}
      />,
    );

    expect(screen.getByText("必要に応じて")).toBeTruthy();
  });

  it("isConditional: false のステップには「必要に応じて」相当の表示が無い", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          steps: [{ order: 1, title: "窓口に電話で相談する", actor: null, contact: null, isConditional: false, note: null }],
        })}
      />,
    );

    expect(screen.queryByText("必要に応じて")).toBeNull();
  });
});

describe("SupportPathwaySection: 用語解説", () => {
  it("ステップの note に「受給者証」を含む場合、常時見える用語のポイントに説明が表示される", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          steps: [{ order: 1, title: "申請する", actor: null, contact: null, isConditional: false, note: "受給者証の交付を受けます" }],
        })}
      />,
    );

    expect(screen.getByText("手続きの用語のポイント")).toBeTruthy();
    expect(screen.getByText(/児童発達支援・放課後等デイサービス等の利用に必要な証明書/)).toBeTruthy();
  });

  it("用語が登場しないステップには用語のポイントが表示されない", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          steps: [{ order: 1, title: "窓口に電話で相談する", actor: null, contact: null, isConditional: false, note: "受付は平日9時〜17時です" }],
        })}
      />,
    );

    expect(screen.queryByText("手続きの用語のポイント")).toBeNull();
  });

  it("用語のポイントは右上の閉じるボタンで隠せる", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          steps: [{ order: 1, title: "申請する", actor: null, contact: null, isConditional: false, note: "受給者証の交付を受けます" }],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "手続きの用語のポイントを閉じる" }));

    expect(screen.queryByText("手続きの用語のポイント")).toBeNull();
  });
});

describe("SupportPathwaySection: status に応じた未確認情報の注記", () => {
  it('status="unconfirmed" の場合、未確認情報である旨の注記を表示する', () => {
    render(<SupportPathwaySection data={makePathwayData({ status: "unconfirmed" })} />);

    expect(screen.getByText(/一部未確認の情報を含みます/)).toBeTruthy();
  });

  it('status="phone_required" の場合、未確認情報である旨の注記を表示する', () => {
    render(<SupportPathwaySection data={makePathwayData({ status: "phone_required" })} />);

    expect(screen.getByText(/一部未確認の情報を含みます/)).toBeTruthy();
  });

  it('status="confirmed" の場合、未確認情報である旨の注記を表示しない', () => {
    render(<SupportPathwaySection data={makePathwayData({ status: "confirmed" })} />);

    expect(screen.queryByText(/一部未確認の情報を含みます/)).toBeNull();
  });
});

describe("SupportPathwaySection: 出典表示(展開操作なしで常時表示)", () => {
  it("出典・更新ボタンは表示せず、出典一覧を展開操作なしで初期レンダリング時から全件表示する", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: "出典・更新" })).toBeNull();
    expect(screen.getByRole("link", { name: "台東区公式サイト" })).toBeTruthy();
  });

  it("url がある出典は label をリンクテキストとしたリンクとして表示され、confirmedOn も表示される", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
        })}
      />,
    );

    const sourceLink = screen.getByRole("link", { name: "台東区公式サイト" });
    expect(sourceLink.getAttribute("href")).toBe("https://example.taito.tokyo.jp");
    expect(screen.getByText(/2026-07-01/)).toBeTruthy();
  });

  it("url が無い出典はリンクにならずテキストのみで label と confirmedOn が表示される", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          sources: [{ label: "窓口への電話確認", confirmedOn: "2026-06-15" }],
        })}
      />,
    );

    // label(source.label) と confirmedOn はどちらもラップ要素を持たない兄弟テキストノードとして
    // 同じ <li> 内に描画されるため(url 無し時は plain text)、exact 一致だと <li> の直下テキストが
    // 連結された文字列("窓口への電話確認（確認日: 2026-06-15）")になり単独の label とは一致しない。
    // そのため exact: false(部分一致)で検証する。
    expect(screen.queryByRole("link", { name: "窓口への電話確認" })).toBeNull();
    expect(screen.getByText("窓口への電話確認", { exact: false })).toBeTruthy();
    expect(screen.getByText(/2026-06-15/)).toBeTruthy();
  });

  it("sources が複数ある場合、それぞれの label・confirmedOn が表示される", () => {
    render(
      <SupportPathwaySection
        data={makePathwayData({
          sources: [
            { label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" },
            { label: "窓口への電話確認", confirmedOn: "2026-06-15" },
          ],
        })}
      />,
    );

    expect(screen.getByText("台東区公式サイト")).toBeTruthy();
    expect(screen.getByText(/2026-07-01/)).toBeTruthy();
    // url 無しの2件目は label・confirmedOn が同じ <li> 内の兄弟テキストノードになるため exact: false で検証する。
    expect(screen.getByText("窓口への電話確認", { exact: false })).toBeTruthy();
    expect(screen.getByText(/2026-06-15/)).toBeTruthy();
  });
});

describe("SupportPathwaySection: 掲載情報の訂正・更新報告リンク", () => {
  it("専用ページ(/support/content-report)へのリンクとして表示する(P0対応: 検索条件を back クエリへ埋め込まない)", () => {
    render(<SupportPathwaySection data={makePathwayData({ id: "pathway-1", purposeLabel: "児童発達支援・療育を利用したい" })} />);

    const link = screen.getByRole("link", { name: "想定ルート（児童発達支援・療育を利用したい）の掲載情報の訂正・更新を報告" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toBe(`/support/content-report?targetType=pathway&targetId=${encodeURIComponent("pathway-1")}`);
    expect(href).not.toContain("back=");
  });
});
