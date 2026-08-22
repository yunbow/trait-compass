import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResultView } from "@/features/result/components/ResultView";
import { __resetResultProgressForTests } from "@/features/result/hooks/useResultProgress";
import { __resetSharedResultHashForTests } from "@/features/result/hooks/useSharedResultHash";
import { buildShareHash } from "@/features/result/services/share-codec";
import type { ShareData } from "@/features/result/services/share-codec";
import { loadSurveyProgress, saveSurveyProgressState } from "@/features/survey/services/progress";
import type { Question } from "@/features/survey/schema/question";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// communication は2問回答(いずれも「よくある」=2)、sensory は1問あるが未回答のまま
// (→ sensory カテゴリ・DCD以外の特性は「回答0件」で null になる構成)。
const QUESTIONS: Question[] = [
  { id: "ND-0001", text: "会話で困る場面がある", category: "communication", traits: ["ASD"], grayZone: false },
  { id: "ND-0005", text: "社交辞令を真に受けてしまう", category: "communication", traits: ["ASD"], grayZone: false },
  { id: "ND-0009", text: "音や光がつらいことがある", category: "sensory", traits: ["ADHD"], grayZone: false },
];

afterEach(() => {
  window.localStorage.clear();
  __resetResultProgressForTests();
  __resetSharedResultHashForTests();
  window.history.replaceState(null, "", "/result");
  push.mockClear();
});

