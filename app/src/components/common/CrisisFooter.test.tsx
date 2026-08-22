import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CrisisFooter } from "@/components/common/CrisisFooter";

describe("CrisisFooter(TICKET-0041)", () => {
  it("こころの健康相談統一ダイヤルへの静的リンクを表示する(AC-2)", () => {
    render(<CrisisFooter />);

    const link = screen.getByText("こころの健康相談統一ダイヤル").closest("a");
    expect(link?.getAttribute("href")).toBe(
      "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/jisatsu/kokoro_dial.html",
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("よりそいホットラインへの静的リンクを表示する(AC-2)", () => {
    render(<CrisisFooter />);

    const link = screen.getByText("よりそいホットライン").closest("a");
    expect(link?.getAttribute("href")).toBe("https://www.since2011.net/yorisoi/");
  });

  it("footer 要素として描画される(AC-1)", () => {
    const { container } = render(<CrisisFooter />);

    expect(container.querySelector("footer")).toBeTruthy();
  });
});
