import { describe, expect, it, vi } from "vitest";

import {
  attachTagMatches,
  BROAD_AREA_MUNICIPALITY,
  buildFacilitySearchResult,
  degradeUnhealthyCategoriesToBroadArea,
  EXPIRED_MANUAL_DATA_DEGRADE_MESSAGE,
  UNHEALTHY_DATASET_DEGRADE_MESSAGE,
  // FACILITY_BASE_WHERE / FACILITY_JOIN_SELECT / lifestageFilterClause は
  // facility-join-select-column-list 設計(searchFacilities / fetchFacilitiesByIds /
  // fetchFacilityById の3箇所に24列の SELECT 句がベタ書き重複している問題への対応)で
  // 新設予定の定数・関数。実装されるまでこのインポートはコンパイルエラーになる(TDD red)。
  FACILITY_BASE_WHERE,
  FACILITY_JOIN_SELECT,
  fetchFacilitiesByIds,
  fetchFacilityById,
  groupByCategoryType,
  isMunicipalityDataMissing,
  lifestageFilterClause,
  matchesSelectedTags,
  MUNICIPALITY_DATA_MISSING_MESSAGE,
  searchFacilities,
  sortByTagPriority,
  toFacilityRow,
} from "@/features/support/services/facility-search";
import { LIFESTAGE_ORDINAL } from "@/features/support/services/lifestage-mapping";
import { BROAD_AREA_MUNICIPALITY_CODE } from "@/features/support/constants/municipality-codes";
import type { CategoryType } from "@/features/support/constants/category-types";
import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import type { FacilityRow, FacilityWithTags } from "@/features/support/services/facility-search";

function makeFacility(overrides: Partial<FacilityWithTags> = {}): FacilityWithTags {
  return {
    id: "fac-001",
    datasetId: "ds-a",
    name: "ダミー窓口",
    categoryType: "相談窓口",
    municipality: "世田谷区",
    municipalityCode: "13112",
    address: "東京都世田谷区XX",
    phone: "03-0000-0000",
    url: "https://example.com",
    ageRange: "both",
    description: "説明文",
    datasetTitle: "ダミーデータセット",
    sourceOrg: "東京都福祉局",
    license: "cc-by-4.0",
    riskLevel: "low",
    sourceUrl: "https://example.com/dataset",
    facilitySubtype: null,
    lat: null,
    lng: null,
    fetchedAt: "2026-07-01T00:00:00.000Z",
    frozen: false,
    noDiagnosisOk: false,
    contactMethods: null,
    tags: [],
    matchesTags: true,
    ...overrides,
  };
}

function emptyByCategory<T>(): Record<CategoryType, T[]> {
  return Object.fromEntries(CATEGORY_TYPES.map((type) => [type, [] as T[]])) as Record<CategoryType, T[]>;
}

describe("matchesSelectedTags", () => {
  it("選択タグが空(全般)の場合は常に true", () => {
    expect(matchesSelectedTags([], [])).toBe(true);
    expect(matchesSelectedTags(["こだわり"], [])).toBe(true);
  });

  it("facility のタグと選択タグが1つでも重なれば true", () => {
    expect(matchesSelectedTags(["こだわり", "感覚"], ["感覚"])).toBe(true);
  });

  it("重ならない場合は false", () => {
    expect(matchesSelectedTags(["こだわり"], ["感覚"])).toBe(false);
  });

  it("facility にタグが無い場合は false(選択タグが空でない限り)", () => {
    expect(matchesSelectedTags([], ["感覚"])).toBe(false);
  });
});

describe("sortByTagPriority", () => {
  it("タグ一致(matchesTags=true)を先頭にする(タグ不一致は除外せず後方に残す)", () => {
    const rows = [
      makeFacility({ id: "fac-no-match", matchesTags: false }),
      makeFacility({ id: "fac-match", matchesTags: true }),
    ];

    const sorted = sortByTagPriority(rows);

    expect(sorted.map((r) => r.id)).toEqual(["fac-match", "fac-no-match"]);
    // 除外されていないことを確認(タグ不一致でも広域窓口等は残る)。
    expect(sorted.length).toBe(2);
  });

  it("一致内・不一致内では元の相対順序を維持する(安定ソート)", () => {
    const rows = [
      makeFacility({ id: "fac-a", matchesTags: true }),
      makeFacility({ id: "fac-b", matchesTags: false }),
      makeFacility({ id: "fac-c", matchesTags: true }),
      makeFacility({ id: "fac-d", matchesTags: false }),
    ];

    const sorted = sortByTagPriority(rows);

    expect(sorted.map((r) => r.id)).toEqual(["fac-a", "fac-c", "fac-b", "fac-d"]);
  });

  it("入力配列を破壊しない", () => {
    const rows = [makeFacility({ id: "fac-1", matchesTags: false }), makeFacility({ id: "fac-2", matchesTags: true })];
    const original = [...rows];

    sortByTagPriority(rows);

    expect(rows).toEqual(original);
  });
});

describe("isMunicipalityDataMissing", () => {
  it("入力区市町村コードと一致する行が1件でもあれば false", () => {
    const rows = [{ municipalityCode: "13112" }, { municipalityCode: BROAD_AREA_MUNICIPALITY_CODE }];
    expect(isMunicipalityDataMissing(rows, "13112")).toBe(false);
  });

  it("広域(13000)のみが残っている場合は true(FR-022 フォールバック対象)", () => {
    const rows = [{ municipalityCode: BROAD_AREA_MUNICIPALITY_CODE }];
    expect(isMunicipalityDataMissing(rows, "13307")).toBe(true); // 檜原村
  });

  it("結果が0件の場合も true", () => {
    expect(isMunicipalityDataMissing([], "13112")).toBe(true);
  });
});

