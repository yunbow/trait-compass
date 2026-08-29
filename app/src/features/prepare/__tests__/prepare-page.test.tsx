import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PreparePage } from "@/features/prepare/components/PreparePage";
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
  window.history.replaceState(null, "", "/result/prepare");
});

function answerSomeQuestions() {
  saveSurveyProgressState({
    answers: [
      { questionId: "ND-0001", value: 2 },
      { questionId: "ND-0005", value: 2 },
    ],
    currentIndex: 2,
  });
}

describe("PreparePage", () => {
  it("回答が無い場合は空状態(チェックを始める/結果画面へ戻る導線)を表示する", async () => {
    render(<PreparePage questions={QUESTIONS} />);

    expect(await screen.findByText("まだ回答がありません。")).toBeTruthy();
    const surveyLink = screen.getByText("チェックを始める");
    expect(surveyLink.closest("a")?.getAttribute("href")).toBe("/survey");
    const resultLink = screen.getByText("結果画面へ戻る");
    expect(resultLink.closest("a")?.getAttribute("href")).toBe("/result");

    // 空状態では作り方選択・PreparePanel の入力欄も表示されない。
    expect(screen.queryByText("選んだ項目からメモを作る")).toBeNull();
    expect(screen.queryByLabelText("お住まいの区市町村")).toBeNull();
  });

  it("共有結果閲覧(#r=...)の場合はブロックメッセージのみ表示し、作り方選択・各モードは表示しない", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });
    window.history.replaceState(null, "", "/result/prepare#r=v1.dummy");

    render(<PreparePage questions={QUESTIONS} />);

    expect(
      await screen.findByText("この機能は、共有された結果の閲覧では利用できません。"),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "← 結果に戻る" }).getAttribute("href")).toBe("/result");

    expect(screen.queryByText("選んだ項目からメモを作る")).toBeNull();
    expect(screen.queryByLabelText("お住まいの区市町村")).toBeNull();
    expect(screen.queryByLabelText("困りごとを入力(任意・スキップ可)")).toBeNull();
  });

  it("回答がある場合は「結果に戻る」リンクと「作り方を選ぶ」ステップ(モードチューザー)を表示する", async () => {
    answerSomeQuestions();

    render(<PreparePage questions={QUESTIONS} />);

    expect(await screen.findByRole("link", { name: "← 結果に戻る" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "← 結果に戻る" }).getAttribute("href")).toBe("/result");
    expect(screen.getByText("相談時に渡すメモを作る")).toBeTruthy();

    // 非診断免責(DisclaimerNotice)を表示する。
    expect(screen.getByText("これは医学的な診断ではありません。")).toBeTruthy();

    // 初期状態では作り方選択のみが表示され、どちらのモードもまだ表示されない。
    expect(screen.getByText("選んだ項目からメモを作る")).toBeTruthy();
    expect(screen.getByText("自由記述をAIで整理してメモを作る")).toBeTruthy();
    expect(screen.queryByLabelText("お住まいの区市町村")).toBeNull();
    expect(screen.queryByLabelText("困りごとを入力(任意・スキップ可)")).toBeNull();
  });

  it("「選んだ項目からメモを作る」を選ぶと PreparePanel が autoStart 表示される", async () => {
    answerSomeQuestions();

    render(<PreparePage questions={QUESTIONS} />);

    fireEvent.click(await screen.findByText("選んだ項目からメモを作る"));

    expect(screen.getByLabelText("お住まいの区市町村")).toBeTruthy();
    // 結果画面から引き継いだ上位カテゴリが表示される。
    expect(screen.getByText("会話・伝え方")).toBeTruthy();
    // 作り方選択カードは消え、選び直しボタンに置き換わる。
    expect(screen.queryByText("選んだ項目からメモを作る")).toBeNull();
    expect(screen.getByRole("button", { name: /作り方を選び直す/ })).toBeTruthy();
  });

  it("「自由記述をAIで整理してメモを作る」を選ぶと AiSummarySection が autoStart 表示される", async () => {
    answerSomeQuestions();

    render(<PreparePage questions={QUESTIONS} />);

    fireEvent.click(await screen.findByText("自由記述をAIで整理してメモを作る"));

    expect(screen.getByLabelText("困りごとを入力(任意・スキップ可)")).toBeTruthy();
    expect(screen.queryByText("選んだ項目からメモを作る")).toBeNull();
    expect(screen.getByRole("button", { name: /作り方を選び直す/ })).toBeTruthy();
  });

  it("「作り方を選び直す」を押すとモード選択に戻る", async () => {
    answerSomeQuestions();

    render(<PreparePage questions={QUESTIONS} />);

    fireEvent.click(await screen.findByText("選んだ項目からメモを作る"));
    expect(screen.getByLabelText("お住まいの区市町村")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /作り方を選び直す/ }));

    expect(screen.getByText("選んだ項目からメモを作る")).toBeTruthy();
    expect(screen.getByText("自由記述をAIで整理してメモを作る")).toBeTruthy();
    expect(screen.queryByLabelText("お住まいの区市町村")).toBeNull();
  });

  it("initialMode=\"select\" の場合は作り方選択を経ずに PreparePanel へ直行する", async () => {
    answerSomeQuestions();

    render(<PreparePage questions={QUESTIONS} initialMode="select" />);

    expect(await screen.findByLabelText("お住まいの区市町村")).toBeTruthy();
    expect(screen.queryByText("選んだ項目からメモを作る")).toBeNull();
    expect(screen.queryByLabelText("困りごとを入力(任意・スキップ可)")).toBeNull();
  });

  it("initialMode=\"ai\" の場合は作り方選択を経ずに AiSummarySection へ直行する(旧 /result/summarize からのリダイレクト相当)", async () => {
    answerSomeQuestions();

    render(<PreparePage questions={QUESTIONS} initialMode="ai" />);

    expect(await screen.findByLabelText("困りごとを入力(任意・スキップ可)")).toBeTruthy();
    expect(screen.queryByText("選んだ項目からメモを作る")).toBeNull();
    expect(screen.queryByLabelText("お住まいの区市町村")).toBeNull();
  });

  it("支援情報検索から引き継いだ年齢・地域があれば、未回答でも相談メモを作れる(initialMode=select)", async () => {
    render(
      <PreparePage
        questions={QUESTIONS}
        initialAgeGroup="child"
        initialMunicipality="台東区"
        initialMunicipalityCode="13106"
        initialLifestage="preschool"
        prefillTags={["対人・コミュニケーション"]}
        initialMode="select"
      />,
    );

    expect(await screen.findByText("相談時に渡すメモを作る")).toBeTruthy();
    expect(screen.queryByText("まだ回答がありません。")).toBeNull();
    expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("台東区");
    expect(screen.getByRole("button", { name: "自分について" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("検索結果から引き継いだ年齢(ライフステージ)・区市町村・タグをフォームにプリフィルする(initialMode=select)", async () => {
    saveSurveyProgressState({
      answers: [{ questionId: "ND-0001", value: 2 }],
      currentIndex: 1,
    });

    render(
      <PreparePage
        questions={QUESTIONS}
        initialAgeGroup="adult"
        initialMunicipality="台東区"
        initialMunicipalityCode="13106"
        initialLifestage="working-adult"
        prefillTags={["対人・コミュニケーション"]}
        initialMode="select"
      />,
    );

    expect((await screen.findByRole("button", { name: "社会人" })).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("台東区");
    expect(screen.getByRole("button", { name: "対人・コミュニケーション" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("prefillTags=[](/support/results で明示的に「全般」を選んだ場合)は、端末に残る自己チェック結果由来のタグへフォールバックしない(2026-08是正)", async () => {
    // 「communication」カテゴリの回答があるため、フォールバックすれば「対人・コミュニケーション」が
    // 選択されてしまう。prefillTags=[] を優先すればどのタグも選択されないはずである。
    answerSomeQuestions();

    render(
      <PreparePage
        questions={QUESTIONS}
        initialAgeGroup="adult"
        initialMunicipality="台東区"
        initialMunicipalityCode="13106"
        prefillTags={[]}
        initialMode="select"
      />,
    );

    expect(await screen.findByText("相談時に渡すメモを作る")).toBeTruthy();
    expect(screen.getByRole("button", { name: "対人・コミュニケーション" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("検索結果画面から遷移した場合、戻りリンク(/support/results)は age・municipality に加えて lifestage も引き継ぐ", async () => {
    render(
      <PreparePage
        questions={QUESTIONS}
        initialAgeGroup="child"
        initialMunicipality="台東区"
        initialMunicipalityCode="13106"
        initialLifestage="preschool"
        initialMode="select"
      />,
    );

    const backLink = await screen.findByRole("link", { name: "← 前の画面に戻る" });
    const href = backLink.getAttribute("href") ?? "";
    expect(href).toContain("age=child");
    expect(href).toContain("municipality=13106");
    expect(href).toContain("lifestage=preschool");
  });
});