describe("ResultView", () => {
  it("回答が無い場合は「まだ回答がありません」とトップへの導線を表示する", async () => {
    render(<ResultView questions={QUESTIONS} />);

    expect(await screen.findByText("まだ回答がありません。")).toBeTruthy();
    const surveyLink = screen.getByText("チェックを始める");
    expect(surveyLink.closest("a")?.getAttribute("href")).toBe("/survey");
    const link = screen.getByText("トップへ戻る");
    expect(link.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("モック回答からスコアを算出し、レーダーチャートに反映する", async () => {
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0001", value: 2 },
        { questionId: "ND-0005", value: 2 },
      ],
      currentIndex: 2,
    });

    render(<ResultView questions={QUESTIONS} />);

    // communication は (2+2)/(2*2)*100 = 100 点として描画される。
    expect((await screen.findAllByText("会話・伝え方")).length).toBeGreaterThan(0);
    expect(screen.queryByText("まだ回答がありません。")).toBeNull();

    // 上位カテゴリ解説にも質的表現(高め)が表示される(パーセンテージは表示しない)。
    expect(screen.getAllByText("高め").length).toBeGreaterThan(0);
    expect(screen.queryByText("100%")).toBeNull();
  });

  it("上位カテゴリのサマリーと図の読み方を表示する", async () => {
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0001", value: 2 },
        { questionId: "ND-0005", value: 2 },
      ],
      currentIndex: 2,
    });

    render(<ResultView questions={QUESTIONS} />);

    expect(await screen.findByText("今回「よくある」が多かった領域")).toBeTruthy();
    expect(screen.getByText("回答をもとに、当てはまる回答が多かった領域を上から表示しています。")).toBeTruthy();
    expect(screen.getByText("点が外側にあるほど、その領域の傾向が回答内で高めに出ている目安です。")).toBeTruthy();
    expect(screen.getByText("複数の場面にまたがって表れている困りごとを整理しています。")).toBeTruthy();
  });

  it("回答が0件のカテゴリはレーダーチャート上で「未算出」として表示し、実数値と区別する(AC-2)", async () => {
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0001", value: 2 },
        { questionId: "ND-0005", value: 2 },
      ],
      currentIndex: 2,
    });

    render(<ResultView questions={QUESTIONS} />);

    // sensory は回答が無いため、数値ではなく「未算出」であることがアクセシブルな
    // 説明文(role="img" の aria-label)に明記される(視覚的にもグレーの破線で表示)。
    await waitFor(() => {
      expect(screen.getByRole("img", { name: /感覚: 未算出/ })).toBeTruthy();
    });
  });

  it("同一タブ内で結果画面を再訪した際は最新の回答状況を再読込する(古い途中結果がキャッシュされ続けない)", async () => {
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0001", value: 2 },
        { questionId: "ND-0005", value: 2 },
      ],
      currentIndex: 2,
    });

    const { unmount } = render(<ResultView questions={QUESTIONS} />);
    await waitFor(() => {
      expect(screen.getByRole("img", { name: /感覚: 未算出/ })).toBeTruthy();
    });
    unmount();

    // __resetResultProgressForTests を呼ばず(=ページ再読み込みを挟まず)、残りの設問へ
    // 回答してから結果画面へ再度遷移した状況(途中結果→回答継続→結果画面)を再現する。
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0001", value: 2 },
        { questionId: "ND-0005", value: 2 },
        { questionId: "ND-0009", value: 2 },
      ],
      currentIndex: 3,
    });

    render(<ResultView questions={QUESTIONS} />);

    await waitFor(() => {
      expect(screen.queryByRole("img", { name: /感覚: 未算出/ })).toBeNull();
    });
  });

  it("回答をやり直す際は確認を表示し、確定後に進行状態をクリアして /survey へ遷移する", async () => {
    saveSurveyProgressState({
      answers: [{ questionId: "ND-0001", value: 2 }],
      currentIndex: 1,
    });
    expect(loadSurveyProgress()).not.toBeNull();

    render(<ResultView questions={QUESTIONS} />);
    const restartButton = await screen.findByRole("button", { name: "回答をやり直す" });

    fireEvent.click(restartButton);

    expect(screen.getByRole("alertdialog", { name: "回答をやり直す確認" })).toBeTruthy();
    expect(loadSurveyProgress()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "削除して最初から始める" }));

    expect(loadSurveyProgress()).toBeNull();
    expect(push).toHaveBeenCalledWith("/survey");
  });

  it("非診断免責(DisclaimerNotice)を表示する(NFR-52)", async () => {
    render(<ResultView questions={QUESTIONS} />);

    expect(await screen.findByText(/これは医学的な診断ではありません/)).toBeTruthy();
  });

  it("自分の結果表示時のみ「この結果を履歴に保存」を表示する(TICKET-0025)", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });

    render(<ResultView questions={QUESTIONS} />);

    expect(await screen.findByText("この結果を履歴に保存")).toBeTruthy();
  });

  it("結果の要約と地域の相談先を探す主導線を先に表示する", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });

    render(<ResultView questions={QUESTIONS} />);

    expect(await screen.findByText("回答ありがとうございました")).toBeTruthy();
    const supportLink = screen.getByRole("button", { name: "地域の相談先を探す" }).closest("a");
    expect(supportLink?.getAttribute("href")).toBe("/support?tags=social");
    expect(screen.getByText("次にできること")).toBeTruthy();
    expect(screen.getByRole("button", { name: "相談時に渡すメモを作る" }).closest("a")?.getAttribute("href")).toBe("/result/prepare");
    expect(screen.getByText("結果を詳しく見る")).toBeTruthy();
    expect(screen.getByText("保存・共有・やり直し")).toBeTruthy();
    expect(screen.getByText("保存・共有")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "回答をやり直す" })).toBeTruthy();
    expect(screen.queryByText("追加のサポート（任意）")).toBeNull();
  });

  it("結果の詳細は初期状態で閉じ、次の行動の後に表示する", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });

    const { container } = render(<ResultView questions={QUESTIONS} />);

    const detailsSummary = await screen.findByText("結果を詳しく見る");
    expect(detailsSummary.closest("details")?.open).toBe(false);

    const text = container.textContent ?? "";
    expect(text.indexOf("今回「よくある」が多かった領域")).toBeLessThan(text.indexOf("次にできること"));
    expect(text.indexOf("次にできること")).toBeLessThan(text.indexOf("結果を詳しく見る"));
  });

  it("途中回答では、その旨を主導線の前に表示する", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });

    render(<ResultView questions={QUESTIONS} />);

    expect(await screen.findByText(/1 \/ 3問に回答した途中結果です/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "回答を続ける" }).closest("a")?.getAttribute("href")).toBe("/survey");
  });
});