describe("groupByCategoryType", () => {
  it("4分類すべてのキーを持つ(該当0件でも空配列で存在する)", () => {
    const grouped = groupByCategoryType([]);
    expect(Object.keys(grouped).sort()).toEqual(["支援制度", "発達障害支援資料", "相談窓口", "福祉ガイド"].sort());
    expect(grouped["相談窓口"]).toEqual([]);
    expect(grouped["支援制度"]).toEqual([]);
    expect(grouped["福祉ガイド"]).toEqual([]);
    expect(grouped["発達障害支援資料"]).toEqual([]);
  });

  it("category_type ごとに正しく振り分ける", () => {
    const rows = [
      makeFacility({ id: "fac-soudan", categoryType: "相談窓口" }),
      makeFacility({ id: "fac-seido", categoryType: "支援制度" }),
      makeFacility({ id: "fac-soudan-2", categoryType: "相談窓口" }),
    ];

    const grouped = groupByCategoryType(rows);

    expect(grouped["相談窓口"].map((r) => r.id)).toEqual(["fac-soudan", "fac-soudan-2"]);
    expect(grouped["支援制度"].map((r) => r.id)).toEqual(["fac-seido"]);
  });
});

describe("attachTagMatches", () => {
  it("Map に無い facility は tags=[] かつ matchesTags は選択タグの有無に従う", () => {
    const rows: FacilityRow[] = [makeFacility({ id: "fac-untagged" })];
    const result = attachTagMatches(rows, new Map(), []);
    expect(result[0].tags).toEqual([]);
    expect(result[0].matchesTags).toBe(true);

    const resultWithTagFilter = attachTagMatches(rows, new Map(), ["感覚"]);
    expect(resultWithTagFilter[0].matchesTags).toBe(false);
  });

  it("Map にある facility はそのタグを付与し、一致判定を行う", () => {
    const rows: FacilityRow[] = [makeFacility({ id: "fac-tagged" })];
    const tagsByFacilityId = new Map([["fac-tagged", ["こだわり", "感覚"]]]);

    const result = attachTagMatches(rows, tagsByFacilityId, ["感覚"]);

    expect(result[0].tags).toEqual(["こだわり", "感覚"]);
    expect(result[0].matchesTags).toBe(true);
  });
});

describe("buildFacilitySearchResult", () => {
  it("入力区市町村コードのデータがある場合は isFallback=false、fallbackMessage=null", () => {
    const rows = [makeFacility({ id: "fac-local", municipality: "世田谷区", municipalityCode: "13112" })];
    const result = buildFacilitySearchResult(rows, "13112");

    expect(result.isFallback).toBe(false);
    expect(result.fallbackMessage).toBeNull();
  });

  it("広域のみが残る場合は isFallback=true、案内文言を含む(FR-022, AC-3)", () => {
    const rows = [makeFacility({ id: "fac-broad", municipality: BROAD_AREA_MUNICIPALITY, municipalityCode: BROAD_AREA_MUNICIPALITY_CODE })];
    const result = buildFacilitySearchResult(rows, "13307"); // 檜原村

    expect(result.isFallback).toBe(true);
    expect(result.fallbackMessage).toBe(MUNICIPALITY_DATA_MISSING_MESSAGE);
    expect(result.facilitiesByCategory["相談窓口"].map((r) => r.id)).toEqual(["fac-broad"]);
  });

  it("タグ一致優先ソート・タブ別グループ化の両方を適用する", () => {
    const rows = [
      makeFacility({ id: "fac-no-match", categoryType: "相談窓口", municipality: "世田谷区", municipalityCode: "13112", matchesTags: false }),
      makeFacility({ id: "fac-match", categoryType: "相談窓口", municipality: "世田谷区", municipalityCode: "13112", matchesTags: true }),
    ];

    const result = buildFacilitySearchResult(rows, "13112");

    expect(result.facilitiesByCategory["相談窓口"].map((r) => r.id)).toEqual(["fac-match", "fac-no-match"]);
  });
});

describe("EXPIRED_MANUAL_DATA_DEGRADE_MESSAGE", () => {
  it("UNHEALTHY_DATASET_DEGRADE_MESSAGE とは異なる専用文言である(AC-3)", () => {
    expect(EXPIRED_MANUAL_DATA_DEGRADE_MESSAGE).not.toBe(UNHEALTHY_DATASET_DEGRADE_MESSAGE);
    expect(EXPIRED_MANUAL_DATA_DEGRADE_MESSAGE).toContain("有効期限");
  });
});

