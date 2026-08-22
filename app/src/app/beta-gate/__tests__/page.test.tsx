import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BetaGatePage from "@/app/beta-gate/page";

describe("BetaGatePage", () => {
  it("パスワード入力欄と送信ボタンを表示する", async () => {
    render(await BetaGatePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByLabelText("パスワード")).toBeTruthy();
    const input = screen.getByLabelText("パスワード") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(screen.getByRole("button", { name: "進む" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("error=1 のときエラーメッセージを表示する", async () => {
    render(await BetaGatePage({ searchParams: Promise.resolve({ error: "1" }) }));

    expect(screen.getByRole("alert").textContent).toContain("パスワードが違います");
  });
});
