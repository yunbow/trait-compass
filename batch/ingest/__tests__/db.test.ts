// buildDatasetRow(純関数)・upsertDataset(SQL 組み立て)のテスト(TICKET-0033)。
//
// db.ts のうち D1 への実アクセス部分は wrangler dev のローカル D1 で統合確認する方針
// (db.ts 冒頭コメント)だが、buildDatasetRow は純関数、upsertDataset の SQL 文字列・
// bind 引数はフェイク D1 で検査できる(src/features/support/__tests__/facility-search.test.ts
// の createFakeDb と同じパターン)。datasets.frozen 列(TICKET-0033 AC-2)が
// frozen-meta-only / license-hold / 通常のどの経路でも書き込まれることを担保する。

import { describe, expect, it, vi } from "vitest";

import { classifyLicense } from "../../../app/src/features/data-ingest/services/licenseClassifier";
import { INGEST_DATASETS } from "../datasets.config";
import { buildDatasetRow, upsertDataset, upsertFacilities } from "../db";
import type { DatasetRow } from "../db";
import type { NormalizedFacility } from "../transform";

function makeRow(overrides: Partial<DatasetRow> = {}): DatasetRow {
  return {
    id: "ds-a",
    ckanPackageId: "pkg-a",
    title: "ダミーデータセット",
    sourceOrg: "東京都福祉局",
    license: "cc-by-4.0",
    riskLevel: "low",
    sourceUrl: "https://example.com/resource",
    fetchedAt: "2026-07-01T00:00:00.000Z",
    freshnessNote: null,
    isAlive: 1,
    frozen: 0,
    ...overrides,
  };
}

describe("buildDatasetRow", () => {
  const fetchedAt = "2026-07-07T00:00:00.000Z";

  it("frozen 指定のデータセット(こどもDX)は frozen=1 として組み立てる(FR-034 AC-6, TICKET-0033)", () => {
    const dataset = INGEST_DATASETS.find((d) => d.id === "ds-kodomo-dx-registry")!;
    const row = buildDatasetRow({
      dataset,
      license: classifyLicense(dataset.license),
      fetchedAt,
      sourceUrl: null,
      notes: [],
      isAlive: 1,
    });

    expect(row.frozen).toBe(1);
  });

  it("frozen 未指定のデータセットは frozen=0 として組み立てる", () => {
    const dataset = INGEST_DATASETS.find((d) => d.id === "ds-tokyo-fukushi-shisetsu")!;
    const row = buildDatasetRow({
      dataset,
      license: classifyLicense(dataset.license),
      fetchedAt,
      sourceUrl: "https://example.com/resource",
      notes: ["注記"],
      isAlive: 1,
    });

    expect(row.frozen).toBe(0);
    expect(row.freshnessNote).toBe("注記");
  });

  it("notes が空の場合 freshnessNote は null(既存分の回帰確認)", () => {
    const dataset = INGEST_DATASETS.find((d) => d.id === "ds-tokyo-fukushi-shisetsu")!;
    const row = buildDatasetRow({
      dataset,
      license: classifyLicense(dataset.license),
      fetchedAt,
      sourceUrl: null,
      notes: [],
      isAlive: 0,
    });

    expect(row.freshnessNote).toBeNull();
    expect(row.isAlive).toBe(0);
  });
});

describe("upsertDataset", () => {
  function createFakeDb() {
    const prepareCalls: string[] = [];
    const bindCalls: unknown[][] = [];

    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        return {
          bind: vi.fn((...args: unknown[]) => {
            bindCalls.push(args);
            return { run: vi.fn(async () => ({})) };
          }),
        };
      }),
    };

    return { db, prepareCalls, bindCalls };
  }

  it("INSERT 列・ON CONFLICT 更新の双方に frozen を含み、値を bind で渡す(TICKET-0033)", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb();

    await upsertDataset(db as unknown as Parameters<typeof upsertDataset>[0], makeRow({ frozen: 1 }));

    expect(prepareCalls[0]).toContain("frozen");
    expect(prepareCalls[0]).toContain("frozen = excluded.frozen");
    // bind 引数の並び(?1〜?11)の末尾が is_alive, frozen であること。
    expect(bindCalls[0].slice(-2)).toEqual([1, 1]);
  });

  it("frozen=0 の行はそのまま 0 を bind する", async () => {
    const { db, bindCalls } = createFakeDb();

    await upsertDataset(db as unknown as Parameters<typeof upsertDataset>[0], makeRow({ frozen: 0, isAlive: 0 }));

    expect(bindCalls[0].slice(-2)).toEqual([0, 0]);
  });
});

// ============================================================
// upsertFacilities の lat/lng COALESCE(台東区6データセット、TICKET-0011作業ログ 7564a94)
// ============================================================

