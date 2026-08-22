import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiSummarySection } from "@/features/ai-summary/components/AiSummarySection";

afterEach(() => {
  vi.restoreAllMocks();
});

function typeFreeText(text: string) {
  fireEvent.click(screen.getByText("AI に相談内容を要約してもらう(任意)"));
  const textarea = screen.getByLabelText("困りごとを入力(任意・スキップ可)");
  fireEvent.change(textarea, { target: { value: text } });
}

describe("AiSummarySection", () => {
  it("外部AIへの送信に関する説明(ログ非保存方針・事業者側ポリシー)を表示する(NFR-35)", () => {
    render(<AiSummarySection topCategories={["executive-function"]} />);

    fireEvent.click(screen.getByText("AI に相談内容を要約してもらう(任意)"));

    expect(screen.getByText(/外部の生成 AI サービスに送信されます/)).toBeTruthy();
    expect(screen.getByText(/AI 事業者側の保持・学習利用の条件は各社のポリシーによります/)).toBeTruthy();
  });

  it("初期状態ではボタンのみで、入力欄は表示されない", () => {
    render(<AiSummarySection topCategories={["executive-function"]} />);

    expect(screen.getByText("AI に相談内容を要約してもらう(任意)")).toBeTruthy();
    expect(screen.queryByLabelText("困りごとを入力(任意・スキップ可)")).toBeNull();
  });

  it("テキスト入力しただけ・プレビューを開いただけでは fetch を一切発行しない(FR-041)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ summary: "要約", isCrisisResponse: false }), { status: 200 }),
    );

    render(<AiSummarySection topCategories={["executive-function"]} />);

    typeFreeText("会議の内容を覚えておくのが難しい");
    fireEvent.click(screen.getByText("送信内容を確認"));

    // プレビュー表示後もまだ fetch は発行されていない。
    await screen.findByText("送信内容を確認してください。");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("プレビューには送信されるもの(入力テキスト+チェックで高めだった領域)と送信されないもの(回答・地域)を明示する", async () => {
    render(<AiSummarySection topCategories={["executive-function", "impulse-memory"]} />);

    typeFreeText("会議の内容を覚えておくのが難しい");
    fireEvent.click(screen.getByText("送信内容を確認"));

    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByText("入力テキスト: 「会議の内容を覚えておくのが難しい」")).toBeTruthy();
    expect(screen.getByText("チェックで高めだった領域: 段取り・実行、衝動・記憶")).toBeTruthy();
    expect(screen.getByText("アンケートの回答内容・年齢・地域")).toBeTruthy();
  });

  it("入力欄の直前に、個人特定情報を入力しない旨の短い注意書きを表示する(P0対応)", () => {
    render(<AiSummarySection topCategories={[]} autoStart />);

    expect(screen.getByText("氏名・住所・学校名・電話番号など、個人を特定できる情報は入力しないでください。")).toBeTruthy();
  });

  it("「同意して送信」をクリックしてはじめて /api/summarize へ fetch する", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ summary: "傾向の要約です。", isCrisisResponse: false }), { status: 200 }),
    );

    render(<AiSummarySection topCategories={["executive-function"]} />);

    typeFreeText("会議の内容を覚えておくのが難しい");
    fireEvent.click(screen.getByText("送信内容を確認"));
    await screen.findByText("送信内容を確認してください。");

    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("同意して送信"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/summarize",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ freeText: "会議の内容を覚えておくのが難しい", topCategories: ["executive-function"] }),
      }),
    );

    expect(await screen.findByText("傾向の要約です。")).toBeTruthy();
    expect(screen.getByText("AIによる要約(参考情報)")).toBeTruthy();
  });

  it("非危機介入の結果には印刷・コピー操作(SummaryMemo)が表示される", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ summary: "傾向の要約です。", isCrisisResponse: false }), { status: 200 }),
    );

    render(<AiSummarySection topCategories={[]} />);

    typeFreeText("会議の内容を覚えておくのが難しい");
    fireEvent.click(screen.getByText("送信内容を確認"));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByText("同意して送信"));

    await screen.findByText("傾向の要約です。");
    expect(screen.getByRole("button", { name: /印刷する/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /コピーする/ })).toBeTruthy();
  });

  it("危機介入の定型文にはAI由来ラベル・印刷/コピー操作(SummaryMemo)を一切表示しない(安全設計の回帰テスト)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ summary: "相談窓口へご連絡ください。", isCrisisResponse: true }), { status: 200 }),
    );

    render(<AiSummarySection topCategories={[]} />);

    typeFreeText("困りごと");
    fireEvent.click(screen.getByText("送信内容を確認"));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByText("同意して送信"));

    expect(await screen.findByText("相談窓口へご連絡ください。")).toBeTruthy();
    expect(screen.queryByText("AIによる要約(参考情報)")).toBeNull();
    expect(screen.queryByRole("button", { name: /印刷する/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /コピーする/ })).toBeNull();
  });

  it("「キャンセル」を押すとプレビューを閉じて入力に戻り、fetchは発行されない", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    render(<AiSummarySection topCategories={[]} />);

    typeFreeText("困りごと");
    fireEvent.click(screen.getByText("送信内容を確認"));
    await screen.findByText("送信内容を確認してください。");

    fireEvent.click(screen.getByText("キャンセル"));

    expect(await screen.findByText("送信内容を確認")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("API がエラーを返した場合はエラー表示に切り替わる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    render(<AiSummarySection topCategories={[]} />);

    typeFreeText("困りごと");
    fireEvent.click(screen.getByText("送信内容を確認"));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByText("同意して送信"));

    expect(await screen.findByText("要約の取得に失敗しました。もう一度お試しください。")).toBeTruthy();
  });

  it("autoStart を渡さない場合は従来通り入口ボタンが表示される(後方互換)", () => {
    render(<AiSummarySection topCategories={[]} autoStart={false} />);

    expect(screen.getByRole("button", { name: "AI に相談内容を要約してもらう(任意)" })).toBeTruthy();
    expect(screen.queryByLabelText("困りごとを入力(任意・スキップ可)")).toBeNull();
  });

  it("autoStart={true} の場合は入口ボタンを省略し、いきなりテキスト入力欄が表示される", () => {
    render(<AiSummarySection topCategories={[]} autoStart />);

    expect(screen.queryByRole("button", { name: "AI に相談内容を要約してもらう(任意)" })).toBeNull();
    expect(screen.getByLabelText("困りごとを入力(任意・スキップ可)")).toBeTruthy();
  });

  it("結果表示から「同じ内容で再送信」を押すと、入力内容を保持したまま送信内容確認画面に戻る", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ summary: "傾向の要約です。", isCrisisResponse: false }), { status: 200 }),
    );

    render(<AiSummarySection topCategories={["executive-function"]} />);

    typeFreeText("会議の内容を覚えておくのが難しい");
    fireEvent.click(screen.getByText("送信内容を確認"));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByText("同意して送信"));
    await screen.findByText("傾向の要約です。");

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("同じ内容で再送信"));

    await screen.findByText("送信内容を確認してください。");
    // 「もう一度入力する」と異なり、入力欄はクリアされず元のテキストが残る。
    expect(screen.getByText("入力テキスト: 「会議の内容を覚えておくのが難しい」")).toBeTruthy();
    // 再送信ボタンはまだ fetch を発行しない(改めて「同意して送信」を押すまで送信されない)。
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("同意して送信"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
