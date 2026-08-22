import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AskAiPanel } from "@/features/ask-ai/components/AskAiPanel";
import { FACILITY_PRESET_QUESTIONS, INSTITUTION_PRESET_QUESTIONS } from "@/features/ask-ai/services/preset-questions";

afterEach(() => {
  vi.restoreAllMocks();
});

const VALID_RESPONSE = {
  answer: "回答テキストです。",
  sources: [{ credit: "出典: テストデータセット(テスト組織)、cc-by-4.0", sourceUrl: null }],
  isFallback: false,
  fallbackMessage: null,
};

describe("AskAiPanel(TICKET-0048)", () => {
  it("自由記述入力欄(textarea/text input)を一切持たない(AC-2)", () => {
    render(<AskAiPanel target={{ type: "facility", facilityId: "fac-1" }} />);
    fireEvent.click(screen.getByRole("button", { name: /AIに質問する/ }));

    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("target.type='facility' の場合は窓口向け定型質問のみを表示する(AC-1)", () => {
    render(<AskAiPanel target={{ type: "facility", facilityId: "fac-1" }} />);
    fireEvent.click(screen.getByRole("button", { name: /AIに質問する/ }));

    for (const question of FACILITY_PRESET_QUESTIONS) {
      expect(screen.getByRole("button", { name: question.label })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: INSTITUTION_PRESET_QUESTIONS[0].label })).toBeNull();
  });

  it("target.type='institution' の場合は制度向け定型質問のみを表示する(AC-1)", () => {
    render(<AskAiPanel target={{ type: "institution" }} />);
    fireEvent.click(screen.getByRole("button", { name: /AIに質問する/ }));

    for (const question of INSTITUTION_PRESET_QUESTIONS) {
      expect(screen.getByRole("button", { name: question.label })).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: FACILITY_PRESET_QUESTIONS[0].label })).toBeNull();
  });

  it("質問を選んだだけでは fetch を一切発行しない(FR-041)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));

    render(<AskAiPanel target={{ type: "facility", facilityId: "fac-1" }} />);
    fireEvent.click(screen.getByRole("button", { name: /AIに質問する/ }));
    fireEvent.click(screen.getByRole("button", { name: FACILITY_PRESET_QUESTIONS[0].label }));

    await screen.findByText("送信内容を確認してください。");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("「同意して送信」をクリックしてはじめて /api/ask へ fetch する", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));

    render(<AskAiPanel target={{ type: "facility", facilityId: "fac-1" }} />);
    fireEvent.click(screen.getByRole("button", { name: /AIに質問する/ }));
    fireEvent.click(screen.getByRole("button", { name: FACILITY_PRESET_QUESTIONS[0].label }));
    await screen.findByText("送信内容を確認してください。");

    fireEvent.click(screen.getByRole("button", { name: "同意して送信" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/ask",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          targetType: "facility",
          questionId: FACILITY_PRESET_QUESTIONS[0].id,
          facilityId: "fac-1",
        }),
      }),
    );

    expect(await screen.findByText("回答テキストです。")).toBeTruthy();
    expect(screen.getByText("AIによる要約(参考情報)")).toBeTruthy();
  });

  it("回答結果には出典(SourceCredit)が表示される(AC-3)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));

    render(<AskAiPanel target={{ type: "institution" }} />);
    fireEvent.click(screen.getByRole("button", { name: /AIに質問する/ }));
    fireEvent.click(screen.getByRole("button", { name: INSTITUTION_PRESET_QUESTIONS[0].label }));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByRole("button", { name: "同意して送信" }));

    expect(await screen.findByText("出典: テストデータセット(テスト組織)、cc-by-4.0")).toBeTruthy();
  });

  it("defaultOpen=true の場合、初期表示は質問選択フォーム(formステップ)から始まる(AC専用ページ、TICKET-0048)", () => {
    render(<AskAiPanel target={{ type: "facility", facilityId: "fac-1" }} defaultOpen />);

    expect(screen.queryByRole("button", { name: /AIに質問する\(任意\)/ })).toBeNull();
    expect(screen.getByText("質問を選んでください")).toBeTruthy();
    for (const question of FACILITY_PRESET_QUESTIONS) {
      expect(screen.getByRole("button", { name: question.label })).toBeTruthy();
    }
  });

  it("defaultOpen を省略した場合(既定値 false)は、idleステップの「AIに質問する」ボタンから始まる", () => {
    render(<AskAiPanel target={{ type: "facility", facilityId: "fac-1" }} />);

    expect(screen.getByRole("button", { name: /AIに質問する\(任意\)/ })).toBeTruthy();
    expect(screen.queryByText("質問を選んでください")).toBeNull();
  });

  it("API がエラーを返した場合はエラー表示に切り替わる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    render(<AskAiPanel target={{ type: "institution" }} />);
    fireEvent.click(screen.getByRole("button", { name: /AIに質問する/ }));
    fireEvent.click(screen.getByRole("button", { name: INSTITUTION_PRESET_QUESTIONS[0].label }));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByRole("button", { name: "同意して送信" }));

    expect(await screen.findByText("回答の取得に失敗しました。もう一度お試しください。")).toBeTruthy();
  });
});
