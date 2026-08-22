import type { Page } from "@playwright/test";

/**
 * survey-flow.spec.ts / share-url.spec.ts で共有する操作ヘルパー(TICKET-0018)。
 *
 * `*.spec.ts` という命名ではないため Playwright のテストランナーには
 * テストファイルとして認識されない(playwright.config.ts の既定 testMatch は
 * `*.spec.ts`/`*.test.ts` のみを対象とする)。
 */

/**
 * 現在の設問画面で、カテゴリ変わり目のトランジション(CategoryTransition, FR-014)が
 * 表示されていれば「すぐ進む」を押して即座にスキップする。
 * 通常は 1〜1.5秒後に自動遷移するが(`test.use({ reducedMotion: "reduce" })` でも 400ms
 * かかる)、E2E を決定的かつ高速に保つため、待たずに明示操作でスキップする。
 */
async function skipTransitionIfShown(page: Page): Promise<void> {
  const skipButton = page.getByRole("button", { name: "すぐ進む" });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

/**
 * 先頭から `count` 問を「よくある」で回答する(中断・早期スキップのテスト用)。
 * `/survey` に既に居ることを前提とする。
 */
export async function answerQuestions(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await skipTransitionIfShown(page);
    await page.getByRole("button", { name: "よくある" }).click();
  }
}

/**
 * P0 出題30問すべてに「よくある」で回答し、末尾の自由記述画面(「回答ありがとうございました」)
 * まで進める。カテゴリ変わり目のトランジションはすべて「すぐ進む」でスキップする。
 * `/survey` に既に居ることを前提とする。
 */
export async function answerAllQuestions(page: Page, maxSteps = 60): Promise<void> {
  const finishHeading = page.getByRole("heading", { level: 1, name: "回答ありがとうございました" });

  for (let step = 0; step < maxSteps; step++) {
    if (await finishHeading.isVisible().catch(() => false)) {
      return;
    }
    await skipTransitionIfShown(page);
    if (await finishHeading.isVisible().catch(() => false)) {
      return;
    }
    await page.getByRole("button", { name: "よくある" }).click();
  }

  throw new Error(`survey did not reach the finish screen within ${maxSteps} steps`);
}
