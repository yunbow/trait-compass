import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryExplainSection } from "@/features/explain/components/CategoryExplainSection";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CategoryExplainSection", () => {
  it("初期状態はボタンのみで、fetch は発行されない", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<CategoryExplainSection topCategories={["communication"]} />);

    expect(screen.getByText("AI による補足解説(任意)")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ボタン押下・プレビュー表示だけでは fetch を一切発行しない(FR-041)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ explanation: "解説" }), { status: 200 }),
    );

    render(<CategoryExplainSection topCategories={["communication"]} />);
    fireEvent.click(screen.getByText("AI による補足解説(任意)"));

    await screen.findByText("送信内容を確認してください。");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("プレビューには送信されるもの(カテゴリ名のみ)と送信されないもの(回答・スコア・年齢・地域)を明示する", async () => {
    render(<CategoryExplainSection topCategories={["communication", "sensory"]} />);
    fireEvent.click(screen.getByText("AI による補足解説(任意)"));

    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByText(/上位カテゴリ名: /)).toBeTruthy();
    expect(screen.getByText("アンケートの回答内容・スコアの値・年齢・地域")).toBeTruthy();
  });

  it("「同意して送信」をクリックしてはじめて /api/explain へ fetch する", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ explanation: "この傾向は多くの人に見られます。" }), { status: 200 }),
    );

    render(<CategoryExplainSection topCategories={["communication"]} />);
    fireEvent.click(screen.getByText("AI による補足解説(任意)"));
    await screen.findByText("送信内容を確認してください。");

    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("同意して送信"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/explain",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ topCategories: ["communication"] }),
      }),
    );

    expect(await screen.findByText("この傾向は多くの人に見られます。")).toBeTruthy();

    // TICKET-0062: AI生成の解説文であることをラベルで明示する(FR-042と一貫した表示形式)。
    expect(screen.getByText("AIによる要約(参考情報)")).toBeTruthy();
  });

  it("「キャンセル」を押すとプレビューを閉じ、fetch は発行されない", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    render(<CategoryExplainSection topCategories={["communication"]} />);
    fireEvent.click(screen.getByText("AI による補足解説(任意)"));
    await screen.findByText("送信内容を確認してください。");

    fireEvent.click(screen.getByText("キャンセル"));

    expect(await screen.findByText("AI による補足解説(任意)")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("APIがエラーを返した場合はエラー表示に切り替わる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    render(<CategoryExplainSection topCategories={["communication"]} />);
    fireEvent.click(screen.getByText("AI による補足解説(任意)"));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByText("同意して送信"));

    expect(await screen.findByText("解説の取得に失敗しました。もう一度お試しください。")).toBeTruthy();
  });
});
