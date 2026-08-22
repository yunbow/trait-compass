import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExternalTextLink } from "@/components/common/ExternalTextLink";

describe("ExternalTextLink", () => {
  it("target=_blank と rel に noopener/noreferrer を付与する", () => {
    render(<ExternalTextLink href="https://example.com">サンプル</ExternalTextLink>);

    const link = screen.getByRole("link", { name: /サンプル/ });
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("スクリーンリーダー向けに「(新しいタブで開く)」が存在する", () => {
    render(<ExternalTextLink href="https://example.com">サンプル</ExternalTextLink>);

    expect(screen.getByText("（新しいタブで開く）")).toBeTruthy();
  });

  it("アイコンは aria-hidden で装飾扱いになる", () => {
    render(<ExternalTextLink href="https://example.com">サンプル</ExternalTextLink>);

    const link = screen.getByRole("link", { name: /サンプル/ });
    const icon = link.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("classNameを渡すと最終classNameに含まれる", () => {
    render(
      <ExternalTextLink href="https://example.com" className="w-fit">
        サンプル
      </ExternalTextLink>,
    );

    const link = screen.getByRole("link", { name: /サンプル/ });
    expect(link.className.split(" ")).toContain("w-fit");
  });
});
