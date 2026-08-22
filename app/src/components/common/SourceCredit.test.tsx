import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceCredit } from "@/components/common/SourceCredit";

describe("SourceCredit(FR-026, NFR-54)", () => {
  it("credit テキストを表示する", () => {
    render(<SourceCredit credit="出典: サンプルデータセット(サンプル団体)、CC BY 4.0" sourceUrl={null} />);

    expect(screen.getByText("出典: サンプルデータセット(サンプル団体)、CC BY 4.0", { exact: false })).toBeTruthy();
  });

  it("sourceUrl が非nullの場合、「データセットを見る」の外部リンクを表示する", () => {
    render(<SourceCredit credit="出典: サンプルデータセット" sourceUrl="https://example.com/dataset" />);

    const link = screen.getByText("データセットを見る").closest("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/dataset");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("sourceUrl が null の場合、「データセットを見る」リンクを表示しない", () => {
    render(<SourceCredit credit="出典: サンプルデータセット" sourceUrl={null} />);

    expect(screen.queryByText("データセットを見る")).toBeNull();
  });
});
