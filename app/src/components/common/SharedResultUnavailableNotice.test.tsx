import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SharedResultUnavailableNotice } from "@/components/common/SharedResultUnavailableNotice";

describe("SharedResultUnavailableNotice", () => {
  it("結果に戻るリンク(/result)を表示する", () => {
    render(<SharedResultUnavailableNotice />);

    const link = screen.getByRole("link", { name: "← 結果に戻る" });
    expect(link.getAttribute("href")).toBe("/result");
  });

  it("共有された結果では利用できない旨の案内文を表示する", () => {
    render(<SharedResultUnavailableNotice />);

    expect(screen.getByText("この機能は、共有された結果の閲覧では利用できません。")).toBeTruthy();
  });
});
