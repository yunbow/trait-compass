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
  // MunicipalityCombobox(Base UI の Combobox)は実際のキー入力で候補ポップアップを開くため、
  // fill()(値の一括設定)ではなく pressSequentially() で1文字ずつ入力する(2026-08是正)。
  await combobox.click();
  await combobox.pressSequentially(name);
  await page.getByRole("option", { name, exact: true }).click();
}

/**
 * 年齢・地域選択後、目的選択画面(/support/purpose)を「目的を選ばず一覧を見る」経路で
 * 通過して /support/results へ到達する(2026-08是正: 旧仕様の「支援情報を見る」1クリック
 * 遷移は /support → /support/purpose → /support/results の3画面フローへ変更済みのため、
 * 現行UIの実ボタンに合わせた)。目的を選ばないため、結果画面の見出しは
 * 「{区市町村}・{年齢ラベル}の支援情報(N件)」形式のままになる(目的を選ぶと
 * 「…」を選んだ方への案内 に変わる。FacilityResultsView の selectedPurposeLabel 参照)。
 */
async function proceedToResultsWithoutPurpose(page: Page): Promise<void> {
  await page.getByRole("button", { name: "次へ：相談したいことを選ぶ" }).click();
  await expect(page).toHaveURL(/\/support\/purpose\?/);
  await page.getByRole("button", { name: "それ以外" }).click();
  await page.getByRole("button", { name: "一覧を見る" }).click();
}

test("child(小学生・中学生)+ シードに存在する区市町村を選択しても、15歳以上対象の施設は表示されない", async ({ page }) => {
  await page.goto("/support");
  await page.getByRole("button", { name: "小学生・中学生" }).click();
  await selectMunicipality(page, "世田谷区");
  await proceedToResultsWithoutPurpose(page);

  await expect(page).toHaveURL(/\/support\/results\?/);

  if (await isPreparingFallback(page)) {
    await expectPreparingFallback(page);
    return;
  }

  // 先に結果画面自体が描画されたことを正の表明で担保する(見出しは FacilityResultsView の
  // 「{区市町村}・{年齢ラベル}の支援情報(N件)」形式。年齢ラベルは lifestage クエリ由来)。
  await expect(page.getByRole("heading", { level: 1, name: /^世田谷区・小学生・中学生の支援情報/ })).toBeVisible();
  // db/seed/no-diagnosis-facilities.sql: fac-manual-saposute-setagaya の対象は15〜49歳のため、
  // lifestage_min=2(高校生)〜lifestage_max=4(社会人)でシードしている(2026-08是正)。
  // 小学生・中学生(序数1)の検索では lifestage 絞り込み(facility-search.ts の
  // lifestageFilterClause)により除外され、表示されないのが正しい(以前は age_range='both' のみで
  // 判定されて誤表示されており、本テストも誤って「表示される」を期待していた)。
  // 成人検索での表示は下のタブ切替・後方互換テストで担保する。
  await expect(page.getByText("せたがや若者サポートステーション")).toHaveCount(0);
});

test("シードに存在しない区市町村を選択すると、広域窓口へのフォールバック文言が表示される", async ({ page }) => {
  // 2026-08是正(本タスクとは別の、既存のテスト基盤ドリフト): MunicipalityCombobox は
  // SELECTABLE_MUNICIPALITY_REGISTRY(data/manual/municipalities/ にYAMLがある約49自治体のみ)
  // しか候補に出さないため、檜原村(YAML未整備)を selectMunicipality() 経由でUI操作から
  // 選ぶこと自体が現在は不可能(コンボボックスに候補が出ない)。本テストの検証意図は
  // 「区市町村データ欠損時の広域フォールバック」であり、コンボボックスの選択可否とは無関係
  // なため、フォームのUI操作は経由せず /support/results へ直接遷移する形に変更した
  // (age=child は元のテストと同じ、municipality=13307 は檜原村の自治体コード)。
  await page.goto("/support/results?age=child&municipality=13307");

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
  // 出典クレジット(FR-026, NFR-54)。施設カードが表示される本テストで担保する
  // (child 検索のテストは 2026-08是正で施設0件の期待に変わったため、ここへ移設)。
  await expect(page.getByText(/^出典: /).first()).toBeVisible();

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
