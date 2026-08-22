import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExternalReferenceLink } from "@/features/procedures-guide/components/ExternalReferenceLink";

describe("ExternalReferenceLink", () => {
  it("url がある場合は外部リンクとして表示する", () => {
    render(<ExternalReferenceLink label="発達障害情報・支援センター" url="https://www.rehab.go.jp/ddis/" />);

    const link = screen.getByRole("link", { name: "発達障害情報・支援センター" });
    expect(link.getAttribute("href")).toBe("https://www.rehab.go.jp/ddis/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("url が null の場合はリンク化せず表示崩れしないフォールバック表示にする(AC-3)", () => {
    render(<ExternalReferenceLink label="発達障害情報・支援センター" url={null} />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/発達障害情報・支援センター/)).toBeTruthy();
  });
});
