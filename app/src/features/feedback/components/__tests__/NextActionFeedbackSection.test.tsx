import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NextActionFeedbackSection } from "@/features/feedback/components/NextActionFeedbackSection";
import { hasAnsweredFeedback, markFeedbackAnswered } from "@/features/feedback/services/session";

function mockFetchResolved(body: unknown = { ok: true }, ok = true, status = 200) {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("NextActionFeedbackSection", () => {
  it("既に回答済みのセッションでは何も描画しない", async () => {
    markFeedbackAnswered();
    const { container } = render(<NextActionFeedbackSection source="support-results" />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("未回答なら質問文と3択ボタンを表示する", async () => {
    render(<NextActionFeedbackSection source="support-results" />);

    expect(await screen.findByText("このページで、次に何をすればよいか分かりましたか？")).toBeTruthy();
    expect(screen.getByRole("button", { name: "分かった" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "少し分かった" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "まだ分からない" })).toBeTruthy();
  });

  it("3択タップで正しい内容をPOSTする", async () => {
    mockFetchResolved();
    render(<NextActionFeedbackSection source="result-prepare" />);

    fireEvent.click(await screen.findByRole("button", { name: "少し分かった" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/feedback");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ kind: "rating", source: "result-prepare", rating: "partial" });
  });

  it("送信成功でサンクス表示に遷移し、markFeedbackAnsweredが呼ばれる(セッションに記録される)", async () => {
    mockFetchResolved();
    render(<NextActionFeedbackSection source="support-results" />);

    fireEvent.click(await screen.findByRole("button", { name: "分かった" }));

    expect(await screen.findByText("ご回答ありがとうございます。サービス改善に活用します。")).toBeTruthy();
    expect(hasAnsweredFeedback()).toBe(true);
    // 回答済みになった後も3択ボタン自体は消える(再送信を防ぐ)。
    expect(screen.queryByRole("button", { name: "分かった" })).toBeNull();
  });

  it("送信失敗時は控えめなエラーメッセージと再試行ボタンを表示する", async () => {
    mockFetchResolved({ error: "internal" }, false, 500);
    render(<NextActionFeedbackSection source="support-results" />);

    fireEvent.click(await screen.findByRole("button", { name: "分かった" }));

    expect(await screen.findByText("送信できませんでした。もう一度お試しください。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "もう一度送信する" })).toBeTruthy();
    // エラー時点ではまだ回答済み扱いにしない。
    expect(hasAnsweredFeedback()).toBe(false);
  });

  it("unclearを選んだ場合のみ、サンクスの下に内訳質問を表示する", async () => {
    mockFetchResolved();
    render(<NextActionFeedbackSection source="support-results" />);

    fireEvent.click(await screen.findByRole("button", { name: "まだ分からない" }));

    expect(await screen.findByText("ご回答ありがとうございます。サービス改善に活用します。")).toBeTruthy();
    expect(screen.getByText("どのあたりが分かりにくかったですか？(任意)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "自分に合う支援先が分からない" })).toBeTruthy();
  });

  it("clearを選んだ場合は内訳質問を表示しない", async () => {
    mockFetchResolved();
    render(<NextActionFeedbackSection source="support-results" />);

    fireEvent.click(await screen.findByRole("button", { name: "分かった" }));

    expect(await screen.findByText("ご回答ありがとうございます。サービス改善に活用します。")).toBeTruthy();
    expect(screen.queryByText("どのあたりが分かりにくかったですか？(任意)")).toBeNull();
  });

  it("unclear内訳選択で正しい内容をPOSTし、送信後は選択肢を消して受領表示にする", async () => {
    mockFetchResolved();
    render(<NextActionFeedbackSection source="support-results" />);

    fireEvent.click(await screen.findByRole("button", { name: "まだ分からない" }));
    await screen.findByText("どのあたりが分かりにくかったですか？(任意)");

    fireEvent.click(screen.getByRole("button", { name: "情報が足りない" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(JSON.parse(init.body)).toEqual({ kind: "unclear-reason", source: "support-results", reason: "info-gap" });

    expect(await screen.findByText("ご回答ありがとうございます。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "情報が足りない" })).toBeNull();
  });

  it("回答成功後に親が再レンダーしても、サンクス表示とコメントフォームが消えない(回帰: viewMode切替等でのウィジェット消失バグ)", async () => {
    mockFetchResolved();
    const { rerender } = render(<NextActionFeedbackSection source="support-results" />);

    fireEvent.click(await screen.findByRole("button", { name: "分かった" }));
    expect(await screen.findByText("ご回答ありがとうございます。サービス改善に活用します。")).toBeTruthy();
    expect(hasAnsweredFeedback()).toBe(true);

    // 親コンポーネントの再レンダー(例: FacilityResultsViewのviewMode切替)を模して、
    // 同じpropsで再度renderする。sendRating成功時点で既にhasAnsweredFeedback()はtrueに
    // なっているため、以前の実装(useSyncExternalStoreの結果のみで非表示判定)ではここで
    // ウィジェット全体がnullになって消えてしまっていた。
    rerender(<NextActionFeedbackSection source="support-results" />);

    expect(screen.getByText("ご回答ありがとうございます。サービス改善に活用します。")).toBeTruthy();
    expect(
      screen.getByText("Trait Compass を使って、役に立ったこと・分かりにくかったことがあれば教えてください(任意)"),
    ).toBeTruthy();
  });

  it("回答後にコメント誘い文が表示される", async () => {
    mockFetchResolved();
    render(<NextActionFeedbackSection source="support-results" />);

    fireEvent.click(await screen.findByRole("button", { name: "分かった" }));

    expect(
      await screen.findByText("Trait Compass を使って、役に立ったこと・分かりにくかったことがあれば教えてください(任意)"),
    ).toBeTruthy();
  });
});
