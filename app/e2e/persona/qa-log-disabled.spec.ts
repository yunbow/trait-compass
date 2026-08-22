import { expect, test } from "@playwright/test";

import { answerQuestions } from "../helpers";
import { qaLogDatabaseExists, readQaLogEvents } from "./qa-log-inspector";

/**
 * QA 専用ログの本番無効化を確認する回帰テスト(TICKET-0030 AC-3, NFR-39)。
 *
 * persona-survey.spec.ts とは異なり、ここでは `page.addInitScript()` による
 * `window.__ND_QA_LOGGING__` フラグ注入を一切行わない = 本番ビルドと同じ状態を再現する。
 * この条件でアンケートに数問回答しても、QA ログ用の IndexedDB(`nd-qa-log`)が
 * 作られない/中身が空であることを確認する。
 */
test.describe("QA ログの本番無効化(TICKET-0030 AC-3, NFR-39)", () => {
  test("フラグ未注入で数問回答しても nd-qa-log データベースが作成されない", async ({ page }) => {
    await page.goto("/survey");
    await answerQuestions(page, 3);

    expect(await qaLogDatabaseExists(page)).toBe(false);
    expect(await readQaLogEvents(page)).toEqual([]);
  });

  test("フラグに false を注入した場合も記録されない(=== true の厳格判定)", async ({ page }) => {
    await page.addInitScript(() => {
      window.__ND_QA_LOGGING__ = false;
    });
    await page.goto("/survey");
    await answerQuestions(page, 3);

    expect(await readQaLogEvents(page)).toEqual([]);
  });
});
