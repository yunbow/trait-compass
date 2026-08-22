import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testDir: "./e2e",
      // e2e/persona 配下は AI ペルソナ UX テスト(TICKET-0030)専用の別プロジェクト
      // として実行するため、通常の e2e からは除外する(重複実行防止)。
      testIgnore: "**/persona/**",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // AI ペルソナ UX テスト(TICKET-0030, NFR-76)。
      // `npx playwright test e2e/persona` または `npx playwright test --project=persona`
      // で単独実行できる。通常の `npx playwright test` でも他プロジェクトと合わせて実行される。
      // 一次スクリーニング・リグレッション補助であり、実在当事者テストの代替にはならない。
      name: "persona",
      testDir: "./e2e/persona",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
