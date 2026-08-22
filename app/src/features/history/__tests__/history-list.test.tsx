import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatSavedAt } from "@/features/history/components/HistoryCard";
import { HistoryList } from "@/features/history/components/HistoryList";
import type { HistoryEntry } from "@/features/history/services/history-store";
import type { CategoryScores, OverlapCounts, TraitScores } from "@/features/survey/services/scoring";

const listResults = vi.fn();
const deleteResult = vi.fn();
const clearAll = vi.fn();
const isHistoryEnabled = vi.fn();

vi.mock("@/features/history/services/history-store", () => ({
  listResults: (...args: unknown[]) => listResults(...args),
  deleteResult: (...args: unknown[]) => deleteResult(...args),
  clearAll: (...args: unknown[]) => clearAll(...args),
}));
vi.mock("@/features/history/services/settings", () => ({
  isHistoryEnabled: () => isHistoryEnabled(),
}));

const EMPTY_CATEGORY_SCORES: CategoryScores = {
  communication: null,
  "social-reading": null,
  "emotion-regulation": null,
  "impulse-memory": null,
  "executive-function": null,
  "kindness-misread": null,
  sensory: null,
  motor: null,
  learning: null,
  "restricted-repetitive": null,
};

const SAMPLE_TRAIT_SCORES: TraitScores = { ASD: 80, ADHD: null, LD: null, DCD: null };
const SAMPLE_OVERLAP_COUNTS: OverlapCounts = {};

function buildEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "entry-1",
    savedAt: "2026-06-01T00:00:00.000Z",
    categoryScores: { ...EMPTY_CATEGORY_SCORES, communication: 80 },
    traitScores: SAMPLE_TRAIT_SCORES,
    grayZoneCount: 0,
    overlapCounts: SAMPLE_OVERLAP_COUNTS,
    ...overrides,
  };
}

const DEFAULT_SAVED_AT_LABEL = formatSavedAt("2026-06-01T00:00:00.000Z");

afterEach(() => {
  vi.clearAllMocks();
});

describe("HistoryList: 読み込み中(IndexedDB解決待ち)", () => {
  it("listResults が解決するまでは Skeleton(aria-busy)を表示する", async () => {
    let resolveResults: (entries: HistoryEntry[]) => void = () => {};
    listResults.mockReturnValue(new Promise((resolve) => { resolveResults = resolve; }));
    isHistoryEnabled.mockReturnValue(false);

    render(<HistoryList />);

    expect(screen.getByLabelText("読み込み中")).toBeTruthy();
    expect(screen.queryByText("これまでの記録")).toBeNull();

    resolveResults([]);

    expect(await screen.findByRole("heading", { name: "履歴保存はオフです" })).toBeTruthy();
  });
});

describe("HistoryList: 空状態(AC-4)", () => {
  it("履歴保存が OFF かつ履歴が無い場合、機能 OFF の説明と設定画面へのリンクを表示する", async () => {
    listResults.mockResolvedValue([]);
    isHistoryEnabled.mockReturnValue(false);

    render(<HistoryList />);

    expect(await screen.findByRole("heading", { name: "履歴保存はオフです" })).toBeTruthy();
    expect(screen.getByText(/回答内容・地域・自由記述は保存しません/)).toBeTruthy();
    const settingsLink = screen.getByText("履歴保存を設定する");
    expect(settingsLink.closest("a")?.getAttribute("href")).toBe("/settings");
  });

  it("履歴保存が ON だが履歴が無い場合は「まだありません」の空状態を表示する", async () => {
    listResults.mockResolvedValue([]);
    isHistoryEnabled.mockReturnValue(true);

    render(<HistoryList />);

    expect(
      await screen.findByRole("heading", { name: "まだ保存した記録はありません" }),
    ).toBeTruthy();
  });
});

