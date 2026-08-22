import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LatestInfoNotice } from "@/features/support/components/LatestInfoNotice";

describe("LatestInfoNotice(自治体の二次利用許諾条件対応)", () => {
  it("規定の文言を表示する", () => {
    render(<LatestInfoNotice />);

    expect(
      screen.getByText(
        "掲載している情報は、各データの取得・確認時点のものです。最新・正確な情報は、各自治体・機関等の公式サイトや窓口で必ずご確認ください。",
      ),
    ).toBeTruthy();
  });

  it("role=noteとして表示する(常時表示の注記であることを示す)", () => {
    render(<LatestInfoNotice />);

    expect(screen.getByRole("note").textContent).toContain("各自治体・機関等の公式サイトや窓口で必ずご確認ください。");
  });
});
