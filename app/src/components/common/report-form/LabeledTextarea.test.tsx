import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReportLabeledTextarea } from "@/components/common/report-form/LabeledTextarea";

describe("ReportLabeledTextarea(Phase 2: 2-10 ReportFormParts)", () => {
  it("labelでtextareaを取得でき、入力するとonChangeへ値が渡る", () => {
    const onChange = vi.fn();
    render(<ReportLabeledTextarea label="補足があれば入力してください（任意）" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("補足があれば入力してください（任意）"), {
      target: { value: "対象年齢の記載が曖昧です" },
    });

    expect(onChange).toHaveBeenCalledWith("対象年齢の記載が曖昧です");
  });

  it("maxLengthを指定すると文字数カウンター(value.length / maxLength文字)を表示する", () => {
    render(<ReportLabeledTextarea label="補足" value="abc" onChange={vi.fn()} maxLength={500} />);

    expect(screen.getByText("3 / 500文字")).toBeTruthy();
  });

  it("maxLengthを指定しない場合、文字数カウンターを表示しない", () => {
    render(<ReportLabeledTextarea label="補足" value="abc" onChange={vi.fn()} />);

    expect(screen.queryByText(/\/ .*文字/)).toBeNull();
  });

  it("placeholderを指定すると反映される", () => {
    render(
      <ReportLabeledTextarea
        label="補足"
        value=""
        onChange={vi.fn()}
        placeholder="例: 公式サイトでは受付時間が16時までと記載されています。"
      />,
    );

    expect(screen.getByPlaceholderText("例: 公式サイトでは受付時間が16時までと記載されています。")).toBeTruthy();
  });
});
