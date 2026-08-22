import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackCommentForm } from "@/features/feedback/components/FeedbackCommentForm";

function mockFetchResolved(body: unknown = { ok: true }, ok = true, status = 200) {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

function typeComment(text: string) {
  fireEvent.change(screen.getByLabelText(/^コメント/), { target: { value: text } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("FeedbackCommentForm", () => {
  it("未入力の間は「送信内容を確認」が無効", () => {
    render(<FeedbackCommentForm source="support-results" />);

    expect((screen.getByRole("button", { name: "送信内容を確認" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("500文字を超えると「送信内容を確認」が無効になる(maxLength属性だけに頼らない)", () => {
    render(<FeedbackCommentForm source="support-results" />);

    typeComment("あ".repeat(501));

    expect((screen.getByRole("button", { name: "送信内容を確認" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("1〜500文字なら「送信内容を確認」が有効になる", () => {
    render(<FeedbackCommentForm source="support-results" />);

    typeComment("役に立ちました");

    expect((screen.getByRole("button", { name: "送信内容を確認" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("プレビューを経ずにfetchは呼ばれない(入力しただけでは送信されない)", () => {
    render(<FeedbackCommentForm source="support-results" />);

    typeComment("役に立ちました");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("プレビューに送信されるコメント本文と公開許可の状態(未チェック=公開しない)が表示される", () => {
    render(<FeedbackCommentForm source="support-results" />);

    typeComment("  役に立ちました  ");
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));

    expect(screen.getByText("役に立ちました")).toBeTruthy();
    expect(screen.getByText("公開しない")).toBeTruthy();
    expect(screen.getByText("お名前・連絡先などの個人情報は書かないでください。")).toBeTruthy();
  });

  it("公開許可チェックをオンにするとプレビューに公開許可ありの文言が表示される", () => {
    render(<FeedbackCommentForm source="support-results" />);

    typeComment("役に立ちました");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));

    expect(
      screen.getByText(
        "この内容を、匿名の「利用者の声」として成果ページに掲載してもよい(掲載前に運営が内容を確認します)",
      ),
    ).toBeTruthy();
  });

  it("プレビュー画面の「この内容で送信」を押すまでfetchは呼ばれない", () => {
    render(<FeedbackCommentForm source="support-results" />);

    typeComment("役に立ちました");
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("「この内容で送信」でtrim後の本文・公開許可チェックの値・honeypotがPOSTに反映される", async () => {
    mockFetchResolved();
    render(<FeedbackCommentForm source="result-prepare" />);

    typeComment("  役に立ちました  ");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で送信" }));

    await screen.findByText("コメントを送信しました。ご協力ありがとうございました。");

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/feedback");
    expect(JSON.parse(init.body)).toEqual({
      kind: "comment",
      source: "result-prepare",
      commentText: "役に立ちました",
      publishConsent: true,
      website: "",
    });
  });

  it("送信失敗時は控えめなエラーメッセージと再試行ボタンを表示する", async () => {
    mockFetchResolved({ error: "internal" }, false, 500);
    render(<FeedbackCommentForm source="support-results" />);

    typeComment("役に立ちました");
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で送信" }));

    expect(await screen.findByText("送信できませんでした。もう一度お試しください。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "もう一度試す" })).toBeTruthy();
  });

  it("「修正する」でフォームに戻れる", () => {
    render(<FeedbackCommentForm source="support-results" />);

    typeComment("役に立ちました");
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "修正する" }));

    expect(screen.getByLabelText(/^コメント/)).toBeTruthy();
  });
});
