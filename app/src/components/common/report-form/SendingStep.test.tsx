import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportSendingStep } from "@/components/common/report-form/SendingStep";

describe("ReportSendingStep(Phase 2: 2-10 ReportFormParts)", () => {
  it("送信中の見出しと、無効化された「修正する」「送信しています…」ボタンを表示する", () => {
    render(<ReportSendingStep />);

    expect(screen.getByText("送信内容を確認")).toBeTruthy();
    expect((screen.getByRole("button", { name: "修正する" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "送信しています…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
