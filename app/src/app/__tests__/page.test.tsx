import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadSurveyProgress, saveSurveyProgress } from "@/features/survey/services/progress";

const listResults = vi.fn();
vi.mock("@/features/history/services/history-store", () => ({
  listResults: (...args: unknown[]) => listResults(...args),
}));

import Home from "@/app/page";

beforeEach(() => {
  // 履歴の導線(HistoryTopLink, TICKET-0026)は各テストの主眼ではないため、
  // 既定では「履歴なし」として扱う(個別テストで上書きする)。
  listResults.mockResolvedValue([]);
});

afterEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("トップ画面 (Home)", () => {
  it("非診断の免責文言が表示される(NFR-51・NFR-52)", async () => {
    render(await Home());

    expect(screen.getByText("これは医学的な診断ではありません。")).toBeTruthy();
    expect(screen.getByText("傾向を知るための、日常の困りごとチェックです。")).toBeTruthy();
  });

  it("所要時間の目安が表示される(FR-011・FR-013)", async () => {
    render(await Home());

    expect(screen.getByText("全30問・約5〜10分・途中から再開できます")).toBeTruthy();
    expect(screen.getByText("1画面に1問ずつ表示し、途中から再開できます。")).toBeTruthy();
    expect(screen.getByText("途中経過はこのブラウザにのみ保存します。")).toBeTruthy();
    expect(screen.getByText("日常の困りごとチェックの回答は、外部へ送信されません。")).toBeTruthy();
    expect(
      screen.getByText("AI を使う任意機能を利用した場合のみ、送信前に確認した内容を外部の生成 AI サービスへ送信します。"),
    ).toBeTruthy();
  });

  it("セルフチェックと相談先検索の入口を、本人・家族・支援者を限定せずに表示する", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { name: "Trait Compass — 発達特性と困りごとを整理し、支援への道しるべに" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "困りごとや特性を整理したい" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "相談先・支援情報を探したい" })).toBeTruthy();
    expect(screen.getByText("ご本人・ご家族・支援者の方が利用できます。")).toBeTruthy();
  });

  it("「はじめる」ボタンが /survey へのリンクとして表示され、保存済み進行状態を削除する(AC-4)", async () => {
    saveSurveyProgress({
      answeredCount: 10,
      lastQuestionId: "ND-0052",
      savedAt: "2026-07-04T00:00:00.000Z",
      answers: [{ questionId: "ND-0052", value: 2 }],
      currentIndex: 10,
    });
    render(await Home());

    const startLink = screen.getByText("日常の困りごとチェックをはじめる").closest("a");
    expect(startLink?.getAttribute("href")).toBe("/survey");
    fireEvent.click(screen.getByRole("button", { name: "日常の困りごとチェックをはじめる" }));
    expect(loadSurveyProgress()).toBeNull();
  });

  it("進行中データが無い場合は「前回の続きから」が表示されない(AC-5)", async () => {
    render(await Home());

    expect(screen.queryByText("前回の続きから")).toBeNull();
  });

  it("進行中データがある場合は「前回の続きから」が表示される(AC-5・AC-6)", async () => {
    saveSurveyProgress({
      answeredCount: 10,
      lastQuestionId: "ND-0052",
      savedAt: "2026-07-04T00:00:00.000Z",
      answers: [{ questionId: "ND-0052", value: 2 }],
      currentIndex: 10,
    });

    render(await Home());

    const resumeLink = await screen.findByText("前回の続きから");
    expect(resumeLink.closest("a")?.getAttribute("href")).toBe("/survey");
  });

  it("履歴が無い場合は「これまでの記録を見る」が表示されない(TICKET-0026)", async () => {
    render(await Home());

    await waitFor(() => {
      expect(listResults).toHaveBeenCalled();
    });
    expect(screen.queryByText("これまでの記録を見る")).toBeNull();
  });

  it("履歴が1件以上ある場合は「これまでの記録を見る」が /history への導線として表示される(TICKET-0026)", async () => {
    listResults.mockResolvedValue([
      {
        id: "entry-1",
        savedAt: "2026-06-01T00:00:00.000Z",
        categoryScores: {
          communication: 80,
          "social-reading": null,
          "emotion-regulation": null,
          "impulse-memory": null,
          "executive-function": null,
          "kindness-misread": null,
          sensory: null,
          motor: null,
          learning: null,
          "restricted-repetitive": null,
        },
        traitScores: { ASD: 80, ADHD: null, LD: null, DCD: null },
        grayZoneCount: 0,
        overlapCounts: {},
      },
    ]);

    render(await Home());

    const historyLink = await screen.findByText("これまでの記録を見る");
    expect(historyLink.closest("a")?.getAttribute("href")).toBe("/history");
  });

  it("常に「相談先・支援情報を探す」導線がタグ無しで /support へ遷移する(TICKET-0038 AC-1〜3)", async () => {
    render(await Home());

    const directSupportLink = screen.getByText("相談先・支援情報を探す").closest("a");
    expect(directSupportLink?.getAttribute("href")).toBe("/support");
  });

  it("お子さんについての相談先検索を、本人以外の利用者にも案内する", async () => {
    render(await Home());

    expect(screen.getByText(/お子さんについて相談したい方、ご家族・支援者として相談先を探したい方も/)).toBeTruthy();
    const supportLink = screen.getByText("相談先・支援情報を探す").closest("a");
    expect(supportLink?.getAttribute("href")).toBe("/support");
  });
});
