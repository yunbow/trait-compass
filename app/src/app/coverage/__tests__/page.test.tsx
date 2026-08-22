import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// route.ts のテスト(src/app/api/recommend/__tests__/route.test.ts)と同じ方針で、D1 アクセスを
// 避けるために `@/lib/db` をモジュールごと差し替える。
const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

// InfoPageShell 内の SmartBackLink(クライアントコンポーネント)が useRouter() を呼ぶため、
// data-sources/__tests__/page.test.tsx と同じ方針で next/navigation をモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import CoveragePage from "@/app/coverage/page";

interface FakeStatement {
  bind: (...args: unknown[]) => FakeStatement;
  all: () => Promise<{ results: unknown[] }>;
}

/** `responses[n]` が n 回目(0始まり)の `prepare().all()` の結果になるフェイク D1。 */
function createQueueDb(responses: unknown[][]) {
  let index = 0;
  return {
    prepare: vi.fn(() => {
      const statement: FakeStatement = {
        bind: vi.fn(() => statement),
        all: vi.fn(async () => {
          const results = responses[index] ?? [];
          index += 1;
          return { results };
        }),
      };
      return statement;
    }),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CoveragePage", () => {
  it("D1 バインディングが無い場合は準備中の空状態を表示する(graceful degradation)", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding 'DB' is not configured.");
    });

    render(await CoveragePage());

    expect(screen.getByText("データカバレッジ可視化は現在準備中です。")).toBeTruthy();
  });

  it("D1 に facilities が0件の場合も62区市町村すべてを0件の行として表示する", async () => {
    getDbMock.mockReturnValue(createQueueDb([[], []]));

    const { container } = render(await CoveragePage());

    expect(screen.getByText("区市町村データカバレッジ可視化")).toBeTruthy();
    // サマリー: 62区市町村すべて「データなし」(数値は <dt> と <dd> にまたがるため、
    // DOM 構造に依存しないよう container 全体のテキストで検証する。2026-08是正:
    // 「有データ市区町村数/62」の単一比率から4分類充足度の内訳表示に変更)。
    expect(container.textContent).toMatch(/データなし\s*62\s*\/\s*62/);
    // 62区市町村すべてが行として存在する(データが無い区市町村もゼロ件の行として明示、AC-1・AC-2)。
    expect(screen.getByText("千代田区")).toBeTruthy();
    expect(screen.getByText("小笠原村")).toBeTruthy();
  });

  it("前の画面に戻るリンク(InfoPageShell の SmartBackLink)を表示する", async () => {
    getDbMock.mockReturnValue(createQueueDb([[], []]));

    render(await CoveragePage());

    const backLink = screen.getByRole("link", { name: "← 前の画面に戻る" });
    expect(backLink.getAttribute("href")).toBe("/data-sources");
  });

  it("facilities データがある場合はサマリー件数・出典クレジットを表示する", async () => {
    getDbMock.mockReturnValue(
      createQueueDb([
        [
          { municipality_code: "13104", category_type: "相談窓口", lat: 35.6938, lng: 139.7036, dataset_id: "d-wam-net" },
          { municipality_code: "13104", category_type: "支援制度", lat: null, lng: null, dataset_id: "d-wam-net" },
        ],
        [
          {
            id: "d-wam-net",
            title: "発達障害支援機関・医療機関の情報",
            source_org: "東京都福祉局",
            license: "CC BY 4.0",
            source_url: "https://example.com/dataset",
          },
        ],
      ]),
    );

    const { container } = render(await CoveragePage());

    // 13104(新宿区)は categoryTypesCovered=2 → 「2分類充足」が1区市町村。
    expect(container.textContent).toMatch(/2分類充足\s*1\s*\/\s*62/);
    expect(screen.getByText(/出典: 発達障害支援機関・医療機関の情報/)).toBeTruthy();
  });

  // 2026-08是正: 「施設数」→「登録データ数」ラベル変更+自治体独自データの内訳(1件以上の場合のみ)を
  // 分類充足列の備考として表示(発達障害支援資料チップの削除で空いたスペースに移設)。
  it("1区市町村にしか登場しないデータセット由来の件数は「{合計}件中独自データ{件数}件」として表示する", async () => {
    getDbMock.mockReturnValue(
      createQueueDb([
        [
          // d-wam-net は新宿区・八王子市の2区市町村に登場するため common。
          { municipality_code: "13104", category_type: "相談窓口", lat: null, lng: null, dataset_id: "d-wam-net" },
          { municipality_code: "13201", category_type: "相談窓口", lat: null, lng: null, dataset_id: "d-wam-net" },
          // d-taito-hoiku は台東区にしか登場しないため municipality-only。
          { municipality_code: "13106", category_type: "福祉ガイド", lat: null, lng: null, dataset_id: "d-taito-hoiku" },
        ],
        [],
      ]),
    );

    render(await CoveragePage());

    expect(screen.getByRole("columnheader", { name: "登録データ数" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "施設数" })).toBeNull();
    // 台東区(1件, municipality-only): 共通データ0件・自治体独自データ1件 → 「1件中独自データ1件」。
    expect(screen.getByText("1件中独自データ1件")).toBeTruthy();
  });

  // 2026-08是正: /coverage の出典一覧を /data-sources と同じ Source of Truth で絞り込む
  // (data-sources/__tests__/page.test.tsx の同名テストと対の回帰テスト)。
  it("出典は、許諾がまだ確認できていない自治体(municipality_survey_metaがpermission_granted以外)の個別許諾データを表示しない", async () => {
    getDbMock.mockReturnValue(
      createQueueDb([
        [{ municipality_code: "13101", category_type: "相談窓口", lat: null, lng: null }],
        [
          {
            id: "ds-13101-manual-survey-programs",
            title: "許諾申請中の自治体の例",
            source_org: "千代田区",
            license: "manual-fact-verified",
            source_url: null,
          },
        ],
        [
          {
            municipality_code: "13101",
            license_audit_json: '{"schoolClassData":"permission_pending","consultationWindowData":"permission_pending"}',
          },
        ],
      ]),
    );

    render(await CoveragePage());

    expect(screen.queryByText("許諾申請中の自治体の例")).toBeNull();
    // credits が0件になり「出典」見出し自体が表示されなくなることも合わせて確認する
    // (CoverageOverview は credits.length > 0 のときのみ節を描画する)。
    expect(screen.queryByRole("heading", { name: "出典" })).toBeNull();
  });
});
