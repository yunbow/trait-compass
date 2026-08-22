import { expect, test } from "@playwright/test";

test("トップページが表示される", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByText("Trait Compass — 発達特性と困りごとを整理し、支援への道しるべに")).toBeVisible();
});
