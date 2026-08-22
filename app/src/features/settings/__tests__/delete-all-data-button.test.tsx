import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeleteAllDataButton } from "@/features/settings/components/DeleteAllDataButton";
import {
  loadSupportInputSelection,
  saveSupportInputSelection,
} from "@/features/support/services/support-input-storage";

const clearAll = vi.fn();
const clearSurveyProgress = vi.fn();
const saveSettings = vi.fn();

vi.mock("@/features/history/services/history-store", () => ({
  clearAll: (...args: unknown[]) => clearAll(...args),
}));
vi.mock("@/features/survey/services/progress", () => ({
  clearSurveyProgress: (...args: unknown[]) => clearSurveyProgress(...args),
}));
vi.mock("@/features/history/services/settings", () => ({
  DEFAULT_SETTINGS: { historyEnabled: false, currentLocationEnabled: false, supportInputMemoryEnabled: false, guideExplanationsEnabled: true },
  saveSettings: (...args: unknown[]) => saveSettings(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("DeleteAllDataButton(TICKET-0027, FR-054 AC-2, NFR-37)", () => {
  it("押下しても即座には削除されず、明示確認 UI を表示する", () => {
    render(<DeleteAllDataButton onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("このブラウザの保存データをすべて削除"));

    expect(screen.getByText("このブラウザに保存したデータをすべて削除しますか?")).toBeTruthy();
    expect(clearAll).not.toHaveBeenCalled();
  });

  it("キャンセルすると何も削除されない", () => {
    render(<DeleteAllDataButton onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("このブラウザの保存データをすべて削除"));
    fireEvent.click(screen.getByText("キャンセル"));

    expect(clearAll).not.toHaveBeenCalled();
    expect(clearSurveyProgress).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(screen.getByText("このブラウザの保存データをすべて削除")).toBeTruthy();
  });

  it("確認後は履歴(IndexedDB)・進行状態(localStorage)・設定の全てをクリアし、完了を通知する", async () => {
    clearAll.mockResolvedValue(true);
    const onDeleted = vi.fn();

    render(<DeleteAllDataButton onDeleted={onDeleted} />);

    fireEvent.click(screen.getByText("このブラウザの保存データをすべて削除"));
    fireEvent.click(screen.getByText("すべて削除"));

    expect(await screen.findByText("このブラウザに保存したデータを削除しました。")).toBeTruthy();
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(clearSurveyProgress).toHaveBeenCalledTimes(1);
    expect(saveSettings).toHaveBeenCalledWith({ historyEnabled: false, currentLocationEnabled: false, supportInputMemoryEnabled: false, guideExplanationsEnabled: true });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("確認後は /support の保存済み年齢・区市町村も削除する", async () => {
    clearAll.mockResolvedValue(true);
    saveSupportInputSelection({ lifestage: "working-adult", municipality: "新宿区" });

    render(<DeleteAllDataButton onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("このブラウザの保存データをすべて削除"));
    fireEvent.click(screen.getByText("すべて削除"));

    await screen.findByText("このブラウザに保存したデータを削除しました。");
    expect(loadSupportInputSelection()).toBeNull();
  });

  it("IndexedDB の削除に失敗した場合は失敗フィードバックを表示する", async () => {
    clearAll.mockResolvedValue(false);

    render(<DeleteAllDataButton onDeleted={vi.fn()} />);

    fireEvent.click(screen.getByText("このブラウザの保存データをすべて削除"));
    fireEvent.click(screen.getByText("すべて削除"));

    expect(await screen.findByText("一部のデータ削除に失敗しました。もう一度お試しください。")).toBeTruthy();
  });
});