describe("degradeUnhealthyCategoriesToBroadArea", () => {
  it("不健全データセットが無ければ入力をそのまま(コピーを)返し、degradedCategories は空", () => {
    const byCategory = emptyByCategory<FacilityWithTags>();
    byCategory["相談窓口"] = [makeFacility({ id: "fac-a", datasetId: "ds-a" })];

    const result = degradeUnhealthyCategoriesToBroadArea(byCategory, new Set());

    expect(result.degradedCategories).toEqual([]);
    expect(result.facilitiesByCategory["相談窓口"].map((r) => r.id)).toEqual(["fac-a"]);
    // 入力を破壊しない(コピーを返す)。
    expect(result.facilitiesByCategory["相談窓口"]).not.toBe(byCategory["相談窓口"]);
  });

  it("不健全データセット由来の行を含む分野は、広域(municipalityCode='13000')以外を除外する(TICKET-0033 AC-3、全国版移行 Phase 1でコード比較に変更)", () => {
    const byCategory = emptyByCategory<FacilityWithTags>();
    byCategory["相談窓口"] = [
      makeFacility({ id: "fac-local", datasetId: "ds-unhealthy", municipality: "世田谷区", municipalityCode: "13112" }),
      makeFacility({ id: "fac-broad", datasetId: "ds-unhealthy", municipality: BROAD_AREA_MUNICIPALITY, municipalityCode: BROAD_AREA_MUNICIPALITY_CODE }),
    ];

    const result = degradeUnhealthyCategoriesToBroadArea(byCategory, new Set(["ds-unhealthy"]));

    expect(result.degradedCategories).toEqual(["相談窓口"]);
    expect(result.facilitiesByCategory["相談窓口"].map((r) => r.id)).toEqual(["fac-broad"]);
  });

  it("不健全データセットが属さない分野には影響しない", () => {
    const byCategory = emptyByCategory<FacilityWithTags>();
    byCategory["相談窓口"] = [makeFacility({ id: "fac-unhealthy", datasetId: "ds-unhealthy", municipality: "世田谷区", municipalityCode: "13112" })];
    byCategory["支援制度"] = [makeFacility({ id: "fac-healthy", datasetId: "ds-healthy", municipality: "世田谷区", municipalityCode: "13112" })];

    const result = degradeUnhealthyCategoriesToBroadArea(byCategory, new Set(["ds-unhealthy"]));

    expect(result.degradedCategories).toEqual(["相談窓口"]);
    expect(result.facilitiesByCategory["相談窓口"]).toEqual([]);
    expect(result.facilitiesByCategory["支援制度"].map((r) => r.id)).toEqual(["fac-healthy"]);
  });

  it("縮退対象の分野に広域窓口が1件も無い場合は空配列になる(医療機関が再混入することはない、FR-025)", () => {
    const byCategory = emptyByCategory<FacilityWithTags>();
    byCategory["相談窓口"] = [makeFacility({ id: "fac-local", datasetId: "ds-unhealthy", municipality: "世田谷区", municipalityCode: "13112" })];

    const result = degradeUnhealthyCategoriesToBroadArea(byCategory, new Set(["ds-unhealthy"]));

    expect(result.facilitiesByCategory["相談窓口"]).toEqual([]);
  });

  // 2026-08是正: /support/results は「オープンデータstale」と「手動期限切れ」の2集合を
  // degradeUnhealthyCategoriesToBroadArea へ2回チェーン適用する設計(page.tsx参照)。
  // 本関数自体は変更しないため、2回連続適用しても壊れないことをここで確認する。
  it("2段チェーン適用: 別カテゴリにそれぞれ効く(stale集合→expired集合の順)", () => {
    const byCategory = emptyByCategory<FacilityWithTags>();
    byCategory["相談窓口"] = [
      makeFacility({ id: "fac-stale-local", datasetId: "ds-stale", municipality: "世田谷区", municipalityCode: "13112" }),
      makeFacility({ id: "fac-stale-broad", datasetId: "ds-stale", municipality: BROAD_AREA_MUNICIPALITY, municipalityCode: BROAD_AREA_MUNICIPALITY_CODE }),
    ];
    byCategory["支援制度"] = [
      makeFacility({ id: "fac-expired-local", datasetId: "ds-expired", municipality: "世田谷区", municipalityCode: "13112" }),
      makeFacility({ id: "fac-expired-broad", datasetId: "ds-expired", municipality: BROAD_AREA_MUNICIPALITY, municipalityCode: BROAD_AREA_MUNICIPALITY_CODE }),
    ];

    const staleResult = degradeUnhealthyCategoriesToBroadArea(byCategory, new Set(["ds-stale"]));
    const expiredResult = degradeUnhealthyCategoriesToBroadArea(staleResult.facilitiesByCategory, new Set(["ds-expired"]));

    expect(staleResult.degradedCategories).toEqual(["相談窓口"]);
    expect(expiredResult.degradedCategories).toEqual(["支援制度"]);
    expect(expiredResult.facilitiesByCategory["相談窓口"].map((r) => r.id)).toEqual(["fac-stale-broad"]);
    expect(expiredResult.facilitiesByCategory["支援制度"].map((r) => r.id)).toEqual(["fac-expired-broad"]);
  });

  it("2段チェーン適用: 同じカテゴリが両方の集合に該当しても壊れない(2回目の縮退がそのまま適用される)", () => {
    const byCategory = emptyByCategory<FacilityWithTags>();
    byCategory["相談窓口"] = [
      makeFacility({ id: "fac-stale-local", datasetId: "ds-stale", municipality: "世田谷区", municipalityCode: "13112" }),
      makeFacility({ id: "fac-broad", datasetId: "ds-other", municipality: BROAD_AREA_MUNICIPALITY, municipalityCode: BROAD_AREA_MUNICIPALITY_CODE }),
    ];

    const staleResult = degradeUnhealthyCategoriesToBroadArea(byCategory, new Set(["ds-stale"]));
    const expiredResult = degradeUnhealthyCategoriesToBroadArea(staleResult.facilitiesByCategory, new Set(["ds-expired-not-present"]));

    expect(staleResult.degradedCategories).toEqual(["相談窓口"]);
    expect(expiredResult.degradedCategories).toEqual([]);
    expect(expiredResult.facilitiesByCategory["相談窓口"].map((r) => r.id)).toEqual(["fac-broad"]);
  });
});

// --- ここから searchFacilities(D1 アクセスを含む関数)の SQL パラメータ化検証 ---
// バインドパラメータ(`?`)のみで値を渡し、区市町村名等のユーザー入力を SQL 文字列へ直接
// 埋め込んでいないことを、フェイクの D1Database でクエリ文字列・bind 引数を検査して確認する。

interface FakeStatement {
  bind: (...args: unknown[]) => FakeStatement;
  all: () => Promise<{ results: unknown[] }>;
}

