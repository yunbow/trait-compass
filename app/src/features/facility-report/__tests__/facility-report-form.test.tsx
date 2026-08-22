import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { FacilityReportForm } from "@/features/facility-report/components/FacilityReportForm";
import type { ReportableFacility } from "@/features/facility-report/schema/facility-report";

const BACK_HREF = "/support/results?age=child&municipality=%E4%B8%96%E7%94%B0%E8%B0%B7%E5%8C%BA";

function makeFacility(overrides: Partial<ReportableFacility> = {}): ReportableFacility {
  return {
    id: "fac-001",
    name: "世田谷区 発達障がい相談支援センター",
    municipality: "世田谷区",
    phone: "03-1234-5678",
    address: "東京都世田谷区XX",
    summary: "発達に関する相談窓口です。",
    url: "https://example.com",
    ...overrides,
  };
}

function selectCategory(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

function isDisabled(name: string): boolean {
  return (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  push.mockClear();
});

describe("FacilityReportForm(TICKET-0064)", () => {
  it("カテゴリ選択で条件付きフィールドが表示される(phone)", () => {
    render(<FacilityReportForm facility={makeFacility()} backHref={BACK_HREF} />);

    selectCategory("電話番号が違う・つながらない");

    expect(screen.getByText("いま掲載している電話番号")).toBeTruthy();
    expect(screen.getByText("03-1234-5678")).toBeTruthy();
    expect(screen.getByText("正しいと思われる電話番号(任意)")).toBeTruthy();
  });

  it("phoneがnull(summaryモード相当)の場合は現在の掲載内容ブロックを表示しない", () => {
    render(<FacilityReportForm facility={makeFacility({ phone: null })} backHref={BACK_HREF} />);

    selectCategory("電話番号が違う・つながらない");

    expect(screen.queryByText("現在の掲載内容")).toBeNull();
  });

  it("closureカテゴリではclosureStatus選択肢が表示され、選ぶまで確認ボタンが無効", () => {
    render(<FacilityReportForm facility={makeFacility()} backHref={BACK_HREF} />);

    selectCategory("閉鎖・移転・名称変更している");

    expect(isDisabled("入力内容を確認する")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "移転している" }));
    expect(isDisabled("入力内容を確認する")).toBe(false);
  });

  it("unclear/otherはdetailText未入力の間、確認ボタンが無効", () => {
    render(<FacilityReportForm facility={makeFacility()} backHref={BACK_HREF} />);

    selectCategory("説明が分かりにくい・誤解しやすい");
    expect(isDisabled("入力内容を確認する")).toBe(true);

    fireEvent.change(screen.getByLabelText(/どの部分が分かりにくいですか？（入力必須）/), { target: { value: "対象年齢の記載が曖昧です" } });
    expect(isDisabled("入力内容を確認する")).toBe(false);
  });

  it("他カテゴリ(phone)は追加入力なしでも確認ボタンが有効", () => {
    render(<FacilityReportForm facility={makeFacility()} backHref={BACK_HREF} />);

    selectCategory("電話番号が違う・つながらない");
    expect(isDisabled("入力内容を確認する")).toBe(false);
  });

  it("preview段階で選択内容の読み返しを表示する", () => {
    render(<FacilityReportForm facility={makeFacility()} backHref={BACK_HREF} />);

    selectCategory("電話番号が違う・つながらない");
    fireEvent.change(screen.getByLabelText("正しいと思われる電話番号(任意)"), { target: { value: "03-9999-9999" } });
    fireEvent.click(screen.getByRole("button", { name: "入力内容を確認する" }));

    expect(screen.getByText("送信内容を確認")).toBeTruthy();
    expect(screen.getByText("対象施設")).toBeTruthy();
    expect(screen.getByText("世田谷区 発達障がい相談支援センター（世田谷区）")).toBeTruthy();
    expect(screen.getByText("正しいと思われる内容")).toBeTruthy();
    expect(screen.getByText("03-9999-9999")).toBeTruthy();
  });

  it("送信成功でdoneステップを表示し、検索結果に戻るボタンでbackHrefへ遷移する", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    render(<FacilityReportForm facility={makeFacility()} backHref={BACK_HREF} />);

    selectCategory("電話番号が違う・つながらない");
    fireEvent.click(screen.getByRole("button", { name: "入力内容を確認する" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で送信" }));

    expect(await screen.findByText("ご報告ありがとうございました")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "検索結果に戻る" }));
    expect(push).toHaveBeenCalledWith(BACK_HREF);
  });

  it("429応答はレート制限用の文言を表示する", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate limited", retryAfterSeconds: 60 }),
    });

    render(<FacilityReportForm facility={makeFacility()} backHref={BACK_HREF} />);

    selectCategory("電話番号が違う・つながらない");
    fireEvent.click(screen.getByRole("button", { name: "入力内容を確認する" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で送信" }));

    expect(await screen.findByText("短時間に多くの送信がありました。しばらく時間をおいてからお試しください。")).toBeTruthy();
  });

  it("通常のエラー(500等)は汎用エラー文言を表示し、検索結果に戻るボタンでbackHrefへ遷移する", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal" }),
    });

    render(<FacilityReportForm facility={makeFacility()} backHref={BACK_HREF} />);

    selectCategory("電話番号が違う・つながらない");
    fireEvent.click(screen.getByRole("button", { name: "入力内容を確認する" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で送信" }));

    expect(await screen.findByText("送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "検索結果に戻る" }));
    expect(push).toHaveBeenCalledWith(BACK_HREF);
  });
});
