import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentSection } from "@/components/common/ContentSection";

describe("ContentSection", () => {
  it("sectionのidがanchorId、見出しのアクセシブルネームが解決する", () => {
    render(
      <ContentSection anchorId="sample-section" title="サンプルの見出し">
        <p>本文</p>
      </ContentSection>,
    );

    const heading = screen.getByRole("heading", { level: 2, name: "サンプルの見出し" });
    expect(heading.id).toBe("sample-section-heading");

    const section = document.getElementById("sample-section");
    expect(section).not.toBeNull();
    expect(section?.getAttribute("aria-labelledby")).toBe("sample-section-heading");
    expect(section?.contains(heading)).toBe(true);
  });

  it("tone未指定(既定)ではbg-cardを含み、bg-primary/5を含まない", () => {
    render(
      <ContentSection anchorId="default-tone" title="見出し">
        <p>本文</p>
      </ContentSection>,
    );

    const section = document.getElementById("default-tone");
    expect(section?.className).toContain("bg-card");
    expect(section?.className).not.toContain("bg-primary/5");
  });

  it('tone="accent"ではbg-primary/5を含み、bg-cardを含まない', () => {
    render(
      <ContentSection anchorId="accent-tone" title="見出し" tone="accent">
        <p>本文</p>
      </ContentSection>,
    );

    const section = document.getElementById("accent-tone");
    expect(section?.className).toContain("bg-primary/5");
    expect(section?.className).not.toContain("bg-card");
  });

  it("iconの有無に関わらずh2は1つだけ描画される", () => {
    const { rerender } = render(
      <ContentSection anchorId="icon-test" title="見出し">
        <p>本文</p>
      </ContentSection>,
    );
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);

    rerender(
      <ContentSection anchorId="icon-test" title="見出し" icon={<svg aria-hidden="true" />}>
        <p>本文</p>
      </ContentSection>,
    );
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });

  it("childrenがそのまま描画される", () => {
    render(
      <ContentSection anchorId="children-test" title="見出し">
        <p>子要素の本文</p>
        <ul>
          <li>項目1</li>
        </ul>
      </ContentSection>,
    );

    expect(screen.getByText("子要素の本文")).toBeTruthy();
    expect(screen.getByText("項目1")).toBeTruthy();
  });
});