function createFakeDb(facilityRows: unknown[], tagRows: unknown[] = []) {
  const prepareCalls: string[] = [];
  const bindCalls: unknown[][] = [];
  let call = 0;

  const db = {
    prepare: vi.fn((sql: string) => {
      prepareCalls.push(sql);
      const currentCall = call;
      call += 1;
      const statement: FakeStatement = {
        bind: vi.fn((...args: unknown[]) => {
          bindCalls.push(args);
          return statement;
        }),
        all: vi.fn(async () => ({
          results: currentCall === 0 ? facilityRows : tagRows,
        })),
      };
      return statement;
    }),
  };

  return { db, prepareCalls, bindCalls };
}

function makeJoinRow(id: string) {
  return {
    id,
    dataset_id: "ds-a",
    name: `窓口 ${id}`,
    category_type: "相談窓口" as const,
    municipality: "世田谷区",
    municipality_code: "13112",
    address: null,
    phone: null,
    url: null,
    age_range: "both" as const,
    description: null,
    dataset_title: "ダミーデータセット",
    source_org: "東京都福祉局",
    license: "cc-by-4.0",
    risk_level: "low" as const,
    source_url: null,
    lat: null,
    lng: null,
    fetched_at: "2026-07-01T00:00:00.000Z",
    frozen: 0 as const,
    no_diagnosis_ok: 0 as const,
    contact_methods: null,
  };
}

describe("searchFacilities", () => {
  it("コード表に無い区市町村(横浜市)を検索すると、SQL の municipality_code bind 値には未対応を示す空文字列センチネルが入る(FR-022の「どの行にも一致しない」フォールバック挙動を保つ)", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([]);

    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "横浜市",
      tags: [],
    });

    const facilitySearchSql = prepareCalls[0];

    // 実際に prepare() へ渡された WHERE 句は、対象自治体コードと広域コードを同じ municipality_code 列で OR する。
    expect(facilitySearchSql).toMatch(
      /WHERE f\.is_medical = 0\s+AND f\.is_out_of_scope = 0\s+AND \(f\.age_range = 'both' OR f\.age_range = \?\)\s+AND \(f\.municipality_code = \? OR f\.municipality_code = \?\)/,
    );
    expect(bindCalls[0]).toEqual(["child", "", BROAD_AREA_MUNICIPALITY_CODE]);
  });

  it("同名の府中市も municipality_code で絞り込むため、広島県府中市(34207)は構造的にヒットし得ない(SQL・bind値で確認)", async () => {
    const { db, bindCalls } = createFakeDb([]);

    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "府中市",
      tags: [],
    });

    expect(bindCalls[0]).toEqual(["child", "13206", BROAD_AREA_MUNICIPALITY_CODE]);
    expect(bindCalls[0]).not.toContain("34207");
  });

  it("区市町村名を SQL 文字列へ直接埋め込まず、bind() 経由でのみ渡す", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([
      {
        id: "fac-001",
        dataset_id: "ds-a",
        name: "世田谷区 発達障がい相談支援センター",
        category_type: "相談窓口",
        municipality: "世田谷区",
        address: null,
        phone: null,
        url: null,
        age_range: "both",
        description: null,
        dataset_title: "ダミーデータセット",
        source_org: "東京都福祉局",
        license: "cc-by-4.0",
        risk_level: "low",
        source_url: null,
        fetched_at: "2026-07-01T00:00:00.000Z",
        frozen: 0,
      },
    ]);

    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "世田谷区",
      tags: [],
    });

    // 施設検索 SQL(1回目の prepare)の文字列自体には区市町村名を含めない。
    expect(prepareCalls[0]).not.toContain("世田谷区");
    expect(prepareCalls[0]).toContain("?");
    expect(prepareCalls[0]).toContain("is_medical = 0");
    expect(prepareCalls[0]).toContain("is_out_of_scope = 0");

    expect(bindCalls[0]).toEqual(["child", "13112", BROAD_AREA_MUNICIPALITY_CODE]);
  });

  it("facility_tags 検索(IN句)もプレースホルダーのみで facilityId を SQL に埋め込まない", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb(
      [
        {
          id: "fac-001",
          dataset_id: "ds-a",
          name: "ダミー窓口",
          category_type: "相談窓口",
          municipality: "世田谷区",
          address: null,
          phone: null,
          url: null,
          age_range: "both",
          description: null,
          dataset_title: "ダミーデータセット",
          source_org: "東京都福祉局",
          license: "cc-by-4.0",
          risk_level: "low",
          source_url: null,
          fetched_at: "2026-07-01T00:00:00.000Z",
          frozen: 0,
        },
      ],
      [{ facility_id: "fac-001", tag: "こだわり" }],
    );

    const result = await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "adult",
      municipality: "世田谷区",
      tags: ["こだわり"],
    });

    expect(prepareCalls[1]).not.toContain("fac-001");
    expect(prepareCalls[1]).toContain("facility_id IN (?)");
    expect(bindCalls[1]).toEqual(["fac-001"]);

    expect(result.facilitiesByCategory["相談窓口"][0].matchesTags).toBe(true);
  });

  it("施設が0件の場合はタグ検索(2回目の prepare)を行わない", async () => {
    const { db, prepareCalls } = createFakeDb([]);

    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "檜原村",
      tags: [],
    });

    expect(prepareCalls.length).toBe(1);
  });

  it("101件の facility_tags を90件ずつ取得し、タグをマージする", async () => {
    const facilityRows = Array.from({ length: 101 }, (_, index) => makeJoinRow(`fac-${index}`));
    const prepareCalls: string[] = [];
    const bindCalls: unknown[][] = [];
    let call = 0;
    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        const currentCall = call++;
        const statement: FakeStatement = {
          bind: vi.fn((...args: unknown[]) => {
            bindCalls.push(args);
            return statement;
          }),
          all: vi.fn(async () => ({
            results:
              currentCall === 0
                ? facilityRows
                : bindCalls[currentCall].map((facilityId) => ({ facility_id: facilityId, tag: "こだわり" })),
          })),
        };
        return statement;
      }),
    };

    const result = await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "世田谷区",
      tags: ["こだわり"],
    });

    expect(prepareCalls).toHaveLength(3);
    expect(bindCalls[1]).toHaveLength(90);
    expect(bindCalls[2]).toHaveLength(11);
    expect(result.facilitiesByCategory["相談窓口"]).toHaveLength(101);
    expect(result.facilitiesByCategory["相談窓口"].every((row) => row.matchesTags)).toBe(true);
  });
});

