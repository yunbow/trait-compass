import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnchorNav } from "@/components/common/AnchorNav";

const ITEMS = [
  { href: "#first", label: "最初の項目" },
  { href: "#second", label: "2番目の項目" },
  { href: "#third", label: "3番目の項目" },
] as const;

describe("AnchorNav", () => {
  it("aria-labelでnavとして引ける", () => {
    render(<AnchorNav label="サンプルの目次" items={ITEMS} />);

    expect(screen.getByRole("navigation", { name: "サンプルの目次" })).toBeTruthy();
  });

  it("渡した順にリンクが並ぶ", () => {
    render(<AnchorNav label="サンプルの目次" items={ITEMS} />);

    const nav = screen.getByRole("navigation", { name: "サンプルの目次" });
    const links = nav.querySelectorAll("a");
    expect(Array.from(links).map((link) => link.textContent)).toEqual([
      "最初の項目",
      "2番目の項目",
      "3番目の項目",
    ]);
  });

  it("各リンクのhrefが一致する", () => {
    render(<AnchorNav label="サンプルの目次" items={ITEMS} />);

    for (const item of ITEMS) {
      expect(screen.getByRole("link", { name: item.label }).getAttribute("href")).toBe(item.href);
    }
  });
});
