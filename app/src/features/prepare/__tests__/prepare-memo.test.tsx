import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrepareMemo } from "@/features/prepare/components/PrepareMemo";
import type { PrepareResponse } from "@/features/prepare/schema/prepare";

const MEMO: PrepareResponse = {
  summary: "困りごとの要約です。",
  checklist: ["伝えること1"],
  flow: ["流れ1"],
  questions: ["質問1"],
  facilities: [],
  isFallback: false,
  fallbackMessage: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-print-mode");
});

describe("PrepareMemo(TICKET-0046 AC-3)", () => {
  it("メモ本文にテンプレート生成(AI不使用)由来ラベルを表示する(P0対応)", () => {
    render(<PrepareMemo memo={MEMO} />);

    expect(screen.getByText("選択項目から自動作成(AI不使用)")).toBeTruthy();
  });

  it("「印刷する」を押すと <html> に印刷モード属性を付与し window.print() を呼ぶ", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrepareMemo memo={MEMO} />);

    fireEvent.click(screen.getByRole("button", { name: /印刷する/ }));

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute("data-print-mode")).toBe("prepare-memo");
  });

  it("afterprint イベントで印刷モード属性を除去する", () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrepareMemo memo={MEMO} />);

    fireEvent.click(screen.getByRole("button", { name: /印刷する/ }));
    expect(document.documentElement.getAttribute("data-print-mode")).toBe("prepare-memo");

    fireEvent(window, new Event("afterprint"));
    expect(document.documentElement.hasAttribute("data-print-mode")).toBe(false);
  });

  it("「コピーする」を押すとクリップボードへ整形済みテキストを書き出す", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<PrepareMemo memo={MEMO} />);
    fireEvent.click(screen.getByRole("button", { name: /コピーする/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const [text] = writeText.mock.calls[0] as [string];
    expect(text).toContain("【相談メモ】");
    expect(text).toContain("困りごとの要約です。");
    expect(await screen.findByText("コピーしました")).toBeTruthy();
  });
});

describe("PrepareMemo: 窓口候補の確認状態の注意喚起(外部レビュー指摘対応)", () => {
  const BASE_FACILITY = {
    id: "fac-1",
    name: "テスト相談窓口",
    municipality: "世田谷区",
    address: null,
    phone: null,
    url: null,
    sourceCredit: "出典: テストデータセット",
    sourceUrl: null,
  };

  it("confirmationStatus='phone_required' の窓口候補には、FacilityCard と同じ確認状態の注意書きを表示する", () => {
    const memo: PrepareResponse = {
      ...MEMO,
      facilities: [{ ...BASE_FACILITY, confirmationStatus: "phone_required", confirmedOn: null }],
    };
    render(<PrepareMemo memo={memo} />);

    expect(screen.getByText("掲載内容は電話確認が未完了です。利用前に窓口へご確認ください。")).toBeTruthy();
  });

  it("confirmationStatus='confirmed' の窓口候補には注意書きを表示しない", () => {
    const memo: PrepareResponse = {
      ...MEMO,
      facilities: [{ ...BASE_FACILITY, confirmationStatus: "confirmed", confirmedOn: "2026-07-01" }],
    };
    render(<PrepareMemo memo={memo} />);

    expect(screen.queryByText("掲載内容は電話確認が未完了です。利用前に窓口へご確認ください。")).toBeNull();
    expect(screen.queryByText("掲載内容は未確認の情報です。利用前に窓口へ直接ご確認ください。")).toBeNull();
  });
});
