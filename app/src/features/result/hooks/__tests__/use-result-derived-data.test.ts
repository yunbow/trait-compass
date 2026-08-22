import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { __resetResultProgressForTests } from "@/features/result/hooks/useResultProgress";
import { useResultDerivedData } from "@/features/result/hooks/useResultDerivedData";
import { saveSurveyProgressState } from "@/features/survey/services/progress";
import type { Question } from "@/features/survey/schema/question";

// communication は2問回答(いずれも「よくある」=2、スコア100)、sensory は2問あるが未回答のまま
// (ResultView のテストと同じ構成: sensory は回答0件で null になる)。
const QUESTIONS: Question[] = [
  { id: "ND-0001", text: "会話で困る場面がある", category: "communication", traits: ["ASD"], grayZone: false },
  { id: "ND-0005", text: "社交辞令を真に受けてしまう", category: "communication", traits: ["ASD"], grayZone: false },
  { id: "ND-0009", text: "音や光がつらいことがある", category: "sensory", traits: ["ADHD"], grayZone: false },
  { id: "ND-0010", text: "特定の音が気になる", category: "sensory", traits: ["ADHD"], grayZone: false },
];

afterEach(() => {
  window.localStorage.clear();
  __resetResultProgressForTests();
});

describe("useResultDerivedData", () => {
  it("回答が無い場合は hasAnswers: false と空の topCategories/supportTags を返す", async () => {
    const { result } = renderHook(() => useResultDerivedData(QUESTIONS));

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    expect(result.current.hasAnswers).toBe(false);
    expect(result.current.topCategories).toEqual([]);
    expect(result.current.supportTags).toEqual([]);
  });

  it("回答がある場合は ResultView と同じロジックで topCategories・supportTags を算出する", async () => {
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0001", value: 2 },
        { questionId: "ND-0005", value: 2 },
      ],
      currentIndex: 2,
    });

    const { result } = renderHook(() => useResultDerivedData(QUESTIONS));

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    expect(result.current.hasAnswers).toBe(true);
    // communication は (2+2)/(2*2)*100 = 100 点、sensory は未回答のため対象外。
    expect(result.current.topCategories).toEqual(["communication"]);
    // スコア100は閾値(40)以上のため「対人・コミュニケーション」タグに変換される。
    expect(result.current.supportTags).toEqual(["対人・コミュニケーション"]);
  });

  it("回答はあるがどのカテゴリも閾値未満の場合、topCategories はあるが supportTags は空になりうる", async () => {
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0009", value: 0 },
        { questionId: "ND-0010", value: 1 },
      ],
      currentIndex: 2,
    });

    const { result } = renderHook(() => useResultDerivedData(QUESTIONS));

    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    expect(result.current.hasAnswers).toBe(true);
    // sensory は (0+1)/(2*2)*100 = 25 点。0点ではないため topCategories には含まれるが、
    // 支援タグの閾値(40)には届かない。
    expect(result.current.topCategories).toEqual(["sensory"]);
    expect(result.current.supportTags).toEqual([]);
  });
});
