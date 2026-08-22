import { expect, test } from "@playwright/test";

import { answerAllQuestions, answerQuestions } from "./helpers";

/**
 * アンケート回答フロー(TICKET-0018 AC-1, AC-2)。
 *
 * カテゴリ変わり目のトランジション(CategoryTransition, FR-014)は通常 1〜1.5秒かけて
 * 自動遷移するため、`reducedMotion: "reduce"` をエミュレートして待ち時間を短縮した上で、
 * helpers.ts の `skipTransitionIfShown` 相当の処理で「すぐ進む」を明示クリックし、
 * テストを決定的かつ高速に保つ(タイムアウト待ちに依存しない)。
 */
test.use({ contextOptions: { reducedMotion: "reduce" } });

test.describe("回答完走", () => {
  test("トップ→はじめる→30問回答→自由記述スキップ→結果画面(レーダー・ベン図・上位カテゴリ)が表示される", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "はじめる" }).click();
    await expect(page).toHaveURL(/\/survey$/);

    await answerAllQuestions(page);

    await expect(page.getByRole("heading", { level: 1, name: "回答ありがとうございました" })).toBeVisible();
    // 自由記述(任意)は入力せずスキップする。
    await page.getByRole("button", { name: "結果を見る" }).click();

    await expect(page).toHaveURL(/\/result$/);
    await expect(page.getByRole("heading", { level: 1, name: "あなたの傾向の目安" })).toBeVisible();

    // レーダーチャート(存在確認)。
    await expect(page.getByRole("heading", { name: "領域別の傾向(レーダーチャート)" })).toBeVisible();
    await expect(page.getByRole("img", { name: /^レーダーチャート/ })).toBeVisible();

    // ベン図(存在確認)。
    await expect(page.getByRole("heading", { name: "特性の重なり(ベン図)" })).toBeVisible();
    await expect(page.getByRole("img", { name: /^ベン図/ })).toBeVisible();

    // 上位カテゴリ解説(全問「よくある」で回答しているため、必ず表示される)。
    await expect(page.getByRole("heading", { name: "回答の中でスコアが高めだった項目" })).toBeVisible();
  });
});

test.describe("中断→再開", () => {
  test("数問回答後にトップへ戻り、「前回の続きから」で再開すると同じ設問位置から始まる", async ({ page }) => {
    await page.goto("/survey");
    // 2問だけ回答する(先頭カテゴリ内に収まる件数のため、カテゴリ変わり目トランジションは発生しない)。
    await answerQuestions(page, 2);

    const nextQuestionHeading = page.getByRole("heading", { level: 1 });
    const expectedQuestionText = await nextQuestionHeading.textContent();
    expect(expectedQuestionText).toBeTruthy();

    // トップ画面へ戻る。
    await page.goto("/");
    await expect(page.getByRole("button", { name: "前回の続きから" })).toBeVisible();

    await page.getByRole("button", { name: "前回の続きから" }).click();
    await expect(page).toHaveURL(/\/survey$/);

    // 再開後、離脱時と同じ設問(3問目)が表示されている。
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(expectedQuestionText ?? "");
  });
});

test.describe("早期スキップ", () => {
  test("数問回答後に「ここまでの回答で結果を見る」で結果を見ると、未回答カテゴリは未算出表示になる", async ({
    page,
  }) => {
    await page.goto("/survey");
    // 2問だけ回答する(先頭カテゴリのみ算出され、残り9カテゴリは未算出になる)。
    await answerQuestions(page, 2);

    await page.getByRole("button", { name: "ここまでの回答で結果を見る" }).click();
    await expect(page.getByRole("heading", { name: "ここまでの回答で結果を見ますか?" })).toBeVisible();

    await page.getByRole("button", { name: "結果を見る" }).click();
    await expect(page).toHaveURL(/\/result$/);

    await expect(page.getByRole("heading", { level: 1, name: "あなたの傾向の目安" })).toBeVisible();
    // 未回答カテゴリの未算出表示(レーダーチャートの凡例注記)。
    await expect(page.getByText("グレーの破線・丸印は「未算出」")).toBeVisible();
  });
});
