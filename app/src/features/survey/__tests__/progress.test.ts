import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SURVEY_PROGRESS_STORAGE_KEY,
  clearSurveyProgress,
  hasSurveyProgress,
  loadSurveyProgress,
  saveSurveyProgress,
  saveSurveyProgressState,
  type SurveyProgress,
} from "@/features/survey/services/progress";

const VALID_PROGRESS: SurveyProgress = {
  answeredCount: 3,
  lastQuestionId: "ND-0011",
  savedAt: "2026-07-04T00:00:00.000Z",
  answers: [
    { questionId: "ND-0001", value: 2 },
    { questionId: "ND-0005", value: 1 },
    { questionId: "ND-0011", value: 0 },
  ],
  currentIndex: 3,
};

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("loadSurveyProgress / saveSurveyProgress / clearSurveyProgress", () => {
  it("保存前は null を返す", () => {
    expect(loadSurveyProgress()).toBeNull();
    expect(hasSurveyProgress()).toBe(false);
  });

  it("保存した進行状態をそのまま読み込める", () => {
    saveSurveyProgress(VALID_PROGRESS);
    expect(loadSurveyProgress()).toEqual(VALID_PROGRESS);
    expect(hasSurveyProgress()).toBe(true);
  });

  it("clearSurveyProgress で削除できる", () => {
    saveSurveyProgress(VALID_PROGRESS);
    clearSurveyProgress();
    expect(loadSurveyProgress()).toBeNull();
    expect(hasSurveyProgress()).toBe(false);
  });

  it("スキーマ不正な値は null 扱いにする(壊れた JSON も含む)", () => {
    window.localStorage.setItem(SURVEY_PROGRESS_STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    expect(loadSurveyProgress()).toBeNull();

    window.localStorage.setItem(SURVEY_PROGRESS_STORAGE_KEY, "{not-json");
    expect(loadSurveyProgress()).toBeNull();
  });

  it("localStorage.getItem が例外を投げてもクラッシュせず null を返す(NFR-31)", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked in private browsing");
    });
    expect(() => loadSurveyProgress()).not.toThrow();
    expect(loadSurveyProgress()).toBeNull();
  });

  it("localStorage.setItem が例外を投げてもクラッシュしない(NFR-31)", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => saveSurveyProgress(VALID_PROGRESS)).not.toThrow();
  });

  it("localStorage.removeItem が例外を投げてもクラッシュしない(NFR-31)", () => {
    vi.spyOn(window.localStorage.__proto__, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearSurveyProgress()).not.toThrow();
  });
});

describe("saveSurveyProgressState(answers/currentIndex から保存する拡張ヘルパー, TICKET-0007)", () => {
  it("answers/currentIndex から answeredCount・lastQuestionId・savedAt を自動算出して保存する", () => {
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0001", value: 2 },
        { questionId: "ND-0005", value: 1 },
      ],
      currentIndex: 2,
    });

    const loaded = loadSurveyProgress();
    expect(loaded?.answeredCount).toBe(2);
    expect(loaded?.lastQuestionId).toBe("ND-0005");
    expect(loaded?.currentIndex).toBe(2);
    expect(loaded?.answers).toEqual([
      { questionId: "ND-0001", value: 2 },
      { questionId: "ND-0005", value: 1 },
    ]);
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("answers が空の場合は何も保存しない(lastQuestionId を算出できないため)", () => {
    saveSurveyProgressState({ answers: [], currentIndex: 0 });

    expect(loadSurveyProgress()).toBeNull();
  });

  it("同じ questionId を再度回答すると値が上書きされて保存できる(戻って修正するケース)", () => {
    saveSurveyProgressState({
      answers: [{ questionId: "ND-0001", value: 2 }],
      currentIndex: 1,
    });
    saveSurveyProgressState({
      answers: [{ questionId: "ND-0001", value: 0 }],
      currentIndex: 1,
    });

    expect(loadSurveyProgress()?.answers).toEqual([{ questionId: "ND-0001", value: 0 }]);
  });
});