// --- searchFacilities の lifestage 絞り込み(migration 0016)---
// age_range(child/adult/both)の粗い区分に加え、lifestage が指定された場合のみ
// lifestage_min/max による細分絞り込みを追加する。lifestage 未指定時は従来どおり
// age_range のみで判定し、SQL・bind 引数とも変化しないこと(後方互換性)を確認する。

describe("searchFacilities (lifestage, migration 0016)", () => {
  it("lifestage 指定時は BETWEEN 句を含み、bind 配列に序数が [age, ordinal, municipality, 東京都] の順で挿入される", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([]);

    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "台東区",
      tags: [],
      lifestage: "elementary-junior-high",
    });

    expect(prepareCalls[0]).toContain("BETWEEN f.lifestage_min AND f.lifestage_max");
    expect(bindCalls[0]).toEqual(["child", LIFESTAGE_ORDINAL["elementary-junior-high"], "13106", BROAD_AREA_MUNICIPALITY_CODE]);
    expect(bindCalls[0]).toEqual(["child", 1, "13106", BROAD_AREA_MUNICIPALITY_CODE]);
  });

  it("lifestage が undefined の場合は従来どおり bind 配列は [age, municipality, 東京都] のままで、BETWEEN 句を含まない(後方互換性)", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([]);

    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "台東区",
      tags: [],
    });

    expect(prepareCalls[0]).not.toContain("lifestage_min");
    expect(bindCalls[0]).toEqual(["child", "13106", BROAD_AREA_MUNICIPALITY_CODE]);
  });

  it("lifestage が null の場合も未指定時と同じ扱いになる(後方互換性)", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([]);

    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "adult",
      municipality: "台東区",
      tags: [],
      lifestage: null,
    });

    expect(prepareCalls[0]).not.toContain("lifestage_min");
    expect(bindCalls[0]).toEqual(["adult", "13106", BROAD_AREA_MUNICIPALITY_CODE]);
  });

  // --- 回帰確認: 保育園限定施設が elementary-junior-high 検索で除外され、
  // preschool 検索では含まれること(修正対象のバグそのもの)。
  // このファイルの createFakeDb は bind() 呼び出しの記録のみを行い、SQL の WHERE 句を実際には
  // 評価しない(is_out_of_scope 導入時と同じ制約、上記コメント参照)。そのため実際の絞り込みは
  // 生成される SQL 文字列・bind 引数が正しいことをもって保証する(下記2ケース)。
  it("保育園相当の行(age_range='child', lifestage_min/max=[0,0])を想定した検索で、lifestage='elementary-junior-high' なら BETWEEN 句・序数1が渡され、SQL 側の WHERE 評価で 0 BETWEEN 1 AND undefined は偽になるため除外される想定(SQL文字列・bind値で確認)", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([
      { ...makeJoinRow("fac-nursery"), age_range: "child", municipality: "台東区" },
    ]);

    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "台東区",
      tags: [],
      lifestage: "elementary-junior-high",
    });

    expect(prepareCalls[0]).toContain("f.lifestage_min IS NULL OR (? BETWEEN f.lifestage_min AND f.lifestage_max)");
    expect(bindCalls[0][1]).toBe(LIFESTAGE_ORDINAL["elementary-junior-high"]);
  });

  it("同じ保育園相当の行を想定し、lifestage='preschool' なら序数0が渡される(0 BETWEEN 0 AND 0 は真となり、実 D1 上では含まれる想定)", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([
      { ...makeJoinRow("fac-nursery"), age_range: "child", municipality: "台東区" },
    ]);

    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "台東区",
      tags: [],
      lifestage: "preschool",
    });

    expect(prepareCalls[0]).toContain("f.lifestage_min IS NULL OR (? BETWEEN f.lifestage_min AND f.lifestage_max)");
    expect(bindCalls[0][1]).toBe(LIFESTAGE_ORDINAL["preschool"]);
    expect(bindCalls[0][1]).toBe(0);
  });
});

// --- fetchFacilitiesByIds(TICKET-0023, /api/recommend の D1 JOIN)---

