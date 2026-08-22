import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportDoneStep } from "@/components/common/report-form/DoneStep";

describe("ReportDoneStep(Phase 2: 2-10 ReportFormParts)", () => {
  it("お礼メッセージを表示し、「検索結果に戻る」クリックでonLeaveが呼ばれる", () => {
    const onLeave = vi.fn();
    render(<ReportDoneStep onLeave={onLeave} />);

    expect(screen.getByText("ご報告ありがとうございました")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "検索結果に戻る" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
