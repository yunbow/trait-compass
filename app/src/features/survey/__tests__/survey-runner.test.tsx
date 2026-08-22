import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SurveyRunner } from "@/features/survey/components/SurveyRunner";
import { __resetSurveyProgressStoreForTests } from "@/features/survey/hooks/useSurveyProgress";
import type { Question } from "@/features/survey/schema/question";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// 1問目・2問目は同じカテゴリ、3問目で communication → social-reading に変わる構成
// (カテゴリ変わり目トランジションの検証に使う)。
const QUESTIONS: Question[] = [
  { id: "ND-0001", text: "会話で困る場面がある", category: "communication", traits: ["ASD"], grayZone: false },
  { id: "ND-0002", text: "話の要点をまとめるのが難しい", category: "communication", traits: ["ASD"], grayZone: false },
  { id: "ND-0003", text: "相手の表情を読み取るのが難しい", category: "social-reading", traits: ["ASD"], grayZone: false },
];

afterEach(() => {
  window.localStorage.clear();
  __resetSurveyProgressStoreForTests();
  push.mockClear();
});

describe("SurveyRunner", () => {
  it("1画面に1問だけ表示する(FR-013)", async () => {
    render(<SurveyRunner questions={QUESTIONS} />);

    expect(await screen.findByText("会話で困る場面がある")).toBeTruthy();
    expect(screen.getByText("← 中断してトップへ戻る").closest("a")?.getAttribute("href")).toBe("/");
    expect(screen.getByText("質問 1 / 3")).toBeTruthy();
    expect(screen.queryByText("話の要点をまとめるのが難しい")).toBeNull();
    expect(screen.queryByText("相手の表情を読み取るのが難しい")).toBeNull();
  });

  it("回答選択肢に迷いを減らす補助文を表示する(TICKET-0037 AC-5)", async () => {
    render(<SurveyRunner questions={QUESTIONS} />);

    await screen.findByText("会話で困る場面がある");

    expect(screen.getByText("日常的にある、または最近も何度かある")).toBeTruthy();
    expect(screen.getByText("たまにある、または場面によってある")).toBeTruthy();
    expect(screen.getByText("ほぼない")).toBeTruthy();
  });

  it("回答すると同カテゴリ内では次の設問へ自動的に進む", async () => {
    render(<SurveyRunner questions={QUESTIONS} />);
    await screen.findByText("会話で困る場面がある");

    fireEvent.click(screen.getByText("よくある"));

    expect(await screen.findByText("話の要点をまとめるのが難しい")).toBeTruthy();
  });

  it("回答直後は選んだ選択肢にチェックが付いた状態を一瞬表示してから次の設問へ進む", async () => {
    render(<SurveyRunner questions={QUESTIONS} />);
    await screen.findByText("会話で困る場面がある");

    fireEvent.click(screen.getByText("よくある"));

    // ANSWER_FEEDBACK_DELAY_MS が経過するまでは、選んだボタンに選択状態が付いたまま
    // 同じ設問が表示され続ける(TICKET-0037想定の「今どれを選んだか分かる」確認表示)。
    expect(screen.getByText("会話で困る場面がある")).toBeTruthy();
    expect(screen.getByRole("button", { name: /よくある/ }).getAttribute("aria-pressed")).toBe("true");

    await waitFor(() => expect(screen.getByText("話の要点をまとめるのが難しい")).toBeTruthy());
  });

  it("カテゴリの変わり目では一呼吸トランジション画面を挟む(FR-014)", async () => {
    render(<SurveyRunner questions={QUESTIONS} />);
    await screen.findByText("会話で困る場面がある");

    fireEvent.click(screen.getByText("よくある"));
    await screen.findByText("話の要点をまとめるのが難しい");
    fireEvent.click(screen.getByText("よくある"));

    // 3問目(社会性カテゴリ)へ進む前に、トランジション画面が表示される。
    expect(await screen.findByText("場の空気・人の気持ち")).toBeTruthy();
    expect(screen.queryByText("相手の表情を読み取るのが難しい")).toBeNull();

    fireEvent.click(screen.getByText("すぐ進む"));

    expect(await screen.findByText("相手の表情を読み取るのが難しい")).toBeTruthy();
  });

  it("「前の質問へ」で戻ると回答を修正できる", async () => {
    render(<SurveyRunner questions={QUESTIONS} />);
    await screen.findByText("会話で困る場面がある");

    fireEvent.click(screen.getByText("よくある"));
    await screen.findByText("話の要点をまとめるのが難しい");

    fireEvent.click(screen.getByText("前の質問へ"));

    await waitFor(() => expect(screen.getByText("会話で困る場面がある")).toBeTruthy());
  });

  it("全問回答後は「結果を見る」ボタンを表示する", async () => {
    render(<SurveyRunner questions={QUESTIONS} />);
    await screen.findByText("会話で困る場面がある");

    fireEvent.click(screen.getByText("よくある"));
    await screen.findByText("話の要点をまとめるのが難しい");
    fireEvent.click(screen.getByText("よくある"));
    await screen.findByText("場の空気・人の気持ち");
    fireEvent.click(screen.getByText("すぐ進む"));
    await screen.findByText("相手の表情を読み取るのが難しい");
    fireEvent.click(screen.getByText("よくある"));

    expect(await screen.findByText("結果を見る")).toBeTruthy();

    fireEvent.click(screen.getByText("結果を見る"));
    // handleFinish は QA ログの flush(TICKET-0030, no-op)を待ってから push するため非同期。
    await waitFor(() => expect(push).toHaveBeenCalledWith("/result"));
  });

  it("早期スキップは確認ダイアログを経てから結果へ遷移し、キャンセル時は遷移しない(FR-01A)", async () => {
    render(<SurveyRunner questions={QUESTIONS} />);
    await screen.findByText("会話で困る場面がある");

    fireEvent.click(screen.getByText("ここまでの回答で途中結果を見る"));

    expect(await screen.findByText("未回答のカテゴリは結果に表示されません。")).toBeTruthy();

    // キャンセル(「続ける」)では遷移しない。
    fireEvent.click(screen.getByText("続ける"));
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("未回答のカテゴリは結果に表示されません。")).toBeNull());

    // 再度開いて確定すると /result へ遷移する。
    fireEvent.click(screen.getByText("ここまでの回答で途中結果を見る"));
    await screen.findByText("未回答のカテゴリは結果に表示されません。");
    fireEvent.click(screen.getByRole("button", { name: "途中結果を見る" }));

    // handleSkipConfirmed も QA ログの flush(TICKET-0030, no-op)を待ってから push するため非同期。
    await waitFor(() => expect(push).toHaveBeenCalledWith("/result"));
  });
});
