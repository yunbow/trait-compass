import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReportStepIndicator } from "@/components/common/report-form/StepIndicator";

describe("ReportStepIndicator(Phase 2: 2-10 ReportFormParts)", () => {
  it("current=1の場合、「1 / 2　報告内容」を表示し、progressbarのaria値がcurrentと一致する", () => {
    render(<ReportStepIndicator current={1} />);

    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "1 / 2　報告内容")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "報告の進行状況" });
    expect(bar.getAttribute("aria-valuemin")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("2");
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
  });

  it("current=2の場合、「2 / 2　送信前の確認」を表示し、progressbarのaria-valuenowが2になる", () => {
    render(<ReportStepIndicator current={2} />);

    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "2 / 2　送信前の確認")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "報告の進行状況" });
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
  });
});
