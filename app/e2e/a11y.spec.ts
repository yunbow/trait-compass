import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * アクセシビリティ自動チェックの雛形(TICKET-0016)。
 *
 * axe-core によるルールベース検査(WCAG 2.1 A/AA 相当)を主要画面に対して行い、
 * 全ページで violations 0 件を目標とする。
 *
 * - `/support/results` は D1(facilities 等)への実データ検索を必要とする画面のため、
 *   ここではクエリ未指定(検証失敗)による「検索条件を確認できませんでした」フォールバック
 *   表示のみを検査する。D1 シード後の実データ表示状態(FacilityResultsView 本体)の検査は、
 *   ローカル D1 シード(`npm run db:seed:local:manual`)を前提とした別途の確認に委ねる。
 * - `/survey` `/result` は localStorage の回答状態に依存しない初期状態(未回答)のみを検査する。
 * - 実行が重い場合はこのファイル自体は資産として残し、CI での実行要否は運用側の判断に委ねてよい
 *   (チケット本文の指示による)。
 * - `disableCssTransitions()` で全要素の transition/animation の duration を強制的に 0
 *   にしている。ボタンの hover/focus 用 `transition-all`(shadcn/ui 由来、NFR-41 が禁止する
 *   スピン/ズームではなく単なる状態遷移の色変化)が axe-core の走査中にたまたま再計算される
 *   と、axe が遷移途中の合成色を「実際の文字色」として検出し `color-contrast` が不安定に
 *   fail する(実際の静止表示は常に前景色 `var(--foreground)` に近い黒でコントラスト比 19:1
 *   超であることを `getComputedStyle` で個別に確認済み)。テストの決定性のためだけの措置で
 *   あり、プロダクトコード自体は変更しない。
 */
async function disableCssTransitions(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }`,
  });
}

test.describe("axe-core によるアクセシビリティ検査", () => {
  test("トップ画面", async ({ page }) => {
    await page.goto("/");
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("アンケート画面(先頭の設問)", async ({ page }) => {
    await page.goto("/survey");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("結果画面(未回答状態)", async ({ page }) => {
    await page.goto("/result");
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("支援情報: 年齢・地域選択画面", async ({ page }) => {
    await page.goto("/support");
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("支援情報: 検索結果画面(検索条件未指定時のフォールバック表示、D1 非依存)", async ({ page }) => {
    await page.goto("/support/results");
    await expect(page.getByRole("heading", { name: "検索条件を確認できませんでした。" })).toBeVisible();
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("プライバシーポリシー画面", async ({ page }) => {
    await page.goto("/privacy");
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("利用規約画面", async ({ page }) => {
    await page.goto("/terms");
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("このプロジェクトについて画面", async ({ page }) => {
    await page.goto("/about");
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("使い方画面", async ({ page }) => {
    await page.goto("/help");
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("用語の説明画面", async ({ page }) => {
    await page.goto("/guide");
    await disableCssTransitions(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

/**
 * キーボード操作のみでの主要フロー完走確認(NFR-46)。
 */
test.describe("キーボード操作", () => {
  test("スキップリンクで本文(#main-content)へフォーカス移動できる", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "本文へスキップ" })).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("キーボードのみでトップ→アンケート開始→1問目回答まで到達できる", async ({ page }) => {
    await page.goto("/");
    // Button コンポーネントを render={<Link />} + nativeButton={false} で使っているため、
    // 見た目は「はじめる」ボタンだが役割は role="button"(base-ui が明示的に付与)。
    await page.getByRole("button", { name: "はじめる" }).focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/survey$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const firstQuestionHeading = page.getByRole("heading", { level: 1 });
    const firstQuestionText = await firstQuestionHeading.textContent();

    await page.getByRole("button", { name: "よくある" }).focus();
    await page.keyboard.press("Enter");

    // 設問切替後、次の設問の見出しへフォーカスが移動していること(スクリーンリーダーへの通知)。
    const nextHeading = page.getByRole("heading", { level: 1 });
    await expect(nextHeading).toBeFocused();
    await expect(nextHeading).not.toHaveText(firstQuestionText ?? "");
  });
});
