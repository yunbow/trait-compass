import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RecommendPage } from "@/features/recommend/components/RecommendPage";
import { __resetResultProgressForTests } from "@/features/result/hooks/useResultProgress";
import { __resetSharedResultHashForTests } from "@/features/result/hooks/useSharedResultHash";
import { saveSurveyProgressState } from "@/features/survey/services/progress";
import type { Question } from "@/features/survey/schema/question";

const QUESTIONS: Question[] = [
  { id: "ND-0001", text: "会話で困る場面がある", category: "communication", traits: ["ASD"], grayZone: false },
  { id: "ND-0005", text: "社交辞令を真に受けてしまう", category: "communication", traits: ["ASD"], grayZone: false },
];

afterEach(() => {
  window.localStorage.clear();
  __resetResultProgressForTests();
  __resetSharedResultHashForTests();
  window.history.replaceState(null, "", "/result/recommend");
});

describe("RecommendPage", () => {
  it("回答が無い場合は空状態(チェックを始める/結果画面へ戻る導線)を表示する", async () => {
    render(<RecommendPage questions={QUESTIONS} />);

    expect(await screen.findByText("まだ回答がありません。")).toBeTruthy();
    const surveyLink = screen.getByText("チェックを始める");
    expect(surveyLink.closest("a")?.getAttribute("href")).toBe("/survey");
    const resultLink = screen.getByText("結果画面へ戻る");
    expect(resultLink.closest("a")?.getAttribute("href")).toBe("/result");

    expect(screen.queryByLabelText("相談したい内容")).toBeNull();
  });

  it("支援情報検索から引き継いだ年齢・地域があれば、未回答でも相談先を絞り込める", async () => {
    render(
      <RecommendPage
        questions={QUESTIONS}
        initialAgeGroup="child"
        initialMunicipality="台東区"
        initialMunicipalityCode="13106"
        initialLifestage="preschool"
        initialPurposeId="consult-development"
        prefillTags={["対人・コミュニケーション"]}
      />,
    );

    expect(await screen.findByRole("heading", { name: "条件に合う相談先を絞り込む" })).toBeTruthy();
    expect(screen.queryByText("まだ回答がありません。")).toBeNull();
    expect((screen.getByLabelText("お住まいの区市町村") as HTMLInputElement).value).toBe("台東区");
    expect(screen.getByRole("link", { name: "通常の条件検索で、台東区の相談先一覧を見る" }).getAttribute("href")).toContain("purpose=consult-development");
  });

  it("共有結果閲覧(#r=...)の場合はブロックメッセージのみ表示し、RecommendHintSection は表示しない", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });
    window.history.replaceState(null, "", "/result/recommend#r=v1.dummy");

    render(<RecommendPage questions={QUESTIONS} />);

    expect(
      await screen.findByText("この機能は、共有された結果の閲覧では利用できません。"),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "← 結果に戻る" }).getAttribute("href")).toBe("/result");

    expect(screen.queryByLabelText("相談したい内容")).toBeNull();
    expect(screen.queryByText(/相談先のヒントを見る/)).toBeNull();
  });

  it("回答がある場合は「結果に戻る」リンクと RecommendHintSection(フォーム)を autoStart 表示する", async () => {
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0001", value: 2 },
        { questionId: "ND-0005", value: 2 },
      ],
      currentIndex: 2,
    });

    render(<RecommendPage questions={QUESTIONS} />);

    expect(await screen.findByRole("link", { name: "← 結果に戻る" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "← 結果に戻る" }).getAttribute("href")).toBe("/result");

    expect(screen.getByText("これは医学的な診断ではありません。")).toBeTruthy();

    // autoStart のため入口ボタンを介さずいきなりフォームが表示される。
    expect(screen.queryByRole("button", { name: /相談先のヒントを見る/ })).toBeNull();
    expect(screen.getByLabelText("相談したい内容")).toBeTruthy();
    expect(screen.getByLabelText("お住まいの区市町村")).toBeTruthy();
  });

  it("/support/results からのプリフィル値(ライフステージ含む)をフォームに渡す", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });

    render(
      <RecommendPage
        questions={QUESTIONS}
        initialAgeGroup="adult"
        initialMunicipality="台東区"
        initialMunicipalityCode="13106"
        initialLifestage="working-adult"
        prefillTags={["こだわり"]}
      />,
    );

    expect(await screen.findByRole("button", { name: "社会人", pressed: true })).toBeTruthy();
    expect((screen.getByLabelText("お住まいの区市町村") as HTMLInputElement).value).toBe("台東区");
    expect(screen.getByRole("button", { name: "こだわり", pressed: true })).toBeTruthy();
  });

  it("lifestage が無い(URLが古い/改ざんされている等)場合、年齢の選択肢は未選択のまま表示される", async () => {
    render(
      <RecommendPage
        questions={QUESTIONS}
        initialAgeGroup="adult"
        initialMunicipality="台東区"
        initialMunicipalityCode="13106"
      />,
    );

    expect(await screen.findByLabelText("お住まいの区市町村")).toBeTruthy();
    expect(screen.getByRole("button", { name: "社会人" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "未就学児" }).getAttribute("aria-pressed")).toBe("false");
  });
});
