import { expect, test } from "@playwright/test";

import { answerAllQuestions } from "./helpers";

/**
 * 結果共有 URL フロー(TICKET-0018 AC-3, TICKET-0009)。
 * カテゴリ変わり目トランジションの待ち時間を短縮するため reduced-motion をエミュレートする。
 */
test.use({ contextOptions: { reducedMotion: "reduce" } });

test("結果画面から共有 URL を作成し、別セッションで開くと「あなたの回答ではない可能性」注記と読み取り専用表示になる", async ({
  page,
  browser,
}) => {
  await page.goto("/survey");
  await answerAllQuestions(page);
  await page.getByRole("button", { name: "結果を見る" }).click();
  await expect(page).toHaveURL(/\/result$/);

  // 共有 URL 作成 → プレビュー確認。
  await page.getByRole("button", { name: "共有 URL を作成" }).click();
  await expect(page.getByText("共有 URL のプレビュー")).toBeVisible();
  await expect(page.getByText("含まれる内容: カテゴリ別スコアのみです。")).toBeVisible();
  await expect(page.getByText("含まれない内容: 自由記述・回答内容・お住まいの地域は一切含まれません。")).toBeVisible();

  // 発行。
  await page.getByRole("button", { name: "URL を発行してコピー" }).click();
  await expect(page.getByText("共有 URL を発行しました")).toBeVisible();

  // `handlePublish` は `history.replaceState(null, "", hash)` で現在ページの URL に
  // `#r=...` を書き込むため、`page.url()` がそのまま発行された共有 URL になる。
  const shareUrl = page.url();
  expect(shareUrl).toMatch(/#r=v1\./);

  // 別セッション(新しい context = localStorage・Cookie を共有しない別ブラウザ相当)で開く。
  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await otherPage.goto(shareUrl);

    await expect(otherPage.getByRole("heading", { level: 1, name: "共有された傾向の目安" })).toBeVisible();
    await expect(otherPage.getByText("これは共有された結果です。")).toBeVisible();
    await expect(otherPage.getByText("あなたの回答ではない可能性があります。")).toBeVisible();

    // 読み取り専用: 共有作成・リスタート等の導線は表示されない。
    await expect(otherPage.getByRole("button", { name: "共有 URL を作成" })).toHaveCount(0);
    await expect(otherPage.getByRole("button", { name: "もう一度チェックする" })).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});

test("不正なハッシュ(#r=v1.broken)を開くと、安全なエラー表示になる", async ({ page }) => {
  await page.goto("/result#r=v1.broken");

  await expect(page.getByRole("heading", { level: 1, name: "共有 URL を読み込めませんでした。" })).toBeVisible();
  await expect(page.getByRole("button", { name: "トップへ戻る" })).toBeVisible();
});
