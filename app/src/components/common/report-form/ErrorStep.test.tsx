import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportErrorStep } from "@/components/common/report-form/ErrorStep";

describe("ReportErrorStep(Phase 2: 2-10 ReportFormParts)", () => {
  it("isRateLimited=trueの場合、レート制限用の文言を表示する", () => {
    render(<ReportErrorStep isRateLimited onRetry={vi.fn()} onLeave={vi.fn()} />);

    expect(screen.getByText("短時間に多くの送信がありました。しばらく時間をおいてからお試しください。")).toBeTruthy();
  });

  it("isRateLimited=falseの場合、汎用エラー文言を表示する", () => {
    render(<ReportErrorStep isRateLimited={false} onRetry={vi.fn()} onLeave={vi.fn()} />);

    expect(screen.getByText("送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。")).toBeTruthy();
  });

  it("「もう一度試す」でonRetry、「検索結果に戻る」でonLeaveが呼ばれる", () => {
    const onRetry = vi.fn();
    const onLeave = vi.fn();
    render(<ReportErrorStep isRateLimited={false} onRetry={onRetry} onLeave={onLeave} />);

    fireEvent.click(screen.getByRole("button", { name: "もう一度試す" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "検索結果に戻る" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
