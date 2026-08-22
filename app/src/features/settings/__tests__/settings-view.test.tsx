import "fake-indexeddb/auto";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// InfoPageShell内のSmartBackLink(クライアントコンポーネント)がuseRouter()を呼ぶため、
// ReportPageShell/InfoPageShellのテストと同じ方針でnext/navigationをモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import { __resetHistoryStoreForTests, clearAll, listResults, saveResult } from "@/features/history/services/history-store";
import {
  isGuideExplanationsEnabled,
  isHistoryEnabled,
  isSupportInputMemoryEnabled,
  loadSettings,
} from "@/features/history/services/settings";
import { SettingsView } from "@/features/settings/components/SettingsView";
import { hasSurveyProgress, saveSurveyProgress } from "@/features/survey/services/progress";

const SAMPLE_HISTORY_INPUT = {
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
} as const;

afterEach(async () => {
  window.localStorage.clear();
  await clearAll();
  __resetHistoryStoreForTests();
});

describe("SettingsView: 履歴保存トグル(AC-1, AC-5)", () => {
  it("画面の目的説明と戻る導線を表示する", async () => {
    render(<SettingsView backHref="/" />);

    expect(await screen.findByText("このブラウザに保存する情報と、保存済みデータを管理できます。")).toBeTruthy();
    expect(screen.getByText("← 前の画面に戻る").closest("a")?.getAttribute("href")).toBe("/");
  });

  it("backHref に応じて戻り先を切り替える", async () => {
    render(<SettingsView backHref="/history" />);

    expect(screen.getByText("← 前の画面に戻る").closest("a")?.getAttribute("href")).toBe("/history");
  });

  it("初期状態は無効(OFF)で表示される", async () => {
    render(<SettingsView backHref="/" />);

    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "履歴の保存" }).getAttribute("aria-checked")).toBe("false");
    });
  });

  it("トグルを押すと即座に localStorage の設定へ永続化される(切替は即時保存)", async () => {
    render(<SettingsView backHref="/" />);

    const toggle = await screen.findByRole("switch", { name: "履歴の保存" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle.getAttribute("aria-checked")).toBe("true");
    });
    expect(isHistoryEnabled()).toBe(true);
    expect(loadSettings()).toEqual({ historyEnabled: true, currentLocationEnabled: false, supportInputMemoryEnabled: false, guideExplanationsEnabled: true });

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    });
    expect(isHistoryEnabled()).toBe(false);
  });
});

describe("SettingsView: 年齢と地域の保存トグル", () => {
  it("初期状態は無効で、切り替えると設定へ保存する", async () => {
    render(<SettingsView backHref="/" />);

    const toggle = await screen.findByRole("switch", { name: "年齢と地域の保存" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(isSupportInputMemoryEnabled()).toBe(true);
  });

  it("すべてのデータを削除後は無効に戻る", async () => {
    render(<SettingsView backHref="/" />);

    const toggle = await screen.findByRole("switch", { name: "年齢と地域の保存" });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));

    fireEvent.click(screen.getByText("このブラウザの保存データをすべて削除"));
    fireEvent.click(screen.getByText("すべて削除"));

    await screen.findByText("このブラウザに保存したデータを削除しました。");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});

describe("SettingsView: 結果画面の解説表示トグル", () => {
  it("初期状態は有効で、切り替えると設定へ保存する", async () => {
    render(<SettingsView backHref="/" />);

    const toggle = await screen.findByRole("switch", { name: "結果画面の解説を表示" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(isGuideExplanationsEnabled()).toBe(false);
  });
});

describe("SettingsView: すべてのデータを削除(AC-2, NFR-37)", () => {
  it("危険操作として通常の通知帯と区別できる見出しを表示する(TICKET-0037 AC-8)", async () => {
    render(<SettingsView backHref="/" />);

    expect(await screen.findByText("危険な操作")).toBeTruthy();
    expect(screen.getByText("このブラウザに保存した、回答途中のデータ・履歴・年齢と地域・設定をすべて削除します。")).toBeTruthy();
  });

  it("確認後、履歴(IndexedDB)・進行状態(localStorage)・設定の全てがクリアされる", async () => {
    // 事前に各ストアへデータを仕込む。
    await saveResult(SAMPLE_HISTORY_INPUT);
    saveSurveyProgress({
      answeredCount: 1,
      lastQuestionId: "ND-0001",
      savedAt: "2026-07-01T00:00:00.000Z",
      answers: [{ questionId: "ND-0001", value: 1 }],
      currentIndex: 1,
    });

    render(<SettingsView backHref="/" />);

    // トグルを ON にしておき、削除後に OFF へ戻ることも確認する。
    const toggle = await screen.findByRole("switch", { name: "履歴の保存" });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));

    expect(hasSurveyProgress()).toBe(true);
    expect((await listResults()).length).toBe(1);

    fireEvent.click(screen.getByText("このブラウザの保存データをすべて削除"));
    fireEvent.click(screen.getByText("すべて削除"));

    expect(await screen.findByText("このブラウザに保存したデータを削除しました。")).toBeTruthy();

    await waitFor(async () => {
      expect((await listResults()).length).toBe(0);
    });
    expect(hasSurveyProgress()).toBe(false);
    expect(loadSettings()).toEqual({ historyEnabled: false, currentLocationEnabled: false, supportInputMemoryEnabled: false, guideExplanationsEnabled: true });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });
});

describe("SettingsView: データ保存場所の説明(AC-3, NFR-32, NFR-63)", () => {
  it("保存場所(localStorage/IndexedDB)とサーバー送信有無を平易な文章で説明する", async () => {
    render(<SettingsView backHref="/" />);

    expect(
      await screen.findByText("回答の進行状況とこの設定内容は、このブラウザ内に保存します。"),
    ).toBeTruthy();
    expect(
      screen.getByText("履歴に保存した結果(スコアなど)は、このブラウザ内に保存します。"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "サーバーへの送信は行いません。結果画面で共有 URL をご自身で発行した場合のみ、その内容が URL に含まれます。一度共有した URL は、この画面からデータを削除しても無効にはなりません。共有した相手が URL を保持している場合、そのURLから内容を確認できます。",
      ),
    ).toBeTruthy();
  });

  it("プライバシーポリシーへのリンクを表示する", async () => {
    render(<SettingsView backHref="/" />);

    const link = await screen.findByText("プライバシーポリシー");
    expect(link.closest("a")?.getAttribute("href")).toBe("/privacy");
  });
});
