import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagToggleGroup } from "@/components/common/TagToggleGroup";

const OPTIONS = ["支援A", "支援B", "支援C"] as const;

describe("TagToggleGroup", () => {
  it("legend と description を表示する", () => {
    render(
      <TagToggleGroup
        options={OPTIONS}
        selectedTags={[]}
        onToggle={vi.fn()}
        legend="困っている場面"
        description="複数選択できます"
      />,
    );

    expect(screen.getByText("困っている場面")).toBeTruthy();
    expect(screen.getByText("複数選択できます")).toBeTruthy();
  });

  it("description を指定しない場合は表示しない", () => {
    render(<TagToggleGroup options={OPTIONS} selectedTags={[]} onToggle={vi.fn()} legend="困っている場面" />);

    expect(screen.queryByText("複数選択できます")).toBeNull();
  });

  it("選択済みタグのボタンには aria-pressed=true が付く", () => {
    render(<TagToggleGroup options={OPTIONS} selectedTags={["支援B"]} onToggle={vi.fn()} legend="タグ" />);

    expect(screen.getByRole("button", { name: "支援B" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "支援A" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "支援C" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("タグをクリックすると onToggle がそのタグとともに呼ばれる", () => {
    const onToggle = vi.fn();
    render(<TagToggleGroup options={OPTIONS} selectedTags={[]} onToggle={onToggle} legend="タグ" />);

    fireEvent.click(screen.getByRole("button", { name: "支援A" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("支援A");
  });

  it("disabled=true の場合、fieldset が無効化される", () => {
    render(<TagToggleGroup options={OPTIONS} selectedTags={[]} onToggle={vi.fn()} legend="タグ" disabled />);

    expect((screen.getByRole("group", { name: "タグ" }) as HTMLFieldSetElement).disabled).toBe(true);
  });

  it("disabled を指定しない場合、fieldset は無効化されない", () => {
    render(<TagToggleGroup options={OPTIONS} selectedTags={[]} onToggle={vi.fn()} legend="タグ" />);

    expect((screen.getByRole("group", { name: "タグ" }) as HTMLFieldSetElement).disabled).toBe(false);
  });
});
