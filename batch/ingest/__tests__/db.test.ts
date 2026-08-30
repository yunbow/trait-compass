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
import { buildDatasetRow, clearPendingVectorDeletions, fetchPendingVectorDeletionIds, upsertDataset, upsertFacilities } from "../db";
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
  /**
   * `existingFacilityIds` は deleteStaleFacilities の冒頭 SELECT が返す「D1に既に存在する
   * facility_id」の一覧(既定は空 = 削除同期の対象なし)。既存テスト(座標・lifestage 等)は
   * この値を指定しないため、常に空を返し、db.batch は upsert 用の1回だけ呼ばれる
   * (deleteStaleFacilities は staleIds が0件なら db.batch を呼ばずに早期returnするため)。
   */
  function createFakeBatchDb(existingFacilityIds: string[] = []) {
    const prepareCalls: string[] = [];
    const bindCalls: unknown[][] = [];

    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        return {
          bind: vi.fn((...args: unknown[]) => {
            bindCalls.push(args);
            return {
              statement: sql,
              args,
              all: vi.fn(async () => ({ results: existingFacilityIds.map((id) => ({ id })) })),
            };
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

    expect(prepareCalls[1]).toContain("lat = COALESCE(excluded.lat, lat)");
    expect(prepareCalls[1]).toContain("lng = COALESCE(excluded.lng, lng)");
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
    expect(bindCalls[1][17]).toBe(35.7127);
    expect(bindCalls[1][18]).toBe(139.7798);
  });

  it("座標列を持たないデータセット(既存の ds-tokyo-fukushi-shisetsu 等)の再取込では lat/lng を null で bind し、COALESCE により既存のジオコーディング結果を上書きしない", async () => {
    const { db, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-tokyo-fukushi-shisetsu", [
      makeFacility({ id: "fac-tokyo0001", datasetId: "ds-tokyo-fukushi-shisetsu", lat: null, lng: null }),
    ]);

    expect(bindCalls[1][17]).toBeNull();
    expect(bindCalls[1][18]).toBeNull();
  });

  it("is_out_of_scope が INSERT 列・ON CONFLICT 更新句の双方に含まれ、値が bind される(true→1, false→0、migration 0011)", async () => {
    const { db, prepareCalls, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-fukushi-shisetsu", [
      makeFacility({ id: "fac-taito0002", isOutOfScope: true }),
    ]);

    expect(prepareCalls[1]).toContain("is_out_of_scope");
    expect(prepareCalls[1]).toContain("is_out_of_scope = excluded.is_out_of_scope");
    // bind 引数の並び(?1〜?20)の12番目(0-indexedで11)が is_out_of_scope(is_medical の直後、
    // lifestage_min/max は facility_subtype の後ろに位置するためこの列の位置には影響しない。
    // municipality_code 追加分だけ全体が1列分後方へずれている)。
    expect(bindCalls[1][11]).toBe(1);
  });

  // ============================================================
  // lifestage_min/lifestage_max(migration 0016、facility_subtype の直後・lat/lng の直前に追加)
  // ============================================================

  it("lifestage_min/lifestage_max が INSERT 列・ON CONFLICT 更新句の双方に含まれる", async () => {
    const { db, prepareCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-hoiku-shisetsu", [
      makeFacility({ id: "fac-hoiku0001", lifestageMin: 0, lifestageMax: 0 }),
    ]);

    expect(prepareCalls[1]).toContain("lifestage_min");
    expect(prepareCalls[1]).toContain("lifestage_max");
    expect(prepareCalls[1]).toContain("lifestage_min = excluded.lifestage_min");
    expect(prepareCalls[1]).toContain("lifestage_max = excluded.lifestage_max");
  });

  it("lifestageMin/lifestageMax が数値の facility は、bind 引数(0-indexedで16番目・17番目、facility_subtype の直後)にその値をそのまま bind する", async () => {
    const { db, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-hoiku-shisetsu", [
      makeFacility({ id: "fac-hoiku0002", lifestageMin: 0, lifestageMax: 0 }),
    ]);

    expect(bindCalls[1][15]).toBe(0);
    expect(bindCalls[1][16]).toBe(0);
  });

  it("lifestageMin/lifestageMax が null(細分なし)の facility は null を bind する(既存データセットの回帰確認)", async () => {
    const { db, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-tokyo-fukushi-shisetsu", [
      makeFacility({ id: "fac-tokyo0002", lifestageMin: null, lifestageMax: null }),
    ]);

    expect(bindCalls[1][15]).toBeNull();
    expect(bindCalls[1][16]).toBeNull();
  });

  it("isOutOfScope=false の facility は is_out_of_scope に 0 を bind する", async () => {
    const { db, bindCalls } = createFakeBatchDb();

    await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-kuyakusho", [
      makeFacility({ isOutOfScope: false }),
    ]);

    expect(bindCalls[1][11]).toBe(0);
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

  it("facilities が空配列の場合は db.batch を呼ばない(既存データを巻き込んで全削除しないため、deleteStaleFacilities 自体を呼ばない)", async () => {
    const { db } = createFakeBatchDb(["fac-old-1", "fac-old-2"]);

    const deletedFacilityIds = await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-jidokan", []);

    expect(db.batch).not.toHaveBeenCalled();
    // 2026-08(Vectorize削除同期対応): facilities.length===0 の早期returnは常に空配列を返す。
    expect(deletedFacilityIds).toEqual([]);
  });

  // ============================================================
  // 削除同期(deleteStaleFacilities、外部コードレビュー指摘 P0-3: CKAN取込がUPSERTのみで
  // 削除・名称変更を同期しない)
  // ============================================================

  it("配信元から消えた施設(既存にはあるが今回の正規化結果に無いID)を facility_tags → facilities の順で削除する", async () => {
    const { db, prepareCalls, bindCalls } = createFakeBatchDb(["fac-a", "fac-removed"]);

    const deletedFacilityIds = await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-kuyakusho", [
      makeFacility({ id: "fac-a" }),
    ]);

    // db.batch が2回呼ばれる: ①削除同期(facility_tags→facilities→pending_vector_deletions)、②upsert。
    expect(db.batch).toHaveBeenCalledTimes(2);
    const deleteBatchCall = (db.batch as ReturnType<typeof vi.fn>).mock.calls[0][0] as unknown[];
    // 2026-08是正(外部コードレビュー指摘 項目1): 削除と同一バッチで pending_vector_deletions
    // (Vectorize削除同期のoutbox)への記録も行うため3文になる。
    expect(deleteBatchCall).toHaveLength(3);

    const tagsDeleteIndex = prepareCalls.findIndex((sql) => sql.includes("DELETE FROM facility_tags"));
    const facilitiesDeleteIndex = prepareCalls.findIndex((sql) => sql.includes("DELETE FROM facilities WHERE id IN"));
    const pendingDeletionInsertIndex = prepareCalls.findIndex((sql) => sql.includes("INSERT OR IGNORE INTO pending_vector_deletions"));
    expect(tagsDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(facilitiesDeleteIndex).toBeGreaterThan(tagsDeleteIndex);
    expect(pendingDeletionInsertIndex).toBeGreaterThan(facilitiesDeleteIndex);
    // 削除対象は「今回の正規化結果に含まれない fac-removed」のみ、現存する fac-a は対象外。
    expect(bindCalls[tagsDeleteIndex]).toEqual(["fac-removed"]);
    expect(bindCalls[facilitiesDeleteIndex]).toEqual(["fac-removed"]);
    expect(bindCalls[pendingDeletionInsertIndex]).toEqual(["fac-removed"]);
    // 2026-08(Vectorize削除同期対応): upsertFacilities は削除した stale facility ID を返す
    // (workers/ingest/workflow.ts が Vectorize 側の VectorStore.delete に使う)。
    expect(deletedFacilityIds).toEqual(["fac-removed"]);
  });

  it("名称・住所変更でIDが変わったケース(旧IDが既存に残り、新IDが今回の結果に含まれる)も削除同期の対象になる(重複行の防止)", async () => {
    const { db, bindCalls, prepareCalls } = createFakeBatchDb(["fac-old-name-hash"]);

    const deletedFacilityIds = await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-kuyakusho", [
      makeFacility({ id: "fac-new-name-hash" }),
    ]);

    const facilitiesDeleteIndex = prepareCalls.findIndex((sql) => sql.includes("DELETE FROM facilities WHERE id IN"));
    expect(bindCalls[facilitiesDeleteIndex]).toEqual(["fac-old-name-hash"]);
    expect(deletedFacilityIds).toEqual(["fac-old-name-hash"]);
  });

  it("既存の全facilityIDが今回の結果にも含まれる場合は削除同期をスキップする(db.batchはupsertの1回のみ)", async () => {
    const { db } = createFakeBatchDb(["fac-a"]);

    const deletedFacilityIds = await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-kuyakusho", [
      makeFacility({ id: "fac-a" }),
    ]);

    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(deletedFacilityIds).toEqual([]);
  });

  it("削除対象が91件(MAX_IDS_PER_QUERY=90超)の場合、2チャンクに分けて削除し、削除ID全件(91件)を返す", async () => {
    const staleIds = Array.from({ length: 91 }, (_, i) => `fac-stale-${i}`);
    const { db } = createFakeBatchDb(["fac-a", ...staleIds]);

    const deletedFacilityIds = await upsertFacilities(db as unknown as Parameters<typeof upsertFacilities>[0], "ds-taito-kuyakusho", [
      makeFacility({ id: "fac-a" }),
    ]);

    // 削除チャンク2回 + upsert 1回 = 3回。
    expect(db.batch).toHaveBeenCalledTimes(3);
    // チャンク分割(MAX_IDS_PER_QUERY超)されても、返り値には削除対象91件全てが含まれる。
    expect(deletedFacilityIds).toEqual(staleIds);
  });
});

