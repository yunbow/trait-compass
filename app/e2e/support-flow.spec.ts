import { expect, test, type Page } from "@playwright/test";

/**
 * 支援情報検索フロー(TICKET-0018 AC-4, AC-5)。
 *
 * 前提条件: ローカル D1 に `db/seed/no-diagnosis-facilities.sql`・`db/seed/adult-benefit-cards.sql`
 * (実在データの手動シード)が投入済みであること(`npm run db:reset:local` を事前に実行しておく。
 * README・本チケットの作業ログを参照)。
 *
 * D1 バインディングが利用できない環境(`npm run db:reset:local` 未実行、
 * `initOpenNextCloudflareForDev()` 未起動 等)では `/support/results` は
 * `src/app/support/results/page.tsx` の graceful degradation により
 * 「支援情報は現在準備中です。」という空状態を返す(エラー画面にはならない)。
 * このテストファイルは D1 実データでの検証を主眼としつつ、D1 未セットアップの環境で
 * CI 等が壊れないよう、その場合は「準備中」表示自体が壊れていないことの確認へ
 * フォールバックする。
 */

const PREPARING_TITLE = "支援情報は現在準備中です。";

async function isPreparingFallback(page: Page): Promise<boolean> {
  return page
    .getByRole("heading", { name: PREPARING_TITLE })
    .isVisible()
    .catch(() => false);
}

async function expectPreparingFallback(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: PREPARING_TITLE })).toBeVisible();
  await expect(page.getByRole("link", { name: "条件を入力しなおす" })).toBeVisible();
}

async function selectMunicipality(page: Page, name: string): Promise<void> {
  const combobox = page.getByRole("combobox", { name: /お住まいの区市町村/ });
  await combobox.fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}

test("child + シードに存在する区市町村を選択すると、施設カードと出典クレジットが表示される", async ({ page }) => {
  await page.goto("/support");
  await page.getByRole("button", { name: "小学生・中学生" }).click();
  await selectMunicipality(page, "世田谷区");
  await page.getByRole("button", { name: "支援情報を見る" }).click();

  await expect(page).toHaveURL(/\/support\/results\?/);

  if (await isPreparingFallback(page)) {
    await expectPreparingFallback(page);
    return;
  }

  await expect(page.getByRole("heading", { level: 1, name: "世田谷区で見つかった支援情報" })).toBeVisible();
  // db/seed/no-diagnosis-facilities.sql: fac-manual-saposute-setagaya(世田谷区・相談窓口・
  // age_range=both、実在データ)。2026-08-11: 同ファイルにあったダミー施設
  // 「精神保健福祉センターB(ダミー)」は削除済みのため、実在の本施設で代替する。
  await expect(page.getByText("せたがや若者サポートステーション")).toBeVisible();
  // 出典クレジット(FR-026, NFR-54)。
  await expect(page.getByText(/^出典: /).first()).toBeVisible();
});

test("シードに存在しない区市町村を選択すると、広域窓口へのフォールバック文言が表示される", async ({ page }) => {
  await page.goto("/support");
  await page.getByRole("button", { name: "小学生・中学生" }).click();
  // 檜原村は自治体レジストリ(東京都62区市町村)には含まれるが、山間部で facilities に
  // 登場する見込みが薄い(区市町村データ欠損のケース、FR-022)。
  await selectMunicipality(page, "檜原村");
  await page.getByRole("button", { name: "支援情報を見る" }).click();

  await expect(page).toHaveURL(/\/support\/results\?/);

  if (await isPreparingFallback(page)) {
    await expectPreparingFallback(page);
    return;
  }

  await expect(
    page.getByText("お住まいの区市町村のデータが見つからないため、都の広域窓口を表示しています。"),
  ).toBeVisible();
});

test("タブを切り替えると category_type ごとの一覧に切り替わる", async ({ page }) => {
  await page.goto("/support/results?age=adult&municipality=13112");

  if (await isPreparingFallback(page)) {
    await expectPreparingFallback(page);
    return;
  }

  // 既定タブは「相談窓口」(CATEGORY_TYPES の先頭)。
  // db/seed/no-diagnosis-facilities.sql: fac-manual-saposute-setagaya(世田谷区・相談窓口・
  // age_range=both、実在データ)。
  await expect(page.getByRole("link", { name: /^相談窓口/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("せたがや若者サポートステーション")).toBeVisible();

  // 「支援制度」タブへ切り替える(db/seed/adult-benefit-cards.sql: category_type=支援制度、
  // age_range=adult、municipality=東京都の広域データ)。
  await page.getByRole("link", { name: /^支援制度/ }).click();

  await expect(page.getByRole("link", { name: /^支援制度/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /^相談窓口/ })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByText("精神障害者保健福祉手帳")).toBeVisible();
  // 切り替え後もタブ内には「相談窓口」の施設は表示されない。
  await expect(page.getByText("せたがや若者サポートステーション")).toHaveCount(0);
});

test("旧形式の自治体名(municipality=世田谷区)でアクセスしても結果が描画される(後方互換)", async ({ page }) => {
  await page.goto("/support/results?age=adult&municipality=世田谷区");

  if (await isPreparingFallback(page)) {
    await expectPreparingFallback(page);
    return;
  }

  await expect(page.getByRole("heading", { level: 1, name: /^世田谷区・18歳以上の支援情報/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^相談窓口/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("せたがや若者サポートステーション")).toBeVisible();
});
