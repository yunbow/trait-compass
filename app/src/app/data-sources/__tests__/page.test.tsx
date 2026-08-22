import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// coverage/__tests__/page.test.tsx と同じ方針で、D1 アクセスを避けるために `@/lib/db` を
// モジュールごと差し替える。
const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

// InfoPageShell 内の SmartBackLink(クライアントコンポーネント)が useRouter() を呼ぶため、
// InfoPageShell.test.tsx と同じ方針で next/navigation をモックする。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

import DataSourcesPage from "@/app/data-sources/page";

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

function renderPage() {
  return DataSourcesPage({ searchParams: Promise.resolve({}) });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DataSourcesPage", () => {
  it("D1 バインディングが無い場合は準備中の空状態を表示する(graceful degradation)", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding 'DB' is not configured.");
    });

    render(await renderPage());

    expect(screen.getByText("利用しているデータの一覧は現在準備中です。")).toBeTruthy();
  });

  it("datasets が0件でもページの静的セクションは表示される", async () => {
    getDbMock.mockReturnValue(createQueueDb([[], []]));

    render(await renderPage());

    expect(screen.getByRole("heading", { level: 1, name: "利用しているデータ" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "データの利用目的" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "データの区分" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "情報の更新と訂正" })).toBeTruthy();
    expect(screen.getByText("現在、掲載しているデータはありません。")).toBeTruthy();
  });

  it("datasets と facilities のデータがある場合はタイトル・出典・カテゴリ件数チップを表示する", async () => {
    getDbMock.mockReturnValue(
      createQueueDb([
        [
          {
            id: "d1",
            title: "発達障害支援機関・医療機関の情報",
            source_org: "東京都福祉局",
            license: "cc-by-4.0",
            source_url: "https://example.com/dataset",
            fetched_at: "2026-01-01T00:00:00.000Z",
            ckan_package_id: "t000054d0000000058",
          },
        ],
        [{ dataset_id: "d1", category_type: "相談窓口", count: 5 }],
      ]),
    );

    render(await renderPage());

    expect(screen.getByText("発達障害支援機関・医療機関の情報")).toBeTruthy();
    expect(screen.getByText(/出典: 発達障害支援機関・医療機関の情報/)).toBeTruthy();
    expect(screen.getByText("相談窓口 5件")).toBeTruthy();
  });

  it("掲載データの一覧を「オープンデータ」「標準利用規約データ」「個別許諾データ」の3セクションに分ける", async () => {
    getDbMock.mockReturnValue(
      createQueueDb([
        [
          {
            id: "d1",
            title: "オープンデータの例",
            source_org: "東京都",
            license: "cc-by-4.0",
            source_url: "https://example.com/open",
            fetched_at: "2026-01-01T00:00:00.000Z",
            ckan_package_id: "t000054d0000000058",
          },
          {
            id: "d2",
            title: "標準利用規約データの例",
            source_org: "国立障害者リハビリテーションセンター",
            license: "pdl-1.0",
            source_url: null,
            fetched_at: "2026-02-01T00:00:00.000Z",
            ckan_package_id: null,
          },
          {
            id: "ds-13107-manual-survey-programs",
            title: "個別許諾データの例",
            source_org: "墨田区",
            license: "manual-fact-verified",
            source_url: null,
            fetched_at: "2026-08-18T00:00:00.000Z",
            ckan_package_id: null,
          },
        ],
        [
          { dataset_id: "d1", category_type: "相談窓口", count: 1 },
          { dataset_id: "d2", category_type: "福祉ガイド", count: 1 },
          { dataset_id: "ds-13107-manual-survey-programs", category_type: "相談窓口", count: 1 },
        ],
        [
          {
            municipality_code: "13107",
            license_audit_json: '{"schoolClassData":"ccby_available","consultationWindowData":"permission_granted"}',
          },
        ],
      ]),
    );

    render(await renderPage());

    const openDataHeading = screen.getByRole("heading", { name: "オープンデータ" });
    const standardLicenseHeading = screen.getByRole("heading", { name: "標準利用規約データ" });
    const individualPermissionHeading = screen.getByRole("heading", { name: "個別許諾データ" });
    expect(openDataHeading).toBeTruthy();
    expect(standardLicenseHeading).toBeTruthy();
    expect(individualPermissionHeading).toBeTruthy();
    // 見出しの出現順が「オープンデータ」→「標準利用規約データ」→「個別許諾データ」であることを確認する
    // (document position: 前者が後者より前に来る)。
    expect(
      openDataHeading.compareDocumentPosition(standardLicenseHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      standardLicenseHeading.compareDocumentPosition(individualPermissionHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("オープンデータの例")).toBeTruthy();
    expect(screen.getByText("標準利用規約データの例")).toBeTruthy();
    expect(screen.getByText("個別許諾データの例")).toBeTruthy();
  });

  it("facilities が1件も無いデータセットは掲載データの一覧から表示しない(2026-08是正)", async () => {
    getDbMock.mockReturnValue(
      createQueueDb([
        [
          {
            id: "ds-tokyo-academic-report",
            title: "公立学校統計調査報告書(学校調査編、特別支援学級設置数を含む)",
            source_org: "東京都教育委員会",
            license: "cc-by-4.0",
            source_url: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000021d2000000175",
            fetched_at: "2026-08-16T00:00:00.000Z",
            ckan_package_id: "t000021d2000000175",
          },
        ],
        [],
        [],
      ]),
    );

    render(await renderPage());

    expect(screen.queryByText("公立学校統計調査報告書(学校調査編、特別支援学級設置数を含む)")).toBeNull();
    // 唯一の datasets 行が除外され、掲載データの一覧全体が0件になる。
    expect(screen.getByText("現在、掲載しているデータはありません。")).toBeTruthy();
  });

  it("個別許諾データは、許諾がまだ確認できていない自治体(municipality_survey_metaがpermission_granted以外)を表示しない", async () => {
    getDbMock.mockReturnValue(
      createQueueDb([
        [
          {
            id: "ds-13101-manual-survey-programs",
            title: "許諾申請中の自治体の例",
            source_org: "千代田区",
            license: "manual-fact-verified",
            source_url: null,
            fetched_at: "2026-08-18T00:00:00.000Z",
            ckan_package_id: null,
          },
        ],
        [],
        [
          {
            municipality_code: "13101",
            license_audit_json: '{"schoolClassData":"permission_pending","consultationWindowData":"permission_pending"}',
          },
        ],
      ]),
    );

    render(await renderPage());

    expect(screen.queryByText("許諾申請中の自治体の例")).toBeNull();
  });

  // 2026-08是正: 個別許諾データカードの有効期限365日表示・期限切れバッジ(AC-5)。
  // buildDataSourceList はページ側で常に実時刻(new Date())を使うため、実行時点から見て
  // 確実に期限切れ/期限内になるよう、fetched_at を実行時刻からの相対日数で組み立てる。
  it("個別許諾データカードに有効期限日を常時表示し、期限切れの場合のみバッジと補足文を表示する", async () => {
    const now = Date.now();
    const expiredFetchedAt = new Date(now - 400 * 24 * 60 * 60 * 1000).toISOString(); // 400日前(期限切れ)
    const validFetchedAt = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10日前(期限内)

    getDbMock.mockReturnValue(
      createQueueDb([
        [
          {
            id: "ds-13106-manual-survey-programs",
            title: "期限切れの自治体の例",
            source_org: "台東区",
            license: "manual-fact-verified",
            source_url: null,
            fetched_at: expiredFetchedAt,
            ckan_package_id: null,
          },
          {
            id: "ds-13102-manual-survey-programs",
            title: "期限内の自治体の例",
            source_org: "中央区",
            license: "manual-fact-verified",
            source_url: null,
            fetched_at: validFetchedAt,
            ckan_package_id: null,
          },
        ],
        [
          { dataset_id: "ds-13106-manual-survey-programs", category_type: "相談窓口", count: 1 },
          { dataset_id: "ds-13102-manual-survey-programs", category_type: "相談窓口", count: 1 },
        ],
        [
          { municipality_code: "13106", license_audit_json: '{"schoolClassData":"permission_granted","consultationWindowData":"permission_pending"}' },
          { municipality_code: "13102", license_audit_json: '{"schoolClassData":"permission_granted","consultationWindowData":"permission_pending"}' },
        ],
      ]),
    );

    render(await renderPage());

    // 期限切れカードは一覧から消えない(透明性ページの趣旨)。
    expect(screen.getByText("期限切れの自治体の例")).toBeTruthy();
    expect(screen.getByText("期限内の自治体の例")).toBeTruthy();
    // 有効期限の日付表示は両方のカードに出る。
    expect(screen.getAllByText(/有効期限: \d{4}\/\d{2}\/\d{2}/).length).toBe(2);
    // バッジ・補足文は期限切れカードのみ。
    expect(screen.getByText("有効期限切れ")).toBeTruthy();
    expect(screen.getByText("有効期限を過ぎているため、検索結果には表示していません。")).toBeTruthy();
  });
});