describe("fetchFacilitiesByIds", () => {
  it("facility_id を SQL に直接埋め込まず、is_medical/age/municipality の絞り込みも bind() 経由で行う", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([
      {
        id: "fac-001",
        dataset_id: "ds-a",
        name: "世田谷区 発達障がい相談支援センター",
        category_type: "相談窓口",
        municipality: "世田谷区",
        address: null,
        phone: null,
        url: null,
        age_range: "both",
        description: null,
        dataset_title: "ダミーデータセット",
        source_org: "東京都福祉局",
        license: "cc-by-4.0",
        risk_level: "low",
        source_url: null,
      },
    ]);

    const rows = await fetchFacilitiesByIds(db as unknown as Parameters<typeof fetchFacilitiesByIds>[0], ["fac-001"], {
      ageGroup: "child",
      municipality: "世田谷区",
    });

    expect(prepareCalls[0]).not.toContain("fac-001");
    expect(prepareCalls[0]).not.toContain("世田谷区");
    expect(prepareCalls[0]).toContain("f.id IN (?)");
    expect(prepareCalls[0]).toContain("is_medical = 0");
    expect(prepareCalls[0]).toContain("is_out_of_scope = 0");
    expect(bindCalls[0]).toEqual(["fac-001", "child", "13112", BROAD_AREA_MUNICIPALITY_CODE]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("世田谷区 発達障がい相談支援センター");
  });

  it("複数 id の場合はプレースホルダーを id の件数分組み立てる", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([]);

    await fetchFacilitiesByIds(db as unknown as Parameters<typeof fetchFacilitiesByIds>[0], ["fac-a", "fac-b", "fac-c"], {
      ageGroup: "adult",
      municipality: "新宿区",
    });

    expect(prepareCalls[0]).toContain("f.id IN (?, ?, ?)");
    expect(bindCalls[0]).toEqual(["fac-a", "fac-b", "fac-c", "adult", "13104", BROAD_AREA_MUNICIPALITY_CODE]);
  });

  it("ids が空配列の場合は D1 へアクセスせず空配列を返す", async () => {
    const { db, prepareCalls } = createFakeDb([]);

    const rows = await fetchFacilitiesByIds(db as unknown as Parameters<typeof fetchFacilitiesByIds>[0], [], {
      ageGroup: "child",
      municipality: "新宿区",
    });

    expect(rows).toEqual([]);
    expect(prepareCalls.length).toBe(0);
  });

  it("101件の id を90件ずつ取得し、各チャンクの結果をマージする", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `fac-${index}`);
    const prepareCalls: string[] = [];
    const bindCalls: unknown[][] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        prepareCalls.push(sql);
        const statement: FakeStatement = {
          bind: vi.fn((...args: unknown[]) => {
            bindCalls.push(args);
            return statement;
          }),
          all: vi.fn(async () => ({
            results: (bindCalls.at(-1) ?? []).slice(0, -3).map((id) => makeJoinRow(String(id))),
          })),
        };
        return statement;
      }),
    };

    const rows = await fetchFacilitiesByIds(db as unknown as Parameters<typeof fetchFacilitiesByIds>[0], ids, {
      ageGroup: "adult",
      municipality: "世田谷区",
    });

    expect(prepareCalls).toHaveLength(2);
    expect(bindCalls[0]).toHaveLength(93);
    expect(bindCalls[1]).toHaveLength(14);
    expect(rows.map((row) => row.id)).toEqual(ids);
  });

  // --- fetchFacilitiesByIds の lifestage 絞り込み(migration 0016、searchFacilities と同じ拡張)---
  describe("lifestage 絞り込み(migration 0016)", () => {
    it("lifestage 指定時は BETWEEN 句を含み、bind 配列に序数が [...ids, age, ordinal, municipality, 東京都] の順で挿入される", async () => {
      const { db, prepareCalls, bindCalls } = createFakeDb([]);

      await fetchFacilitiesByIds(db as unknown as Parameters<typeof fetchFacilitiesByIds>[0], ["fac-001"], {
        ageGroup: "child",
        municipality: "台東区",
        lifestage: "elementary-junior-high",
      });

      expect(prepareCalls[0]).toContain("BETWEEN f.lifestage_min AND f.lifestage_max");
      expect(bindCalls[0]).toEqual([
        "fac-001",
        "child",
        LIFESTAGE_ORDINAL["elementary-junior-high"],
        "13106",
        BROAD_AREA_MUNICIPALITY_CODE,
      ]);
    });

    it("lifestage が undefined の場合は従来どおり bind 配列は [...ids, age, municipality, 東京都] のままで、BETWEEN 句を含まない(後方互換性)", async () => {
      const { db, prepareCalls, bindCalls } = createFakeDb([]);

      await fetchFacilitiesByIds(db as unknown as Parameters<typeof fetchFacilitiesByIds>[0], ["fac-001"], {
        ageGroup: "child",
        municipality: "台東区",
      });

      expect(prepareCalls[0]).not.toContain("lifestage_min");
      expect(bindCalls[0]).toEqual(["fac-001", "child", "13106", BROAD_AREA_MUNICIPALITY_CODE]);
    });

    it("lifestage が null の場合も未指定時と同じ扱いになる(後方互換性)", async () => {
      const { db, prepareCalls, bindCalls } = createFakeDb([]);

      await fetchFacilitiesByIds(db as unknown as Parameters<typeof fetchFacilitiesByIds>[0], ["fac-001"], {
        ageGroup: "adult",
        municipality: "台東区",
        lifestage: null,
      });

      expect(prepareCalls[0]).not.toContain("lifestage_min");
      expect(bindCalls[0]).toEqual(["fac-001", "adult", "13106", BROAD_AREA_MUNICIPALITY_CODE]);
    });
  });
});

describe("toFacilityRow", () => {
  function makeJoinRow(overrides: Partial<Parameters<typeof toFacilityRow>[0]> = {}) {
    return {
      id: "fac-001",
      dataset_id: "ds-a",
      name: "ダミー窓口",
      category_type: "相談窓口" as const,
      municipality: "世田谷区",
      municipality_code: "13112",
      address: null,
      phone: null,
      url: null,
      age_range: "both" as const,
      description: null,
      dataset_title: "ダミーデータセット",
      source_org: "東京都福祉局",
      license: "cc-by-4.0",
      risk_level: "low" as const,
      source_url: null,
      facility_subtype: null,
      lat: null,
      lng: null,
      fetched_at: "2026-07-01T00:00:00.000Z",
      frozen: 0 as const,
      no_diagnosis_ok: 0 as const,
      contact_methods: null,
      ...overrides,
    };
  }

  it("no_diagnosis_ok=1 の行を noDiagnosisOk=true に変換する(TICKET-0050)", () => {
    const row = toFacilityRow(makeJoinRow({ no_diagnosis_ok: 1 }));
    expect(row.noDiagnosisOk).toBe(true);
  });

  it("no_diagnosis_ok=0 の行を noDiagnosisOk=false に変換する(TICKET-0050)", () => {
    const row = toFacilityRow(makeJoinRow({ no_diagnosis_ok: 0 }));
    expect(row.noDiagnosisOk).toBe(false);
  });

  it("contact_methods をそのまま contactMethods に変換する(TICKET-0051)", () => {
    const row = toFacilityRow(makeJoinRow({ contact_methods: "メール可・フォーム可" }));
    expect(row.contactMethods).toBe("メール可・フォーム可");
  });

  it("contact_methods が null の場合は contactMethods も null になる(TICKET-0051 AC-4)", () => {
    const row = toFacilityRow(makeJoinRow({ contact_methods: null }));
    expect(row.contactMethods).toBeNull();
  });
});