describe("HistoryList: 一覧表示(AC-1)", () => {
  it("listResults の返す順序どおりにカードを描画する(降順ソートはストア側の責務)", async () => {
    listResults.mockResolvedValue([
      buildEntry({ id: "new", savedAt: "2026-06-01T00:00:00.000Z" }),
      buildEntry({ id: "old", savedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    isHistoryEnabled.mockReturnValue(true);

    render(<HistoryList />);

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain(formatSavedAt("2026-06-01T00:00:00.000Z"));
    expect(items[1].textContent).toContain(formatSavedAt("2026-01-01T00:00:00.000Z"));
    expect(screen.getAllByText(/上位の傾向: 会話・伝え方/)).toHaveLength(2);
    expect(screen.getByText("保存済み 2件")).toBeTruthy();
  });
});

describe("HistoryList: 表示専用モードへの切り替え(AC-2, AC-5)", () => {
  it("カードを選択すると一覧を隠して詳細(ResultCharts)を表示し、リスタート等の導線は出さない", async () => {
    listResults.mockResolvedValue([buildEntry()]);
    isHistoryEnabled.mockReturnValue(true);

    render(<HistoryList />);
    fireEvent.click(await screen.findByRole("button", { name: "記録を見る" }));

    expect(await screen.findByText("会話・伝え方")).toBeTruthy();
    expect(screen.getByText("一覧へ戻る")).toBeTruthy();
    expect(screen.getByRole("button", { name: "地域の相談先を探す" }).closest("a")?.getAttribute("href")).toContain("/support?tags=");
    expect(screen.getByRole("button", { name: "今の状態を確認する" }).closest("a")?.getAttribute("href")).toBe("/survey");
    expect(screen.queryByText("この結果を履歴に保存")).toBeNull();
  });

  it("「一覧へ戻る」を押すと一覧表示に戻る", async () => {
    listResults.mockResolvedValue([buildEntry()]);
    isHistoryEnabled.mockReturnValue(true);

    render(<HistoryList />);
    fireEvent.click(await screen.findByRole("button", { name: "記録を見る" }));
    fireEvent.click(await screen.findByText("一覧へ戻る"));

    expect(await screen.findByText("これまでの記録")).toBeTruthy();
    expect(screen.getByRole("listitem")).toBeTruthy();
  });
});

describe("HistoryList: 個別削除(AC-3)", () => {
  it("削除ボタンは即座に削除せず、確認後に deleteResult を呼んで一覧から取り除く", async () => {
    listResults.mockResolvedValue([buildEntry({ id: "target" })]);
    isHistoryEnabled.mockReturnValue(true);
    deleteResult.mockResolvedValue(true);

    render(<HistoryList />);
    fireEvent.click(await screen.findByRole("button", { name: `${DEFAULT_SAVED_AT_LABEL}の履歴を削除` }));

    expect(deleteResult).not.toHaveBeenCalled();
    expect(await screen.findByText(`${DEFAULT_SAVED_AT_LABEL}の記録を削除しますか?元に戻せません。`)).toBeTruthy();

    fireEvent.click(screen.getByText("削除する"));

    await waitFor(() => {
      expect(deleteResult).toHaveBeenCalledWith("target");
    });
    expect(await screen.findByRole("heading", { name: "まだ保存した記録はありません" })).toBeTruthy();
  });

  it("キャンセルすると deleteResult を呼ばずカードが残る", async () => {
    listResults.mockResolvedValue([buildEntry({ id: "target" })]);
    isHistoryEnabled.mockReturnValue(true);

    render(<HistoryList />);
    fireEvent.click(await screen.findByRole("button", { name: `${DEFAULT_SAVED_AT_LABEL}の履歴を削除` }));
    fireEvent.click(await screen.findByText("キャンセル"));

    expect(deleteResult).not.toHaveBeenCalled();
    expect(screen.getByRole("listitem")).toBeTruthy();
  });
});

describe("HistoryList: 全削除(AC-3, NFR-37)", () => {
  it("確認ボタンを経てから clearAll を呼び、一覧を空にする", async () => {
    listResults.mockResolvedValue([buildEntry({ id: "a" }), buildEntry({ id: "b", savedAt: "2026-01-01T00:00:00.000Z" })]);
    isHistoryEnabled.mockReturnValue(true);
    clearAll.mockResolvedValue(true);

    render(<HistoryList />);
    fireEvent.click(await screen.findByText("全件削除"));

    expect(clearAll).not.toHaveBeenCalled();
    expect(await screen.findByText("保存されている2件の記録をすべて削除しますか?元に戻せません。")).toBeTruthy();

    fireEvent.click(screen.getByText("すべて削除する"));

    await waitFor(() => {
      expect(clearAll).toHaveBeenCalled();
    });
    expect(await screen.findByRole("heading", { name: "まだ保存した記録はありません" })).toBeTruthy();
  });
});
