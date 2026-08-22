import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsToggleRow } from "@/features/settings/components/SettingsToggleRow";

describe("SettingsToggleRow", () => {
  it("無効時は role=switch・aria-checked=false で描画され、タイトルと無効時の説明文を表示する", () => {
    render(
      <SettingsToggleRow
        title="テスト設定"
        enabled={false}
        onToggle={vi.fn()}
        enabledDescription="有効時の説明"
        disabledDescription="無効時の説明"
      />,
    );

    expect(screen.getByText("テスト設定")).toBeTruthy();
    expect(screen.getByText("無効(初期設定)")).toBeTruthy();
    expect(screen.getByText("無効時の説明")).toBeTruthy();
    expect(screen.queryByText("有効時の説明")).toBeNull();

    const toggle = screen.getByRole("switch", { name: "テスト設定" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("有効時は role=switch・aria-checked=true で描画され、タイトルと有効時の説明文を表示する", () => {
    render(
      <SettingsToggleRow
        title="テスト設定"
        enabled={true}
        onToggle={vi.fn()}
        enabledDescription="有効時の説明"
        disabledDescription="無効時の説明"
      />,
    );

    expect(screen.getByText("有効")).toBeTruthy();
    expect(screen.getByText("有効時の説明")).toBeTruthy();
    expect(screen.queryByText("無効時の説明")).toBeNull();

    const toggle = screen.getByRole("switch", { name: "テスト設定" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("switch ボタンの aria-labelledby がタイトルの id と接続している(アクセシブルネームとして解決される)", () => {
    render(
      <SettingsToggleRow
        title="接続確認用タイトル"
        enabled={false}
        onToggle={vi.fn()}
        enabledDescription="有効時の説明"
        disabledDescription="無効時の説明"
      />,
    );

    const toggle = screen.getByRole("switch", { name: "接続確認用タイトル" });
    const labelId = toggle.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)?.textContent).toBe("接続確認用タイトル");
  });

  it("section(クリック可能領域)をクリックすると現在値を反転させた値で onToggle を呼ぶ", () => {
    const onToggle = vi.fn();
    render(
      <SettingsToggleRow
        title="テスト設定"
        enabled={false}
        onToggle={onToggle}
        enabledDescription="有効時の説明"
        disabledDescription="無効時の説明"
      />,
    );

    fireEvent.click(screen.getByText("テスト設定"));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("switch ボタンをクリックすると現在値を反転させた値で onToggle を呼ぶ(1回のみ)", () => {
    const onToggle = vi.fn();
    render(
      <SettingsToggleRow
        title="テスト設定"
        enabled={true}
        onToggle={onToggle}
        enabledDescription="有効時の説明"
        disabledDescription="無効時の説明"
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "テスト設定" }));

    // switch ボタンのクリックが section の onClick へ伝播していれば onToggle が2回呼ばれるはず。
    // stopPropagation により1回のみ呼ばれることを確認する。
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