// ============================================================================
// facility-join-select-column-list 設計: SELECT 列リスト共通化のテスト
//
// 実読で確認済みの通り、現状は searchFacilities / fetchFacilitiesByIds / fetchFacilityById の
// 3箇所に「facilities × datasets の24列 SELECT + JOIN」がSQL文字列として個別にベタ書きされて
// おり、列を1つ追加した際に1箇所でも更新を漏らすと FacilityJoinRow のフィールドが静かに
// undefined になる実害バグを生む(実際に no_diagnosis_ok / contact_methods 追加時に3箇所同時
// 更新が発生した)。school-info.ts の SCHOOL_ROW_SELECT / support-pathway.ts の
// SUPPORT_PATHWAY_ROW_COLUMNS と同じ形の定数(FACILITY_JOIN_SELECT / FACILITY_BASE_WHERE)・
// 純関数(lifestageFilterClause)へ抽出することで、この3関数が常に同じ列リストを使うことを
// 保証する。
//
// FACILITY_JOIN_SELECT / FACILITY_BASE_WHERE / lifestageFilterClause は school-info.ts の
// SCHOOL_ROW_SELECT に倣い module-local(非export)にする案もあったが、この3関数間の
// SELECT句一致を正規表現でのSQL文字列抽出に頼らず直接検証できるようにするため、
// toFacilityRow(既存、TICKET-0048で他モジュールからの再利用のためexport済み)と同じ考え方で
// export する(facility-search.ts 実装時にこのテストへ合わせること)。
// ============================================================================

describe("FACILITY_JOIN_SELECT", () => {
  // FacilityJoinRow(interface, facility-search.ts)の全フィールドと1対1対応する。
  // 列を追加・削除する場合はこの一覧と FacilityJoinRow の両方を更新すること。
  const EXPECTED_COLUMNS = [
    "id",
    "dataset_id",
    "name",
    "category_type",
    "municipality",
    "municipality_code",
    "address",
    "phone",
    "url",
    "age_range",
    "description",
    "dataset_title",
    "source_org",
    "license",
    "risk_level",
    "source_url",
    "facility_subtype",
    "lat",
    "lng",
    "fetched_at",
    "frozen",
    "no_diagnosis_ok",
    "contact_methods",
  ];

  it("FacilityJoinRow の全フィールドを `AS <snake_case>` の形で含む", () => {
    for (const column of EXPECTED_COLUMNS) {
      expect(FACILITY_JOIN_SELECT).toMatch(new RegExp(`AS ${column}\\b`));
    }
  });

  it("facilities を f、datasets を d としてエイリアスし、f.dataset_id で JOIN する", () => {
    expect(FACILITY_JOIN_SELECT).toContain("FROM facilities f");
    expect(FACILITY_JOIN_SELECT).toContain("JOIN datasets d ON d.id = f.dataset_id");
  });

  it("WHERE句は含まない(呼び出し側で個別のWHERE句を連結する設計のため)", () => {
    expect(FACILITY_JOIN_SELECT.toUpperCase()).not.toContain("WHERE");
  });
});

describe("FACILITY_BASE_WHERE", () => {
  it("医療機関除外(FR-025)と対象領域外施設除外(migration 0011)の両方を含む", () => {
    expect(FACILITY_BASE_WHERE).toContain("f.is_medical = 0");
    expect(FACILITY_BASE_WHERE).toContain("f.is_out_of_scope = 0");
  });

  it("バインドパラメータ(?)を含まない(値を伴わない定数条件のみのため)", () => {
    expect(FACILITY_BASE_WHERE).not.toContain("?");
  });
});

describe("lifestageFilterClause", () => {
  it("lifestageOrdinal が null の場合は空文字列を返す(句自体を付けない、未指定時の後方互換)", () => {
    expect(lifestageFilterClause(null)).toBe("");
  });

  it.each([0, 1, 2, 3, 4])("lifestageOrdinal=%i の場合、lifestage_min/max の BETWEEN 句を返す", (ordinal) => {
    const clause = lifestageFilterClause(ordinal);
    expect(clause).toContain("f.lifestage_min IS NULL OR (? BETWEEN f.lifestage_min AND f.lifestage_max)");
  });

  it("返り値に含まれるプレースホルダーは1個のみで、序数の値そのものは文字列へ埋め込まない(bind()経由でのみ渡す設計)", () => {
    const clause = lifestageFilterClause(3);
    expect((clause.match(/\?/g) ?? []).length).toBe(1);
    expect(clause).not.toContain("3");
  });
});

// --- searchFacilities / fetchFacilitiesByIds / fetchFacilityById の SELECT 句一致検証 ---
// この一致こそが facility-join-select-column-list 設計の中心的な回帰ガード。
// 定数抽出後も3関数が生成するSQLのSELECT句が文字列として完全一致し続けることを確認する。

