import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SingleChoiceButtonGroup } from "@/components/common/SingleChoiceButtonGroup";

const OPTIONS = [
  { value: "a", label: "選択肢A" },
  { value: "b", label: "選択肢B" },
  { value: "c", label: "選択肢C" },
] as const;

describe("SingleChoiceButtonGroup", () => {
  it("legendClassName を指定しない場合、既定のクラスで legend を表示する", () => {
    render(
      <SingleChoiceButtonGroup options={OPTIONS} selectedValue={undefined} onSelect={vi.fn()} legend="年齢" />,
    );

    const legend = screen.getByText("年齢");
    expect(legend.className).toBe("text-xs font-medium text-foreground");
  });

  it("legendClassName を指定した場合、そのクラスで legend を表示する(既定クラスを上書き)", () => {
    render(
      <SingleChoiceButtonGroup
        options={OPTIONS}
        selectedValue={undefined}
        onSelect={vi.fn()}
        legend="どなたが相談しますか？"
        legendClassName="text-sm font-medium text-foreground"
      />,
    );

    const legend = screen.getByText("どなたが相談しますか？");
    expect(legend.className).toBe("text-sm font-medium text-foreground");
  });

  it("選択済みの値のボタンには aria-pressed=true が付く", () => {
    render(<SingleChoiceButtonGroup options={OPTIONS} selectedValue="b" onSelect={vi.fn()} legend="選択肢" />);

    expect(screen.getByRole("button", { name: "選択肢A" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "選択肢B" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "選択肢C" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("selectedValue が null または undefined の場合、どのボタンにも aria-pressed=true が付かない", () => {
    const { rerender } = render(
      <SingleChoiceButtonGroup options={OPTIONS} selectedValue={null} onSelect={vi.fn()} legend="選択肢" />,
    );
    expect(screen.getByRole("button", { name: "選択肢A" }).getAttribute("aria-pressed")).toBe("false");

    rerender(<SingleChoiceButtonGroup options={OPTIONS} selectedValue={undefined} onSelect={vi.fn()} legend="選択肢" />);
    expect(screen.getByRole("button", { name: "選択肢A" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("ボタンをクリックすると onSelect が選択した値とともに呼ばれる", () => {
    const onSelect = vi.fn();
    render(<SingleChoiceButtonGroup options={OPTIONS} selectedValue={undefined} onSelect={onSelect} legend="選択肢" />);

    fireEvent.click(screen.getByRole("button", { name: "選択肢C" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("disabled=true の場合、fieldset が無効化される", () => {
    render(
      <SingleChoiceButtonGroup options={OPTIONS} selectedValue={undefined} onSelect={vi.fn()} legend="選択肢" disabled />,
    );

    expect((screen.getByRole("group", { name: "選択肢" }) as HTMLFieldSetElement).disabled).toBe(true);
  });

  it("disabled を指定しない場合、fieldset は無効化されない", () => {
    render(<SingleChoiceButtonGroup options={OPTIONS} selectedValue={undefined} onSelect={vi.fn()} legend="選択肢" />);

    expect((screen.getByRole("group", { name: "選択肢" }) as HTMLFieldSetElement).disabled).toBe(false);
  });
});
