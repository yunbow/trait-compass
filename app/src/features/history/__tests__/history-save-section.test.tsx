import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistorySaveSection } from "@/features/history/components/HistorySaveSection";
import type { ShareData } from "@/features/result/services/share-codec";

const saveResult = vi.fn();
const isHistoryEnabled = vi.fn();
const setHistoryEnabled = vi.fn();

vi.mock("@/features/history/services/history-store", () => ({
  saveResult: (...args: unknown[]) => saveResult(...args),
}));
vi.mock("@/features/history/services/settings", () => ({
  isHistoryEnabled: () => isHistoryEnabled(),
  setHistoryEnabled: (...args: unknown[]) => setHistoryEnabled(...args),
}));

const SAMPLE_RESULT_DATA: ShareData = {
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
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("HistorySaveSection: 履歴保存が有効な場合(TICKET-0025)", () => {
  it("押下すると即座に保存し、成功フィードバックを表示する", async () => {
    isHistoryEnabled.mockReturnValue(true);
    saveResult.mockResolvedValue(true);

    render(<HistorySaveSection resultData={SAMPLE_RESULT_DATA} />);
    fireEvent.click(screen.getByText("この結果を履歴に保存"));

    expect(await screen.findByText("履歴に保存しました。")).toBeTruthy();
    expect(saveResult).toHaveBeenCalledWith(SAMPLE_RESULT_DATA);
    expect(setHistoryEnabled).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "履歴を見る" }).getAttribute("href")).toBe("/history");
  });

  it("保存に失敗した場合は失敗フィードバックを表示する", async () => {
    isHistoryEnabled.mockReturnValue(true);
    saveResult.mockResolvedValue(false);

    render(<HistorySaveSection resultData={SAMPLE_RESULT_DATA} />);
    fireEvent.click(screen.getByText("この結果を履歴に保存"));

    expect(await screen.findByText("履歴の保存に失敗しました。もう一度お試しください。")).toBeTruthy();
  });
});

describe("HistorySaveSection: 履歴保存が無効(デフォルト)の場合(FR-051, NFR-36/37)", () => {
  it("押下しても即座には保存されず、明示同意 UI を表示する", async () => {
    isHistoryEnabled.mockReturnValue(false);

    render(<HistorySaveSection resultData={SAMPLE_RESULT_DATA} />);
    fireEvent.click(screen.getByText("この結果を履歴に保存"));

    expect(await screen.findByText("履歴保存は設定で無効になっています。")).toBeTruthy();
    expect(saveResult).not.toHaveBeenCalled();
    expect(setHistoryEnabled).not.toHaveBeenCalled();
  });

  it("キャンセルすると保存も設定変更も行わない", async () => {
    isHistoryEnabled.mockReturnValue(false);

    render(<HistorySaveSection resultData={SAMPLE_RESULT_DATA} />);
    fireEvent.click(screen.getByText("この結果を履歴に保存"));
    fireEvent.click(await screen.findByText("キャンセル"));

    expect(await screen.findByText("この結果を履歴に保存")).toBeTruthy();
    expect(saveResult).not.toHaveBeenCalled();
    expect(setHistoryEnabled).not.toHaveBeenCalled();
  });

  it("同意すると historyEnabled を true にしてから保存する", async () => {
    isHistoryEnabled.mockReturnValue(false);
    saveResult.mockResolvedValue(true);

    render(<HistorySaveSection resultData={SAMPLE_RESULT_DATA} />);
    fireEvent.click(screen.getByText("この結果を履歴に保存"));
    fireEvent.click(await screen.findByText("有効にして保存する"));

    await waitFor(() => {
      expect(setHistoryEnabled).toHaveBeenCalledWith(true);
    });
    expect(saveResult).toHaveBeenCalledWith(SAMPLE_RESULT_DATA);
    expect(await screen.findByText("履歴に保存しました。")).toBeTruthy();
  });
});
