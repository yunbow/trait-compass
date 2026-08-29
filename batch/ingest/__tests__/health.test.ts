import { describe, expect, it, vi } from "vitest";

import type { D1Database } from "@cloudflare/workers-types";

import { buildHealthReport, getHealthReport, type HealthDatasetRow } from "../health";

/** 判定基準日。fetchedAt との差分で staleDays を制御する。 */
const NOW = new Date("2026-08-29T00:00:00.000Z");

/** 手動調査データの license sentinel(app/src/lib/manual-data-expiration.ts と同値)。 */
const MANUAL_SURVEY_LICENSE = "manual-fact-verified";

function row(overrides: Partial<HealthDatasetRow> & { id: string }): HealthDatasetRow {
  return {
    isAlive: 1,
    fetchedAt: "2026-08-28T00:00:00.000Z",
    license: "cc-by-4.0",
    frozen: 0,
    ckanPackageId: "pkg-default",
    ...overrides,
  };
}

describe("buildHealthReport", () => {
  it("正常なデータセット(is_alive=1・監視対象)は dead/stale/unmonitored のいずれにも数えない", () => {
    const report = buildHealthReport([row({ id: "ds-ok" })], NOW);

    expect(report.datasets).toEqual([
      {
        id: "ds-ok",
        isAlive: true,
        fetchedAt: "2026-08-28T00:00:00.000Z",
        staleDays: 1,
        unmonitored: false,
        kind: "open-data-unhealthy",
      },
    ]);
    expect(report.staleCount).toBe(0);
    expect(report.deadCount).toBe(0);
    expect(report.unmonitoredCount).toBe(0);
  });

  it("監視対象(frozen=0・CKAN登録あり)の is_alive=0 は deadCount に数える(FR-029)", () => {
    const report = buildHealthReport([row({ id: "ds-dead", isAlive: 0 })], NOW);

    expect(report.deadCount).toBe(1);
    expect(report.unmonitoredCount).toBe(0);
  });

  it("frozen=1 の is_alive=0 は deadCount に数えず unmonitoredCount に数える(2026-08是正)", () => {
    const report = buildHealthReport([row({ id: "ds-frozen", isAlive: 0, frozen: 1 })], NOW);

    expect(report.deadCount).toBe(0);
    expect(report.unmonitoredCount).toBe(1);
    expect(report.datasets[0].unmonitored).toBe(true);
  });

  it("license がオープンデータライセンスで ckan_package_id IS NULL の is_alive=0 は従来どおり deadCount に数えず unmonitoredCount に数える(2026-08是正)", () => {
    const report = buildHealthReport(
      [row({ id: "ds-manual", isAlive: 0, ckanPackageId: null })],
      NOW,
    );

    expect(report.deadCount).toBe(0);
    expect(report.unmonitoredCount).toBe(1);
    expect(report.datasets[0].unmonitored).toBe(true);
    expect(report.datasets[0].kind).toBe("frozen-or-unmonitored");
  });

  it("本番相当の混在(常設の監視対象外2行 + 正常 + 本当の取得失敗)を正しく分離して数える", () => {
    const report = buildHealthReport(
      [
        row({ id: "ds-hattatsu-shien-center", isAlive: 0, frozen: 1 }),
        row({ id: "ds-kodomo-dx-registry", isAlive: 0, ckanPackageId: null }),
        row({ id: "ds-ok" }),
        row({ id: "ds-really-dead", isAlive: 0 }),
      ],
      NOW,
    );

    expect(report.deadCount).toBe(1);
    expect(report.unmonitoredCount).toBe(2);
  });

  it("frozen/ckanPackageId が undefined の行は従来どおり監視対象として扱う(互換)", () => {
    const report = buildHealthReport(
      [
        {
          id: "ds-legacy",
          isAlive: 0,
          fetchedAt: "2026-08-28T00:00:00.000Z",
          license: "cc-by-4.0",
        },
      ],
      NOW,
    );

    expect(report.deadCount).toBe(1);
    expect(report.unmonitoredCount).toBe(0);
  });

  it("staleCount は監視対象の閾値(30日)超過のみを数える", () => {
    const report = buildHealthReport(
      [
        row({ id: "ds-stale", fetchedAt: "2026-06-01T00:00:00.000Z" }),
        row({ id: "ds-fresh" }),
      ],
      NOW,
    );

    expect(report.staleCount).toBe(1);
  });

  it("監視対象外(frozen/CKAN未登録)の閾値超過は staleCount に数えない(2026-08是正の追補)", () => {
    // frozen は fetched_at が二度と進まず恒久的に閾値超過するため、staleCount に含めると
    // deadCount と同じく /health が永続劣化して見える。手動調査(ckan_package_id IS NULL)の
    // 鮮度は別途365日ルールで管理されるため、こちらも30日閾値の対象外。
    const report = buildHealthReport(
      [
        row({ id: "ds-frozen-old", fetchedAt: "2026-01-01T00:00:00.000Z", frozen: 1 }),
        row({ id: "ds-manual-old", fetchedAt: "2026-01-01T00:00:00.000Z", ckanPackageId: null }),
        row({ id: "ds-monitored-old", fetchedAt: "2026-01-01T00:00:00.000Z" }),
      ],
      NOW,
    );

    expect(report.staleCount).toBe(1);
    expect(report.unmonitoredCount).toBe(2);
    // 行単位の staleDays は監視対象外でも従来どおり返す(参考情報)。
    expect(report.datasets.every((d) => d.staleDays > 30)).toBe(true);
  });

  it("手動調査データ(license=manual-fact-verified)は fetched_at が366日超過で staleCount に数える(外部コードレビューP1是正)", () => {
    const fetchedAt = new Date(NOW.getTime() - 366 * 24 * 60 * 60 * 1000).toISOString();
    const report = buildHealthReport(
      [row({ id: "ds-manual-expired", license: MANUAL_SURVEY_LICENSE, ckanPackageId: null, fetchedAt })],
      NOW,
    );

    expect(report.staleCount).toBe(1);
    expect(report.deadCount).toBe(0);
    expect(report.unmonitoredCount).toBe(0);
    expect(report.datasets[0]).toMatchObject({ unmonitored: false, kind: "manual-expired" });
  });

  it("手動調査データ(license=manual-fact-verified)は fetched_at が365日以内なら staleCount に数えない", () => {
    const fetchedAt = new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const report = buildHealthReport(
      [row({ id: "ds-manual-fresh", license: MANUAL_SURVEY_LICENSE, ckanPackageId: null, fetchedAt })],
      NOW,
    );

    expect(report.staleCount).toBe(0);
    expect(report.deadCount).toBe(0);
    expect(report.unmonitoredCount).toBe(0);
    expect(report.datasets[0]).toMatchObject({ unmonitored: false, kind: "manual-expired" });
  });

  it("手動調査データは is_alive=0 でも deadCount に数えない(workflow.ts が意図的に書き込む値のため)", () => {
    const fetchedAt = new Date(NOW.getTime() - 366 * 24 * 60 * 60 * 1000).toISOString();
    const report = buildHealthReport(
      [
        row({
          id: "ds-manual-expired-dead",
          license: MANUAL_SURVEY_LICENSE,
          ckanPackageId: null,
          isAlive: 0,
          fetchedAt,
        }),
      ],
      NOW,
    );

    expect(report.deadCount).toBe(0);
    expect(report.staleCount).toBe(1);
  });
});

describe("getHealthReport", () => {
  it("datasets から license・frozen・ckan_package_id を含めて読み取り、集計結果を返す", async () => {
    const preparedSql: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql);
        return {
          all: vi.fn(async () => ({
            results: [
              row({ id: "ds-frozen", isAlive: 0, frozen: 1 }),
              row({ id: "ds-dead", isAlive: 0 }),
            ],
          })),
        };
      }),
    } as unknown as D1Database;

    const report = await getHealthReport(db, NOW);

    expect(preparedSql[0]).toContain("license");
    expect(preparedSql[0]).toContain("frozen");
    expect(preparedSql[0]).toContain("ckan_package_id");
    expect(report.deadCount).toBe(1);
    expect(report.unmonitoredCount).toBe(1);
  });

  it("results が空でも空集計を返す", async () => {
    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(async () => ({ results: undefined })),
      })),
    } as unknown as D1Database;

    const report = await getHealthReport(db, NOW);

    expect(report).toEqual({ datasets: [], staleCount: 0, deadCount: 0, unmonitoredCount: 0 });
  });
});