const SAMPLE_SHARE_DATA: ShareData = {
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

describe("ResultView: 共有 URL の発行導線(TICKET-0009)", () => {
  it("初期表示ではハッシュを一切生成しない(AC-1)", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });

    render(<ResultView questions={QUESTIONS} />);
    await screen.findByText("共有 URL を作成");

    expect(window.location.hash).toBe("");
  });

  it("「共有 URL を作成」を押しても、確定するまではハッシュを生成せずプレビューを表示する(AC-2, AC-4)", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });

    render(<ResultView questions={QUESTIONS} />);
    const createButton = await screen.findByText("共有 URL を作成");
    fireEvent.click(createButton);

    expect(await screen.findByText("共有 URL のプレビュー")).toBeTruthy();
    expect(screen.getByText(/含まれる内容: カテゴリ別スコアのみ/)).toBeTruthy();
    expect(screen.getByText(/含まれない内容: 自由記述・回答内容・お住まいの地域は一切含まれません/)).toBeTruthy();
    expect(window.location.hash).toBe("");
  });

  it("特性別スコア(診断カテゴリ名+パーセンテージの併記)は、実際の回答で非null値が算出される場合でもプレビューに表示しない", async () => {
    // ND-0001・ND-0005 はいずれも trait: ASD のため、両方に最大値(2)で回答すると
    // ASD の特性別スコアは実際には 100 (非null) として算出される構成。
    saveSurveyProgressState({
      answers: [
        { questionId: "ND-0001", value: 2 },
        { questionId: "ND-0005", value: 2 },
      ],
      currentIndex: 2,
    });

    const { container } = render(<ResultView questions={QUESTIONS} />);
    const createButton = await screen.findByText("共有 URL を作成");
    fireEvent.click(createButton);

    expect(await screen.findByText("共有 URL のプレビュー")).toBeTruthy();
    const renderedText = container.textContent ?? "";
    expect(renderedText).not.toMatch(/ASD|ADHD|LD|DCD/);
  });

  it("プレビュー確認後に「URL を発行してコピー」を押すと初めてハッシュを生成する(AC-4)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });

    render(<ResultView questions={QUESTIONS} />);
    fireEvent.click(await screen.findByText("共有 URL を作成"));
    fireEvent.click(await screen.findByText("URL を発行してコピー"));

    await waitFor(() => {
      expect(window.location.hash.startsWith("#r=v1.")).toBe(true);
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(window.location.hash));
    expect(await screen.findByText("共有をやめる")).toBeTruthy();
    expect(screen.getByText("すでに相手へ送ったリンク自体を取り消すことはできません。")).toBeTruthy();
  });

  it("「共有をやめる」を押すとハッシュを除去する(AC-5)", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    saveSurveyProgressState({ answers: [{ questionId: "ND-0001", value: 2 }], currentIndex: 1 });

    render(<ResultView questions={QUESTIONS} />);
    fireEvent.click(await screen.findByText("共有 URL を作成"));
    fireEvent.click(await screen.findByText("URL を発行してコピー"));
    const stopButton = await screen.findByText("共有をやめる");

    fireEvent.click(stopButton);

    expect(window.location.hash).toBe("");
    expect(await screen.findByText("共有 URL を作成")).toBeTruthy();
  });
});

describe("ResultView: 共有 URL 閲覧モード(TICKET-0009 AC-6, AC-8)", () => {
  it("有効な共有ハッシュ付きで開いた場合、注記を表示し共有・リスタート導線を隠す(AC-6)", async () => {
    const hash = buildShareHash(SAMPLE_SHARE_DATA);
    window.history.replaceState(null, "", `/result${hash}`);

    render(<ResultView questions={QUESTIONS} />);

    expect(await screen.findByText("これは共有された結果です。")).toBeTruthy();
    expect(screen.getByText("あなたの回答ではない可能性があります。")).toBeTruthy();
    expect(screen.queryByText("共有 URL を作成")).toBeNull();
    expect(screen.queryByText("もう一度チェックする")).toBeNull();
    expect(screen.queryByText("この結果を履歴に保存")).toBeNull();
    expect(screen.getByText("自分もチェックする")).toBeTruthy();

    // 共有データ由来のスコアがチャートに反映されていること。
    expect(screen.getByText("会話・伝え方")).toBeTruthy();
  });

  it("自分の progress が存在しても、ハッシュがあればハッシュを優先する", async () => {
    saveSurveyProgressState({ answers: [{ questionId: "ND-0009", value: 2 }], currentIndex: 1 });
    const hash = buildShareHash(SAMPLE_SHARE_DATA);
    window.history.replaceState(null, "", `/result${hash}`);

    render(<ResultView questions={QUESTIONS} />);

    expect(await screen.findByText("これは共有された結果です。")).toBeTruthy();
  });

  it("壊れた共有ハッシュの場合は通常結果として誤表示せず、安全にエラー表示する(AC-8)", async () => {
    window.history.replaceState(null, "", "/result#r=v1.not-valid-base64url!!");

    render(<ResultView questions={QUESTIONS} />);

    expect(await screen.findByText("共有 URL を読み込めませんでした。")).toBeTruthy();
    expect(screen.queryByText("これは共有された結果です。")).toBeNull();
    expect(screen.queryByText("会話・伝え方")).toBeNull();
  });
});
