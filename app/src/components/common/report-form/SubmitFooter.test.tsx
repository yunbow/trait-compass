import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportSubmitFooter } from "@/components/common/report-form/SubmitFooter";

describe("ReportSubmitFooter(Phase 2: 2-10 ReportFormParts)", () => {
  it("disabled=trueの場合、「入力内容を確認する」ボタンが無効になる", () => {
    render(<ReportSubmitFooter disabled onClick={vi.fn()} />);

    expect((screen.getByRole("button", { name: "入力内容を確認する" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disabled=falseの場合、ボタンが有効になりクリックでonClickが呼ばれる", () => {
    const onClick = vi.fn();
    render(<ReportSubmitFooter disabled={false} onClick={onClick} />);

    const button = screen.getByRole("button", { name: "入力内容を確認する" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("個別返信を行わない旨の案内文を表示する", () => {
    render(<ReportSubmitFooter disabled={false} onClick={vi.fn()} />);

    expect(screen.getByText("報告内容への個別の返信は行いません。必要に応じて掲載情報を確認します。")).toBeTruthy();
  });
});
