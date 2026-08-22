import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportHoneypotField } from "@/components/common/report-form/HoneypotField";

describe("ReportHoneypotField(Phase 2: 2-10 ReportFormParts)", () => {
  it("aria-hiddenでスクリーンリーダーから隠され、tabIndex=-1でタブ移動の対象外になる", () => {
    const { container } = render(<ReportHoneypotField value="" onChange={vi.fn()} />);

    const input = container.querySelector('input[name="website"]');
    expect(input).toBeTruthy();
    expect(input?.getAttribute("aria-hidden")).toBe("true");
    expect(input?.getAttribute("tabindex")).toBe("-1");
    expect(input?.getAttribute("autocomplete")).toBe("off");
  });

  it("入力するとonChangeへ値が渡る", () => {
    const onChange = vi.fn();
    const { container } = render(<ReportHoneypotField value="" onChange={onChange} />);

    const input = container.querySelector('input[name="website"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "http://spam.example" } });

    expect(onChange).toHaveBeenCalledWith("http://spam.example");
  });
});
