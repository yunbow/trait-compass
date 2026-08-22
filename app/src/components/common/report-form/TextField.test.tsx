import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportTextField } from "@/components/common/report-form/TextField";

describe("ReportTextField(Phase 2: 2-10 ReportFormParts)", () => {
  it("labelでinputを取得でき、入力するとonChangeへ値が渡る", () => {
    const onChange = vi.fn();
    render(<ReportTextField label="正しいと思われる電話番号(任意)" value="" onChange={onChange} />);

    const input = screen.getByLabelText("正しいと思われる電話番号(任意)");
    fireEvent.change(input, { target: { value: "03-9999-9999" } });

    expect(onChange).toHaveBeenCalledWith("03-9999-9999");
  });

  it("maxLengthを指定すると、実際のinput要素のmaxLength属性に反映される(旧FacilityReportForm版の未反映バグの再発防止)", () => {
    render(<ReportTextField label="正しいと思われる内容(任意)" value="" onChange={vi.fn()} maxLength={200} />);

    const input = screen.getByLabelText("正しいと思われる内容(任意)") as HTMLInputElement;
    expect(input.maxLength).toBe(200);
  });

  it("maxLengthを指定しない場合、maxLength属性は既定値(制限なし)のままになる", () => {
    render(<ReportTextField label="正しいと思われる電話番号(任意)" value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText("正しいと思われる電話番号(任意)") as HTMLInputElement;
    expect(input.maxLength).toBe(-1);
  });
});
