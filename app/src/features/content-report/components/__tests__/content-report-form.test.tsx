import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { ContentReportForm } from "@/features/content-report/components/ContentReportForm";
import { PATHWAY_REPORT_CATEGORY_OPTIONS, SCHOOL_REPORT_CATEGORY_OPTIONS } from "@/features/content-report/services/report-categories";

const BACK_HREF = "/support/results?age=child&municipality=%E5%8F%B0%E6%9D%B1%E5%8C%BA";
const TARGET_CONTEXT = "台東区 ／ 想定ルート（発達相談）";

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

describe("ContentReportForm", () => {
  it("correctedValue対象カテゴリ(contact)選択で「正しいと思われる内容」欄が表示される", () => {
    render(
      <ContentReportForm
        targetType="pathway"
        targetContext={TARGET_CONTEXT}
        categoryOptions={PATHWAY_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "pathway", targetId: "path-001" }}
      />,
    );

    selectCategory("窓口・連絡先が違う・つながらない");

    expect(screen.getByText("正しいと思われる内容(任意)")).toBeTruthy();
    expect(screen.getByText("補足があれば入力してください（任意）")).toBeTruthy();
  });

  it("unclear選択時はdetailTextが必須になり、入力するまで確認ボタンが無効", () => {
    render(
      <ContentReportForm
        targetType="pathway"
        targetContext={TARGET_CONTEXT}
        categoryOptions={PATHWAY_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "pathway", targetId: "path-001" }}
      />,
    );

    selectCategory("説明が分かりにくい・誤解しやすい");
    expect(isDisabled("入力内容を確認する")).toBe(true);
    // correctedValue対象外カテゴリなので「正しいと思われる内容」欄は出ない。
    expect(screen.queryByText("正しいと思われる内容(任意)")).toBeNull();
    expect(screen.getByText("どのような点が気になりますか？（入力必須）")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/どのような点が気になりますか？（入力必須）/), {
      target: { value: "手続きの順番が分かりにくいです" },
    });
    expect(isDisabled("入力内容を確認する")).toBe(false);
  });

  it("pathway専用のoutdatedカテゴリ選択で、必須入力なしに確認ボタンが有効になる(P0対応: 情報が古いケースを独立したカテゴリにする)", () => {
    render(
      <ContentReportForm
        targetType="pathway"
        targetContext={TARGET_CONTEXT}
        categoryOptions={PATHWAY_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "pathway", targetId: "path-001" }}
      />,
    );

    selectCategory("掲載情報が古い・内容が更新されている");
    expect(isDisabled("入力内容を確認する")).toBe(false);
    // correctedValue対象外カテゴリなので「正しいと思われる内容」欄は出ない(補足のみ任意)。
    expect(screen.queryByText("正しいと思われる内容(任意)")).toBeNull();
    expect(screen.getByText("補足があれば入力してください（任意）")).toBeTruthy();
  });

  it("school-status(学校専用の必須detailカテゴリ)選択時もdetailText必須", () => {
    render(
      <ContentReportForm
        targetType="school"
        targetContext="台東区 ／ 小学校"
        categoryOptions={SCHOOL_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "school", targetId: "school-001" }}
      />,
    );

    selectCategory("閉校・統合・名称変更している");
    expect(isDisabled("入力内容を確認する")).toBe(true);

    fireEvent.change(screen.getByLabelText(/どのような点が気になりますか？（入力必須）/), {
      target: { value: "統合されたと聞きました" },
    });
    expect(isDisabled("入力内容を確認する")).toBe(false);
  });

  it("それ以外のcorrectedValue非対象カテゴリ(link以外)は追加入力なしでも確認ボタンが有効", () => {
    render(
      <ContentReportForm
        targetType="pathway"
        targetContext={TARGET_CONTEXT}
        categoryOptions={PATHWAY_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "pathway", targetId: "path-001" }}
      />,
    );

    selectCategory("窓口・連絡先が違う・つながらない");
    expect(isDisabled("入力内容を確認する")).toBe(false);
  });

  it("preview段階でtargetContext(対象)と選択内容の読み返しを表示する", () => {
    render(
      <ContentReportForm
        targetType="pathway"
        targetContext={TARGET_CONTEXT}
        categoryOptions={PATHWAY_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "pathway", targetId: "path-001" }}
      />,
    );

    selectCategory("窓口・連絡先が違う・つながらない");
    fireEvent.change(screen.getByLabelText("正しいと思われる内容(任意)"), { target: { value: "03-9999-9999" } });
    fireEvent.click(screen.getByRole("button", { name: "入力内容を確認する" }));

    expect(screen.getByText("送信内容を確認")).toBeTruthy();
    expect(screen.getByText("対象")).toBeTruthy();
    expect(screen.getByText(TARGET_CONTEXT)).toBeTruthy();
    expect(screen.getByText("正しいと思われる内容")).toBeTruthy();
    expect(screen.getByText("03-9999-9999")).toBeTruthy();
  });

  it("送信成功でdoneステップを表示し、targetPayloadとフォーム入力をマージして送信し、検索結果に戻るボタンでbackHrefへ遷移する", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    render(
      <ContentReportForm
        targetType="pathway"
        targetContext={TARGET_CONTEXT}
        categoryOptions={PATHWAY_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "pathway", targetId: "path-001" }}
      />,
    );

    selectCategory("窓口・連絡先が違う・つながらない");
    fireEvent.click(screen.getByRole("button", { name: "入力内容を確認する" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で送信" }));

    expect(await screen.findByText("ご報告ありがとうございました")).toBeTruthy();
    const [, requestInit] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody).toEqual(
      expect.objectContaining({ targetType: "pathway", targetId: "path-001", category: "contact", website: "" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "検索結果に戻る" }));
    expect(push).toHaveBeenCalledWith(BACK_HREF);
  });

  it("429応答はレート制限用の文言を表示する", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate limited", retryAfterSeconds: 60 }),
    });

    render(
      <ContentReportForm
        targetType="pathway"
        targetContext={TARGET_CONTEXT}
        categoryOptions={PATHWAY_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "pathway", targetId: "path-001" }}
      />,
    );

    selectCategory("窓口・連絡先が違う・つながらない");
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

    render(
      <ContentReportForm
        targetType="pathway"
        targetContext={TARGET_CONTEXT}
        categoryOptions={PATHWAY_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "pathway", targetId: "path-001" }}
      />,
    );

    selectCategory("窓口・連絡先が違う・つながらない");
    fireEvent.click(screen.getByRole("button", { name: "入力内容を確認する" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で送信" }));

    expect(await screen.findByText("送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "検索結果に戻る" }));
    expect(push).toHaveBeenCalledWith(BACK_HREF);
  });

  it("ハニーポットのwebsiteフィールドはaria-hiddenで隠されている", () => {
    render(
      <ContentReportForm
        targetType="pathway"
        targetContext={TARGET_CONTEXT}
        categoryOptions={PATHWAY_REPORT_CATEGORY_OPTIONS}
        backHref={BACK_HREF}
        targetPayload={{ targetType: "pathway", targetId: "path-001" }}
      />,
    );

    const honeypot = document.querySelector('input[name="website"]');
    expect(honeypot).toBeTruthy();
    expect(honeypot?.getAttribute("aria-hidden")).toBe("true");
  });
});
