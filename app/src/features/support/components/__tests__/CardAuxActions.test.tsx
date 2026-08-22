import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuxActionButton, AuxActionLink, AuxActionPanel, SourceList } from "@/features/support/components/CardAuxActions";

/**
 * card-aux-actions-footer(docs/ui-consolidation/card-aux-actions-footer.md)。
 * FacilityCard/SchoolCard/SupportPathwaySection/ResultsTabGuide の4ファイルに重複していた
 * 補助操作フッター(出典・更新トグル/訂正・更新リンク/展開パネル/出典一覧)を切り出す
 * CardAuxActions.tsx の RED(未実装)テスト。実装前のため import 解決・コンパイルエラーで
 * 失敗する状態を想定している。
 */

// 各コンポーネント共通の className(4ファイルで完全一致していたもの)。
// 共通化の主目的の一つがこの className の集約であるため、退行検知のために文字列一致で検証する。
const SHARED_TRIGGER_CLASSNAME =
  "flex h-9 items-center justify-center gap-1 rounded-md bg-muted/50 px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

describe("AuxActionButton", () => {
  it("children をボタンのラベルとして表示する", () => {
    render(
      <AuxActionButton expanded={false} controlsId="panel-1" onClick={vi.fn()} icon={<span data-testid="icon" />}>
        出典・更新
      </AuxActionButton>,
    );

    expect(screen.getByRole("button", { name: "出典・更新" })).toBeTruthy();
  });

  it("icon をボタン内に表示する", () => {
    render(
      <AuxActionButton expanded={false} controlsId="panel-1" onClick={vi.fn()} icon={<span data-testid="icon" />}>
        出典・更新
      </AuxActionButton>,
    );

    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("expanded=false のとき aria-expanded=\"false\" を持つ", () => {
    render(
      <AuxActionButton expanded={false} controlsId="panel-1" onClick={vi.fn()} icon={<span />}>
        出典・更新
      </AuxActionButton>,
    );

    expect(screen.getByRole("button", { name: "出典・更新" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("expanded=true のとき aria-expanded=\"true\" を持つ", () => {
    render(
      <AuxActionButton expanded={true} controlsId="panel-1" onClick={vi.fn()} icon={<span />}>
        出典・更新
      </AuxActionButton>,
    );

    expect(screen.getByRole("button", { name: "出典・更新" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("controlsId を aria-controls に反映する", () => {
    render(
      <AuxActionButton expanded={false} controlsId="facility-source-fac-001" onClick={vi.fn()} icon={<span />}>
        出典・更新
      </AuxActionButton>,
    );

    expect(screen.getByRole("button", { name: "出典・更新" }).getAttribute("aria-controls")).toBe("facility-source-fac-001");
  });

  it("クリックで onClick を呼び出す", () => {
    const onClick = vi.fn();
    render(
      <AuxActionButton expanded={false} controlsId="panel-1" onClick={onClick} icon={<span />}>
        質問する
      </AuxActionButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "質問する" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("4ファイルで共通していたトリガーの className をそのまま持つ(退行防止)", () => {
    render(
      <AuxActionButton expanded={false} controlsId="panel-1" onClick={vi.fn()} icon={<span />}>
        出典・更新
      </AuxActionButton>,
    );

    expect(screen.getByRole("button", { name: "出典・更新" }).className).toBe(SHARED_TRIGGER_CLASSNAME);
  });

  it("type=\"button\" を持つ(フォーム内で誤送信しない)", () => {
    render(
      <AuxActionButton expanded={false} controlsId="panel-1" onClick={vi.fn()} icon={<span />}>
        出典・更新
      </AuxActionButton>,
    );

    expect(screen.getByRole("button", { name: "出典・更新" }).getAttribute("type")).toBe("button");
  });
});

describe("AuxActionLink", () => {
  it("href へのリンクとして表示する", () => {
    render(
      <AuxActionLink href="/support/facility-report?facilityId=fac-001" ariaLabel="ダミー相談窓口の掲載情報の訂正・更新を報告" icon={<span />}>
        訂正・更新
      </AuxActionLink>,
    );

    const link = screen.getByRole("link", { name: "ダミー相談窓口の掲載情報の訂正・更新を報告" });
    expect(link.getAttribute("href")).toBe("/support/facility-report?facilityId=fac-001");
  });

  it("ariaLabel を aria-label としてアクセシブルネームに使う(表示テキストは children のまま)", () => {
    render(
      <AuxActionLink href="/support/content-report?targetType=school&targetId=school-1" ariaLabel="上野小学校の掲載情報の訂正・更新を報告" icon={<span />}>
        訂正・更新
      </AuxActionLink>,
    );

    expect(screen.getByRole("link", { name: "上野小学校の掲載情報の訂正・更新を報告" }).textContent).toContain("訂正・更新");
  });

  it("icon を children とともに表示する", () => {
    render(
      <AuxActionLink href="/support/facility-report?facilityId=fac-001" ariaLabel="訂正・更新を報告" icon={<span data-testid="icon" />}>
        訂正・更新
      </AuxActionLink>,
    );

    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("4ファイルで共通していたトリガーの className をそのまま持つ(退行防止)", () => {
    render(
      <AuxActionLink href="/support/facility-report?facilityId=fac-001" ariaLabel="訂正・更新を報告" icon={<span />}>
        訂正・更新
      </AuxActionLink>,
    );

    expect(screen.getByRole("link", { name: "訂正・更新を報告" }).className).toBe(SHARED_TRIGGER_CLASSNAME);
  });
});

describe("AuxActionPanel", () => {
  it("見出しを省略した場合は既定値「出典・更新情報」を表示する", () => {
    render(
      <AuxActionPanel id="facility-source-fac-001">
        <p>パネル本文</p>
      </AuxActionPanel>,
    );

    expect(screen.getByText("出典・更新情報")).toBeTruthy();
  });

  it("heading を渡した場合はその文言を見出しとして表示する(質問パネル等)", () => {
    render(
      <AuxActionPanel id="facility-question-fac-001" heading="この窓口について質問する">
        <p>パネル本文</p>
      </AuxActionPanel>,
    );

    expect(screen.getByText("この窓口について質問する")).toBeTruthy();
    expect(screen.queryByText("出典・更新情報")).toBeNull();
  });

  it("id をコンテナ要素の id として設定する(aria-controls との対応に使う)", () => {
    render(
      <AuxActionPanel id="facility-source-fac-001">
        <p>パネル本文</p>
      </AuxActionPanel>,
    );

    expect(document.getElementById("facility-source-fac-001")).toBeTruthy();
  });

  it("children を本文として表示する(AskAiPanel 等、任意のコンテンツを埋め込める)", () => {
    render(
      <AuxActionPanel id="facility-question-fac-001">
        <div data-testid="panel-child">埋め込みコンテンツ</div>
      </AuxActionPanel>,
    );

    expect(screen.getByTestId("panel-child")).toBeTruthy();
    expect(screen.getByText("埋め込みコンテンツ")).toBeTruthy();
  });

  it("共通の展開パネル外装(mt-3 rounded-lg bg-muted/50 p-3)を持つ(退行防止)", () => {
    render(
      <AuxActionPanel id="facility-source-fac-001">
        <p>パネル本文</p>
      </AuxActionPanel>,
    );

    const panel = document.getElementById("facility-source-fac-001");
    expect(panel?.className).toContain("mt-3");
    expect(panel?.className).toContain("rounded-lg");
    expect(panel?.className).toContain("bg-muted/50");
    expect(panel?.className).toContain("p-3");
  });
});

describe("SourceList", () => {
  it("url がある出典は label をリンクテキストとしたリンクとして表示する", () => {
    render(
      <SourceList
        sources={[{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }]}
      />,
    );

    const link = screen.getByRole("link", { name: "台東区公式サイト" });
    expect(link.getAttribute("href")).toBe("https://example.taito.tokyo.jp");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("url が無い(undefined)出典はリンクにならずテキストのみで表示する", () => {
    render(<SourceList sources={[{ label: "窓口への電話確認", confirmedOn: "2026-06-15" }]} />);

    expect(screen.queryByRole("link", { name: "窓口への電話確認" })).toBeNull();
    expect(screen.getByText("窓口への電話確認", { exact: false })).toBeTruthy();
  });

  it("url が null の出典もリンクにならずテキストのみで表示する(SourceRef の url は optional だが呼び出し元は null を渡しうる)", () => {
    render(<SourceList sources={[{ label: "教育委員会資料", url: null, confirmedOn: "2026-06-01" }]} />);

    expect(screen.queryByRole("link", { name: "教育委員会資料" })).toBeNull();
    expect(screen.getByText("教育委員会資料", { exact: false })).toBeTruthy();
  });

  it("confirmedOn を出典ごとに表示する", () => {
    render(
      <SourceList
        sources={[{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }]}
      />,
    );

    expect(screen.getByText(/2026-07-01/)).toBeTruthy();
  });

  it("sources が複数ある場合、それぞれの label・confirmedOn を表示する", () => {
    render(
      <SourceList
        sources={[
          { label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" },
          { label: "窓口への電話確認", confirmedOn: "2026-06-15" },
        ]}
      />,
    );

    expect(screen.getByText("台東区公式サイト")).toBeTruthy();
    expect(screen.getByText(/2026-07-01/)).toBeTruthy();
    expect(screen.getByText("窓口への電話確認", { exact: false })).toBeTruthy();
    expect(screen.getByText(/2026-06-15/)).toBeTruthy();
  });

  it("sources が空配列の場合、出典の項目を一つも表示しない", () => {
    const { container } = render(<SourceList sources={[]} />);

    expect(container.querySelectorAll("li").length).toBe(0);
  });

  it("各項目に「出典: 」の接頭辞を付ける(自治体の二次利用許諾条件対応、SupportPathwaySection等で展開操作なしの常時表示になったため出典であることを明示する)", () => {
    render(
      <SourceList
        sources={[{ label: "教育相談 - 中央区", url: "https://example.chuo.tokyo.jp", confirmedOn: "2026-08-09" }]}
      />,
    );

    expect(screen.getByText(/^出典:/)).toBeTruthy();
  });
});
