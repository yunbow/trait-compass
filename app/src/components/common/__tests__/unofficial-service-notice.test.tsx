import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UnofficialServiceNotice } from "@/components/common/UnofficialServiceNotice";

describe("UnofficialServiceNotice(自治体の二次利用許諾条件対応)", () => {
  it("規定の文言を表示する", () => {
    render(<UnofficialServiceNotice />);

    expect(
      screen.getByText(
        "本サービスは、有志プロジェクト CivicUnknot が開発・運営する非公式のサービスであり、国や自治体（都道府県・区市町村）等が提供する公式サービス・公式アプリではありません。本サービスの利用により生じたトラブルや損害について、掲載情報の提供元である自治体等が責任を負うものではありません。",
      ),
    ).toBeTruthy();
  });

  it("role=noteとして表示する(常時表示の注記であることを示す)", () => {
    render(<UnofficialServiceNotice />);

    expect(screen.getByRole("note").textContent).toContain("公式サービス・公式アプリではありません。");
  });
});