function extractSelectClause(sql: string): string {
  const match = sql.match(/SELECT[\s\S]*?JOIN datasets d ON d\.id = f\.dataset_id/);
  if (!match) throw new Error(`SELECT ~ JOIN datasets 句を抽出できませんでした: ${sql}`);
  return match[0].replace(/\s+/g, " ").trim();
}

describe("facility-join-select-column-list: SELECT句の3関数間一致", () => {
  it("searchFacilities / fetchFacilitiesByIds / fetchFacilityById が発行するSELECT句は、空白差異を除き完全に一致する", async () => {
    const { db: searchDb, prepareCalls: searchCalls } = createFakeDb([]);
    await searchFacilities(searchDb as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "台東区",
      tags: [],
    });

    const { db: byIdsDb, prepareCalls: byIdsCalls } = createFakeDb([]);
    await fetchFacilitiesByIds(byIdsDb as unknown as Parameters<typeof fetchFacilitiesByIds>[0], ["fac-001"], {
      ageGroup: "child",
      municipality: "台東区",
    });

    const { db: byIdDb, prepareCalls: byIdCalls } = createFakeDb([]);
    await fetchFacilityById(byIdDb as unknown as Parameters<typeof fetchFacilityById>[0], "fac-001");

    const searchClause = extractSelectClause(searchCalls[0]);
    const byIdsClause = extractSelectClause(byIdsCalls[0]);
    const byIdClause = extractSelectClause(byIdCalls[0]);

    expect(byIdsClause).toBe(searchClause);
    expect(byIdClause).toBe(searchClause);
  });

  it("searchFacilities が発行するSELECT句は、共通定数 FACILITY_JOIN_SELECT と(空白差異を除き)一致する", async () => {
    const { db, prepareCalls } = createFakeDb([]);
    await searchFacilities(db as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "台東区",
      tags: [],
    });

    const actual = extractSelectClause(prepareCalls[0]);
    const expected = FACILITY_JOIN_SELECT.replace(/\s+/g, " ").trim();
    expect(actual).toBe(expected);
  });

  it("searchFacilities と fetchFacilitiesByIds が組み立てる lifestage 絞り込み句は文字列として完全一致する(重複除去対象2関数間の検証)", async () => {
    const { db: searchDb, prepareCalls: searchCalls } = createFakeDb([]);
    await searchFacilities(searchDb as unknown as Parameters<typeof searchFacilities>[0], {
      ageGroup: "child",
      municipality: "台東区",
      tags: [],
      lifestage: "elementary-junior-high",
    });

    const { db: byIdsDb, prepareCalls: byIdsCalls } = createFakeDb([]);
    await fetchFacilitiesByIds(byIdsDb as unknown as Parameters<typeof fetchFacilitiesByIds>[0], ["fac-001"], {
      ageGroup: "child",
      municipality: "台東区",
      lifestage: "elementary-junior-high",
    });

    const lifestageClauseFromSearch = searchCalls[0].match(/AND \(f\.lifestage_min[\s\S]*?\)\)/)?.[0];
    const lifestageClauseFromByIds = byIdsCalls[0].match(/AND \(f\.lifestage_min[\s\S]*?\)\)/)?.[0];

    expect(lifestageClauseFromSearch).toBeDefined();
    expect(lifestageClauseFromByIds).toBe(lifestageClauseFromSearch);
  });
});

// --- fetchFacilityById(TICKET-0048、`/api/ask` の施設固有の定型質問用)---
// このファイルにはこれまで fetchFacilityById 専用のテストが無かった(searchFacilities /
// fetchFacilitiesByIds のみテスト済み)。facility-join-select-column-list 設計の移行対象
// 3関数のうち唯一未テストだったため、ここで追加する。

describe("fetchFacilityById", () => {
  it("id を SQL 文字列へ直接埋め込まず、bind() 経由でのみ渡す", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb([]);

    await fetchFacilityById(db as unknown as Parameters<typeof fetchFacilityById>[0], "fac-001");

    expect(prepareCalls[0]).not.toContain("fac-001");
    expect(prepareCalls[0]).toContain("f.id = ?");
    expect(prepareCalls[0]).toContain("is_medical = 0");
    expect(prepareCalls[0]).toContain("is_out_of_scope = 0");
    expect(bindCalls[0]).toEqual(["fac-001"]);
  });

  it("該当する行が無い場合は null を返す", async () => {
    const { db } = createFakeDb([]);

    const result = await fetchFacilityById(db as unknown as Parameters<typeof fetchFacilityById>[0], "unknown-id");

    expect(result).toBeNull();
  });

  it("該当行がある場合、noDiagnosisOk/contactMethods を含め toFacilityRow と同じ変換結果を返す(TICKET-0050/TICKET-0051、3関数中これまで未検証だった箇所)", async () => {
    const { db } = createFakeDb([{ ...makeJoinRow("fac-001"), no_diagnosis_ok: 1, contact_methods: "メール可・フォーム可" }]);

    const result = await fetchFacilityById(db as unknown as Parameters<typeof fetchFacilityById>[0], "fac-001");

    expect(result?.id).toBe("fac-001");
    expect(result?.noDiagnosisOk).toBe(true);
    expect(result?.contactMethods).toBe("メール可・フォーム可");
  });

  it("fetchFacilitiesByIds と異なり、年齢区分・区市町村での絞り込みは行わない(呼び出し元は検索条件を通過済みの施設に対して呼ぶ仕様のため)", async () => {
    const { db, prepareCalls } = createFakeDb([]);

    await fetchFacilityById(db as unknown as Parameters<typeof fetchFacilityById>[0], "fac-001");

    expect(prepareCalls[0]).not.toContain("age_range = ?");
    expect(prepareCalls[0]).not.toContain("municipality_code = ?");
  });
});