// ============================================================
// pending_vector_deletions(Vectorize削除同期のoutbox、外部コードレビュー指摘 項目1)
// ============================================================

describe("fetchPendingVectorDeletionIds / clearPendingVectorDeletions", () => {
  function createFakeDb(existingIds: string[] = []) {
    const prepareCalls: string[] = [];
    const bindCalls: unknown[][] = [];
    const runCalls: string[] = [];

    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        return {
          bind: vi.fn((...args: unknown[]) => {
            bindCalls.push(args);
            return {
              all: vi.fn(async () => ({ results: existingIds.map((id) => ({ id })) })),
              run: vi.fn(async () => ({})),
            };
          }),
          all: vi.fn(async () => ({ results: existingIds.map((id) => ({ id })) })),
          run: vi.fn(async () => {
            runCalls.push(sql);
            return {};
          }),
        };
      }),
    };

    return { db, prepareCalls, bindCalls, runCalls };
  }

  it("fetchPendingVectorDeletionIds は、先にfacilitiesに現存するfacility_idをoutboxから取り除いてから、残りの全facility_idを返す", async () => {
    const { db, prepareCalls } = createFakeDb(["fac-a", "fac-b"]);

    const ids = await fetchPendingVectorDeletionIds(db as unknown as Parameters<typeof fetchPendingVectorDeletionIds>[0]);

    // ①先にpurge(DELETE ... WHERE facility_id IN (SELECT id FROM facilities))、②その後SELECT、の順。
    expect(prepareCalls[0]).toContain("DELETE FROM pending_vector_deletions WHERE facility_id IN (SELECT id FROM facilities)");
    expect(prepareCalls[1]).toContain("SELECT facility_id AS id FROM pending_vector_deletions");
    expect(ids).toEqual(["fac-a", "fac-b"]);
  });

  // 2026-08是正(オーケストレーターレビュー指摘、クロス実行エッジケース): 実行Nで削除された
  // facility Xがoutboxに残ったまま、実行N+1で同じ内容ハッシュidで再作成された場合、
  // embed pipelineの全件upsert(Xの生きたベクトルもここで書き込まれる)の後にoutbox全行を
  // VectorStore.deleteしてしまうと、直前にupsertしたXの生きたベクトルを誤って削除してしまう。
  // fetchPendingVectorDeletionIdsがSELECT前に「facilitiesに現存するfacility_id」をpurgeする
  // ことで、この誤削除を防ぐ(このテストではrunSql呼び出しの実行自体を確認する。実際に
  // facilitiesに現存するかどうかの判定はSQLのサブクエリに委ねているため、フェイクDBの
  // all()モックはpurge後のSELECT結果を模すのみで、purgeの中身のSQL実行はrunCallsで検証する)。
  it("purgeのDELETE文はSELECT前に1回だけ実行される(runで呼ばれる、bind不要)", async () => {
    const { db, runCalls } = createFakeDb(["fac-a"]);

    await fetchPendingVectorDeletionIds(db as unknown as Parameters<typeof fetchPendingVectorDeletionIds>[0]);

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]).toContain("DELETE FROM pending_vector_deletions WHERE facility_id IN (SELECT id FROM facilities)");
  });

  it("clearPendingVectorDeletions は指定したfacility_idをDELETEする", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb();

    await clearPendingVectorDeletions(db as unknown as Parameters<typeof clearPendingVectorDeletions>[0], ["fac-a", "fac-b"]);

    expect(prepareCalls[0]).toContain("DELETE FROM pending_vector_deletions WHERE facility_id IN");
    expect(bindCalls[0]).toEqual(["fac-a", "fac-b"]);
  });

  it("clearPendingVectorDeletions は空配列の場合、DBへ問い合わせしない", async () => {
    const { db } = createFakeDb();

    await clearPendingVectorDeletions(db as unknown as Parameters<typeof clearPendingVectorDeletions>[0], []);

    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("clearPendingVectorDeletions は91件(MAX_IDS_PER_QUERY=90超)の場合、2チャンクに分けてDELETEする", async () => {
    const ids = Array.from({ length: 91 }, (_, i) => `fac-${i}`);
    const { db } = createFakeDb();

    await clearPendingVectorDeletions(db as unknown as Parameters<typeof clearPendingVectorDeletions>[0], ids);

    expect(db.prepare).toHaveBeenCalledTimes(2);
  });

  // ============================================================
  // 1回のWorkflow実行で処理する件数の上限(poison queue対策、MAX_PENDING_DELETIONS_PER_RUN=5000)
  // ============================================================

  it("fetchPendingVectorDeletionIds はSELECTにLIMIT句を付け、上限件数を超える分は今回取得しない(残りは次回実行に委ねる)", async () => {
    const MAX_PENDING_DELETIONS_PER_RUN = 5000;
    const allPendingIds = Array.from({ length: MAX_PENDING_DELETIONS_PER_RUN + 5 }, (_, i) => `fac-pending-${i}`);

    const prepareCalls: string[] = [];
    const bindCalls: unknown[][] = [];

    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        if (sql.includes("DELETE FROM pending_vector_deletions WHERE facility_id IN (SELECT id FROM facilities)")) {
          return { run: vi.fn(async () => ({})) };
        }
        // LIMIT の効果をフェイクDB側でも再現する(実際のD1のLIMIT句の挙動を模す)。
        return {
          bind: vi.fn((...args: unknown[]) => {
            bindCalls.push(args);
            const limit = args[0] as number;
            return { all: vi.fn(async () => ({ results: allPendingIds.slice(0, limit).map((id) => ({ id })) })) };
          }),
        };
      }),
    };

    const ids = await fetchPendingVectorDeletionIds(db as unknown as Parameters<typeof fetchPendingVectorDeletionIds>[0]);

    expect(prepareCalls[1]).toContain("LIMIT");
    expect(bindCalls[0]).toEqual([MAX_PENDING_DELETIONS_PER_RUN]);
    expect(ids).toHaveLength(MAX_PENDING_DELETIONS_PER_RUN);
    // 上限を超えた末尾の5件は今回のIDに含まれない(次回実行の fetchPendingVectorDeletionIds で
    // outboxに残っている分として再取得される想定)。
    expect(ids).not.toContain(`fac-pending-${MAX_PENDING_DELETIONS_PER_RUN}`);
  });
});