describe("upsertFacilities", () => {
  function createFakeBatchDb() {
    const prepareCalls: string[] = [];
    const bindCalls: unknown[][] = [];

    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        return {
          bind: vi.fn((...args: unknown[]) => {
            bindCalls.push(args);
            return { statement: sql, args };
          }),
        };
      }),
      batch: vi.fn(async (statements: unknown[]) => statements.map(() => ({}))),
    };

    return { db, prepareCalls, bindCalls };
  }

  function makeFacility(overrides: Partial<NormalizedFacility> = {}): NormalizedFacility {
    return {
      id: "fac-taito0001",
      datasetId: "ds-taito-kuyakusho",
      name: "区役所",
      categoryType: "相談窓口",
      municipality: "台東区",
      municipalityCode: "13106",
      address: "台東区東上野4丁目5番6号",
      phone: "03-5246-1111",
      url: null,
      ageRange: "both",
      isMedical: false,
      isOutOfScope: false,
      description: null,
      contactMethods: null,
      facilitySubtype: null,
      lifestageMin: null,
      lifestageMax: null,
      lat: null,
      lng: null,
      rawJson: "{}",
      ...overrides,
    };
  }

  it("SQL に lat/lng の ON CONFLICT 更新句として COALESCE(excluded.lat, lat) / COALESCE(excluded.lng, lng) を含む", async () => {
    const { db, prepareCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-kuyakusho", [
      makeFacility(),
    ]);

    expect(prepareCalls[0]).toContain("lat = COALESCE(excluded.lat, lat)");
    expect(prepareCalls[0]).toContain("lng = COALESCE(excluded.lng, lng)");
  });

  it("CSV に直接マッピングされた有効な座標(台東区の X座標/Y座標 由来)は lat/lng として bind される", async () => {
    const { db, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-kuyakusho", [
      makeFacility({ lat: 35.7127, lng: 139.7798 }),
    ]);

    // bind 引数の並び(?1〜?20)の18番目(0-indexedで17)が lat、19番目(18)が lng
    // (is_out_of_scope 追加により is_medical の直後へ1列分ずれ、facility_subtype 追加分と
    // 合わせて lat/lng が contact_methods・facility_subtype の直後へずれ、migration 0016 の
    // lifestage_min/lifestage_max(facility_subtype の直後、lat/lng の直前)追加により
    // 2列分さらに後方へずれ、さらに全国版移行 Phase 1 の municipality_code(municipality の直後)
    // 追加により1列分後方へずれている)。
    expect(bindCalls[0][17]).toBe(35.7127);
    expect(bindCalls[0][18]).toBe(139.7798);
  });

  it("座標列を持たないデータセット(既存の ds-tokyo-fukushi-shisetsu 等)の再取込では lat/lng を null で bind し、COALESCE により既存のジオコーディング結果を上書きしない", async () => {
    const { db, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-tokyo-fukushi-shisetsu", [
      makeFacility({ id: "fac-tokyo0001", datasetId: "ds-tokyo-fukushi-shisetsu", lat: null, lng: null }),
    ]);

    expect(bindCalls[0][17]).toBeNull();
    expect(bindCalls[0][18]).toBeNull();
  });

  it("is_out_of_scope が INSERT 列・ON CONFLICT 更新句の双方に含まれ、値が bind される(true→1, false→0、migration 0011)", async () => {
    const { db, prepareCalls, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-fukushi-shisetsu", [
      makeFacility({ id: "fac-taito0002", isOutOfScope: true }),
    ]);

    expect(prepareCalls[0]).toContain("is_out_of_scope");
    expect(prepareCalls[0]).toContain("is_out_of_scope = excluded.is_out_of_scope");
    // bind 引数の並び(?1〜?20)の12番目(0-indexedで11)が is_out_of_scope(is_medical の直後、
    // lifestage_min/max は facility_subtype の後ろに位置するためこの列の位置には影響しない。
    // municipality_code 追加分だけ全体が1列分後方へずれている)。
    expect(bindCalls[0][11]).toBe(1);
  });

  // ============================================================
  // lifestage_min/lifestage_max(migration 0016、facility_subtype の直後・lat/lng の直前に追加)
  // ============================================================

  it("lifestage_min/lifestage_max が INSERT 列・ON CONFLICT 更新句の双方に含まれる", async () => {
    const { db, prepareCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-hoiku-shisetsu", [
      makeFacility({ id: "fac-hoiku0001", lifestageMin: 0, lifestageMax: 0 }),
    ]);

    expect(prepareCalls[0]).toContain("lifestage_min");
    expect(prepareCalls[0]).toContain("lifestage_max");
    expect(prepareCalls[0]).toContain("lifestage_min = excluded.lifestage_min");
    expect(prepareCalls[0]).toContain("lifestage_max = excluded.lifestage_max");
  });

  it("lifestageMin/lifestageMax が数値の facility は、bind 引数(0-indexedで16番目・17番目、facility_subtype の直後)にその値をそのまま bind する", async () => {
    const { db, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-hoiku-shisetsu", [
      makeFacility({ id: "fac-hoiku0002", lifestageMin: 0, lifestageMax: 0 }),
    ]);

    expect(bindCalls[0][15]).toBe(0);
    expect(bindCalls[0][16]).toBe(0);
  });

  it("lifestageMin/lifestageMax が null(細分なし)の facility は null を bind する(既存データセットの回帰確認)", async () => {
    const { db, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-tokyo-fukushi-shisetsu", [
      makeFacility({ id: "fac-tokyo0002", lifestageMin: null, lifestageMax: null }),
    ]);

    expect(bindCalls[0][15]).toBeNull();
    expect(bindCalls[0][16]).toBeNull();
  });

  it("isOutOfScope=false の facility は is_out_of_scope に 0 を bind する", async () => {
    const { db, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-kuyakusho", [
      makeFacility({ isOutOfScope: false }),
    ]);

    expect(bindCalls[0][11]).toBe(0);
  });

  it("複数件を db.batch にまとめて渡す(既存の一括更新方式の回帰確認)", async () => {
    const { db } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-jidokan", [
      makeFacility({ id: "fac-a" }),
      makeFacility({ id: "fac-b", lat: 35.7, lng: 139.8 }),
    ]);

    expect(db.batch).toHaveBeenCalledTimes(1);
    expect((db.batch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(2);
  });

  it("facilities が空配列の場合は db.batch を呼ばない", async () => {
    const { db } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-jidokan", []);

    expect(db.batch).not.toHaveBeenCalled();
  });
});
