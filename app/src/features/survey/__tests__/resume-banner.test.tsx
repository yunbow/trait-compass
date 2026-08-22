import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResumeBanner } from "@/features/survey/components/ResumeBanner";
import { saveSurveyProgress } from "@/features/survey/services/progress";

afterEach(() => {
  window.localStorage.clear();
});

describe("ResumeBanner", () => {
  it("進行中データが無い場合は「前回の続きから」を表示しない", async () => {
    render(<ResumeBanner />);

    // useEffect 後も表示されないことを確認する(マウント直後の状態と一致させて確認)。
    await waitFor(() => {
      expect(screen.queryByText("前回の続きから")).toBeNull();
    });
  });

  it("進行中データがある場合は「前回の続きから」を表示する", async () => {
    saveSurveyProgress({
      answeredCount: 5,
      lastQuestionId: "ND-0021",
      savedAt: "2026-07-04T00:00:00.000Z",
      answers: [{ questionId: "ND-0021", value: 1 }],
      currentIndex: 5,
    });

    render(<ResumeBanner />);

    const link = await screen.findByText("前回の続きから");
    expect(link.closest("a")?.getAttribute("href")).toBe("/survey");
  });
});
