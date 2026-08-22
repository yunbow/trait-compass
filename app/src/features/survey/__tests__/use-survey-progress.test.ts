import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { __resetSurveyProgressStoreForTests, useSurveyProgress } from "@/features/survey/hooks/useSurveyProgress";
import { loadSurveyProgress, saveSurveyProgressState } from "@/features/survey/services/progress";
import type { Question } from "@/features/survey/schema/question";

const QUESTIONS: Question[] = [
  { id: "ND-0001", text: "Q1(communication)", category: "communication", traits: ["ASD"], grayZone: false },
  { id: "ND-0002", text: "Q2(communication)", category: "communication", traits: ["ASD"], grayZone: false },
  { id: "ND-0003", text: "Q3(social-reading)", category: "social-reading", traits: ["ASD"], grayZone: false },
];

afterEach(() => {
  window.localStorage.clear();
  // モジュールスコープの外部ストアはテスト間で共有されるため、明示的にリセットする。
  __resetSurveyProgressStoreForTests();
});

describe("useSurveyProgress", () => {
  it("保存済みの進行状態が無い場合は先頭(index 0)から始まる", async () => {
    const { result } = renderHook(() => useSurveyProgress(QUESTIONS));

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.answers).toEqual([]);
    expect(result.current.currentAnswerValue).toBeUndefined();
  });

  it("保存済みの進行状態がある場合はその位置・回答から再開する(FR-015)", async () => {
    saveSurveyProgressState({
      answers: [{ questionId: "ND-0001", value: 2 }],
      currentIndex: 1,
    });

    const { result } = renderHook(() => useSurveyProgress(QUESTIONS));

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    expect(result.current.currentIndex).toBe(1);
    expect(result.current.answers).toEqual([{ questionId: "ND-0001", value: 2 }]);
    expect(result.current.currentAnswerValue).toBeUndefined(); // ND-0002 は未回答
  });

  it("answerCurrent で回答を追加し、次の設問へ進み、localStorage に保存する(FR-015)", async () => {
    const { result } = renderHook(() => useSurveyProgress(QUESTIONS));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() => {
      result.current.answerCurrent(2);
    });

    expect(result.current.currentIndex).toBe(1);
    expect(result.current.answers).toEqual([{ questionId: "ND-0001", value: 2 }]);

    const persisted = loadSurveyProgress();
    expect(persisted?.currentIndex).toBe(1);
    expect(persisted?.answers).toEqual([{ questionId: "ND-0001", value: 2 }]);
    expect(persisted?.lastQuestionId).toBe("ND-0001");
  });

  it("goToPrevious で前の設問へ戻り、回答は保持される(修正可)", async () => {
    const { result } = renderHook(() => useSurveyProgress(QUESTIONS));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() => result.current.answerCurrent(2)); // ND-0001 に回答 → index 1
    act(() => result.current.answerCurrent(1)); // ND-0002 に回答 → index 2
    act(() => result.current.goToPrevious()); // index 1 に戻る

    expect(result.current.currentIndex).toBe(1);
    expect(result.current.currentAnswerValue).toBe(1); // ND-0002 の既存回答が見える
    expect(result.current.answers).toHaveLength(2);
  });

  it("先頭(index 0)で goToPrevious を呼んでも何も起きない", async () => {
    const { result } = renderHook(() => useSurveyProgress(QUESTIONS));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() => result.current.goToPrevious());

    expect(result.current.currentIndex).toBe(0);
  });

  it("同じ設問に再回答すると値が上書きされる(戻って回答を修正するケース)", async () => {
    const { result } = renderHook(() => useSurveyProgress(QUESTIONS));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    act(() => result.current.answerCurrent(2)); // ND-0001 → index 1
    act(() => result.current.goToPrevious()); // index 0 に戻る
    act(() => result.current.answerCurrent(0)); // ND-0001 を「ない」に修正 → index 1

    expect(result.current.answers).toEqual([{ questionId: "ND-0001", value: 0 }]);
  });
});
