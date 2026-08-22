import { expect, test } from "@playwright/test";

/**
 * 設定・データ管理画面(TICKET-0027, FR-054)。
 * トップ画面からの導線・トグル操作の永続化(リロード後も維持)・全削除の確認フローを
 * 一気通貫で確認する。
 */

test("トップ画面から設定画面へ遷移できる(AC-4)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "設定" }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "設定・データ管理" })).toBeVisible();
});

test("履歴保存トグルの ON/OFF はリロード後も維持される(AC-1, AC-5)", async ({ page }) => {
  await page.goto("/settings");

  const toggle = page.getByRole("switch", { name: "履歴の保存" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await page.reload();
  await expect(page.getByRole("switch", { name: "履歴の保存" })).toHaveAttribute("aria-checked", "true");
});

test("すべてのデータを削除は確認を挟み、完了フィードバックを表示する(AC-2, NFR-37)", async ({ page }) => {
  await page.goto("/settings");

  await page.getByRole("switch", { name: "履歴の保存" }).click();
  await expect(page.getByRole("switch", { name: "履歴の保存" })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "すべてのデータを削除" }).click();
  await expect(page.getByText("元に戻せません。本当に削除しますか?")).toBeVisible();

  await page.getByRole("button", { name: "削除する" }).click();

  await expect(page.getByText("すべてのデータを削除しました。")).toBeVisible();
  await expect(page.getByRole("switch", { name: "履歴の保存" })).toHaveAttribute("aria-checked", "false");

  await page.reload();
  await expect(page.getByRole("switch", { name: "履歴の保存" })).toHaveAttribute("aria-checked", "false");
});

test("保存場所・送信有無の説明文が表示される(AC-3)", async ({ page }) => {
  await page.goto("/settings");

  await expect(
    page.getByText("回答の進行状況とこの設定内容は、この端末のブラウザ内(localStorage)に保存します。"),
  ).toBeVisible();
  await expect(
    page.getByText("サーバーへの送信は行いません。結果画面で共有 URL をご自身で発行した場合のみ、その内容が URL に含まれます。"),
  ).toBeVisible();
});
