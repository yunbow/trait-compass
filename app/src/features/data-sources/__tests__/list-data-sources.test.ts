import { describe, expect, it } from "vitest";

import {
  buildDataSourceList,
  classifyDataSourceKind,
  extractManualSurveyMunicipalityCode,
  hasGrantedPermission,
  type DatasetCategoryCountRow,
  type DatasetRow,
} from "@/features/data-sources/services/list-data-sources";

describe("buildDataSourceList", () => {
  it("dataset ごとに category_type 別件数を結合する", () => {
    const datasets: DatasetRow[] = [
      {
        id: "d1",
        title: "データセットA",
        sourceOrg: "東京都",
        license: "cc-by-4.0",
        sourceUrl: "https://example.com/a",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        ckanPackageId: "t000021d2000000191",
      },
    ];
    const categoryCounts: DatasetCategoryCountRow[] = [
      { datasetId: "d1", categoryType: "相談窓口", count: 3 },
      { datasetId: "d1", categoryType: "支援制度", count: 1 },
    ];

    const result = buildDataSourceList(datasets, categoryCounts, new Set());

    expect(result).toEqual([
      {
        id: "d1",
        title: "データセットA",
        sourceOrg: "東京都",
        license: "cc-by-4.0",
        sourceUrl: "https://example.com/a",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        ckanPackageId: "t000021d2000000191",
        kind: "open-data",
        categories: [
          { categoryType: "相談窓口", count: 3 },
          { categoryType: "支援制度", count: 1 },
        ],
        expiresAt: null,
        isExpired: false,
      },
    ]);
  });

  it("facilities に紐づく行が無いデータセット(標準利用規約データ)は一覧から除外する(2026-08是正)", () => {
    const datasets: DatasetRow[] = [
      {
        id: "d2",
        title: "データセットB",
        sourceOrg: "国",
        license: "government-standard",
        sourceUrl: null,
        fetchedAt: "2026-02-01T00:00:00.000Z",
        ckanPackageId: null,
      },
    ];

    const result = buildDataSourceList(datasets, [], new Set());

    expect(result).toHaveLength(0);
  });

  it("license が manual-fact-verified でも許諾が確認できた自治体(municipality_survey_metaが対象コードを含む)は individual-permission として一覧に残る", () => {
    const datasets: DatasetRow[] = [
      {
        id: "ds-13102-manual-survey-programs",
        title: "中央区 手動調査データ(相談・制度)",
        sourceOrg: "中央区",
        license: "manual-fact-verified",
        sourceUrl: null,
        fetchedAt: "2026-08-18T00:00:00.000Z",
        ckanPackageId: null,
      },
    ];
    const categoryCounts: DatasetCategoryCountRow[] = [
      { datasetId: "ds-13102-manual-survey-programs", categoryType: "相談窓口", count: 5 },
    ];

    const result = buildDataSourceList(datasets, categoryCounts, new Set(["13102"]));

    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("individual-permission");
  });

  it("許諾は確認できているが facilities が1件も無い自治体は一覧から除外する(2026-08是正)", () => {
    const datasets: DatasetRow[] = [
      {
        id: "ds-13102-manual-survey-programs",
        title: "中央区 手動調査データ(相談・制度)",
        sourceOrg: "中央区",
        license: "manual-fact-verified",
        sourceUrl: null,
        fetchedAt: "2026-08-18T00:00:00.000Z",
        ckanPackageId: null,
      },
    ];

    const result = buildDataSourceList(datasets, [], new Set(["13102"]));

    expect(result).toHaveLength(0);
  });

  it("license が manual-fact-verified でも許諾がまだ確認できていない自治体は一覧から除外する(申請中の自治体を「許諾済」として見せない)", () => {
    const datasets: DatasetRow[] = [
      {
        id: "ds-13107-manual-survey-programs",
        title: "墨田区 手動調査データ(相談・制度)",
        sourceOrg: "墨田区",
        license: "manual-fact-verified",
        sourceUrl: null,
        fetchedAt: "2026-08-18T00:00:00.000Z",
        ckanPackageId: null,
      },
    ];

    const result = buildDataSourceList(datasets, [], new Set());

    expect(result).toHaveLength(0);
  });

  it("manual-fact-verified の id が想定パターン(ds-<5桁コード>-manual-survey-programs)に一致しない場合も除外する(安全側)", () => {
    const datasets: DatasetRow[] = [
      {
        id: "ds-manual-survey-programs-legacy",
        title: "不明な手動調査データセット",
        sourceOrg: "不明",
        license: "manual-fact-verified",
        sourceUrl: null,
        fetchedAt: "2026-08-18T00:00:00.000Z",
        ckanPackageId: null,
      },
    ];

    const result = buildDataSourceList(datasets, [], new Set(["13107"]));

    expect(result).toHaveLength(0);
  });

  it("他のデータセットの category_type 集計行を混同しない(facilities が無いデータセットは除外されるため、対象データセットには双方に集計行を与える)", () => {
    const datasets: DatasetRow[] = [
      {
        id: "d1",
        title: "データセットA",
        sourceOrg: "東京都",
        license: "cc-by-4.0",
        sourceUrl: null,
        fetchedAt: "2026-01-01T00:00:00.000Z",
        ckanPackageId: "t000021d2000000191",
      },
      {
        id: "d2",
        title: "データセットB",
        sourceOrg: "区役所",
        license: "government-standard",
        sourceUrl: null,
        fetchedAt: "2026-02-01T00:00:00.000Z",
        ckanPackageId: null,
      },
    ];
    const categoryCounts: DatasetCategoryCountRow[] = [
      { datasetId: "d1", categoryType: "相談窓口", count: 2 },
      { datasetId: "d2", categoryType: "福祉ガイド", count: 4 },
    ];

    const result = buildDataSourceList(datasets, categoryCounts, new Set());

    expect(result.find((item) => item.id === "d1")?.categories).toEqual([{ categoryType: "相談窓口", count: 2 }]);
    expect(result.find((item) => item.id === "d2")?.categories).toEqual([{ categoryType: "福祉ガイド", count: 4 }]);
  });

  it("classifyDataSourceKind: ckanPackageId が非null なら license によらず open-data", () => {
    expect(classifyDataSourceKind("t000021d2000000191", "cc-by-4.0")).toBe("open-data");
    expect(classifyDataSourceKind("t000021d2000000191", "manual-fact-verified")).toBe("open-data");
  });

  it("classifyDataSourceKind: ckanPackageId が null の場合、license が manual-fact-verified なら individual-permission、それ以外は standard-license", () => {
    expect(classifyDataSourceKind(null, "manual-fact-verified")).toBe("individual-permission");
    expect(classifyDataSourceKind(null, "government-standard")).toBe("standard-license");
    expect(classifyDataSourceKind(null, "pdl-1.0")).toBe("standard-license");
  });

  it("datasets が0件の場合は空配列を返す", () => {
    expect(buildDataSourceList([], [], new Set())).toEqual([]);
  });

  // 2026-08是正: 個別許諾データ(manual-fact-verified)のみ有効期限365日を算出する。
  describe("expiresAt / isExpired(有効期限365日、2026-08是正)", () => {
    it("kind=individual-permission のデータセットは fetchedAt + 365日を expiresAt に算出する", () => {
      const datasets: DatasetRow[] = [
        {
          id: "ds-13106-manual-survey-programs",
          title: "台東区 手動調査データ(相談・制度)",
          sourceOrg: "台東区",
          license: "manual-fact-verified",
          sourceUrl: null,
          fetchedAt: "2026-07-13T00:00:00.000Z",
          ckanPackageId: null,
        },
      ];
      const categoryCounts: DatasetCategoryCountRow[] = [
        { datasetId: "ds-13106-manual-survey-programs", categoryType: "相談窓口", count: 1 },
      ];

      const result = buildDataSourceList(datasets, categoryCounts, new Set(["13106"]), new Date("2026-08-19T00:00:00.000Z"));

      expect(result[0]?.expiresAt).toBe("2027-07-13T00:00:00.000Z");
      expect(result[0]?.isExpired).toBe(false);
    });

    it("kind=individual-permission でfetchedAtから365日超過している場合はisExpired=trueになる", () => {
      const datasets: DatasetRow[] = [
        {
          id: "ds-13106-manual-survey-programs",
          title: "台東区 手動調査データ(相談・制度)",
          sourceOrg: "台東区",
          license: "manual-fact-verified",
          sourceUrl: null,
          fetchedAt: "2020-01-01T00:00:00.000Z",
          ckanPackageId: null,
        },
      ];
      const categoryCounts: DatasetCategoryCountRow[] = [
        { datasetId: "ds-13106-manual-survey-programs", categoryType: "相談窓口", count: 1 },
      ];

      const result = buildDataSourceList(datasets, categoryCounts, new Set(["13106"]), new Date("2026-08-19T00:00:00.000Z"));

      expect(result[0]?.isExpired).toBe(true);
    });

    it("kind=open-data / standard-license は expiresAt=null, isExpired=false(有効期限という概念自体が無い)", () => {
      const datasets: DatasetRow[] = [
        { id: "d1", title: "オープンデータ", sourceOrg: "東京都", license: "cc-by-4.0", sourceUrl: null, fetchedAt: "2020-01-01T00:00:00.000Z", ckanPackageId: "t000021d2000000191" },
        { id: "d2", title: "標準利用規約データ", sourceOrg: "国", license: "government-standard", sourceUrl: null, fetchedAt: "2020-01-01T00:00:00.000Z", ckanPackageId: null },
      ];
      const categoryCounts: DatasetCategoryCountRow[] = [
        { datasetId: "d1", categoryType: "相談窓口", count: 1 },
        { datasetId: "d2", categoryType: "福祉ガイド", count: 1 },
      ];

      const result = buildDataSourceList(datasets, categoryCounts, new Set());

      expect(result.map((item) => ({ expiresAt: item.expiresAt, isExpired: item.isExpired }))).toEqual([
        { expiresAt: null, isExpired: false },
        { expiresAt: null, isExpired: false },
      ]);
    });
  });

  it("license が none(開放ライセンス未確認、常にmetadataOnly)のデータセットは一覧から除外する", () => {
    const datasets: DatasetRow[] = [
      {
        id: "ds-tokyo-special-needs-school-search",
        title: "都立特別支援学校検索(通学区域)",
        sourceOrg: "東京都教育委員会",
        license: "none",
        sourceUrl: "https://www.kyoiku.metro.tokyo.lg.jp/school/special_needs_school/search",
        fetchedAt: "2026-08-16T00:00:00.000Z",
        ckanPackageId: null,
      },
      {
        id: "ds-tokyo-public-school-list",
        title: "公立学校統計調査報告書【東京都公立学校一覧】(CSV)",
        sourceOrg: "東京都教育委員会",
        license: "cc-by-4.0",
        sourceUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000021d2000000191",
        fetchedAt: "2026-08-18T00:00:00.000Z",
        ckanPackageId: "t000021d2000000191",
      },
    ];
    // ds-tokyo-public-school-list は「none」ライセンスの除外条件を通過することを検証したいので
    // facilities 実績ありとする(facilities 0件による除外(下記テスト参照)と区別するため)。
    const categoryCounts: DatasetCategoryCountRow[] = [
      { datasetId: "ds-tokyo-public-school-list", categoryType: "福祉ガイド", count: 1 },
    ];

    const result = buildDataSourceList(datasets, categoryCounts, new Set());

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ds-tokyo-public-school-list");
  });

  it("facilities への投入パーサーが未実装(ingest_target: none)等で facilities が0件のデータセットは一覧から除外する(2026-08是正)", () => {
    // 実例: ds-tokyo-academic-report(区市町村集計のため投入対象外)、
    // ds-tokyo-public-school-list(パース実装待ち)は、いずれも datasets 行はあるが
    // facilities への実データ投入が無いため、本節の対象から除外される。
    const datasets: DatasetRow[] = [
      {
        id: "ds-tokyo-academic-report",
        title: "公立学校統計調査報告書(学校調査編、特別支援学級設置数を含む)",
        sourceOrg: "東京都教育委員会",
        license: "cc-by-4.0",
        sourceUrl: "https://catalog.data.metro.tokyo.lg.jp/dataset/t000021d2000000175",
        fetchedAt: "2026-08-16T00:00:00.000Z",
        ckanPackageId: "t000021d2000000175",
      },
    ];

    const result = buildDataSourceList(datasets, [], new Set());

    expect(result).toHaveLength(0);
  });
});

describe("hasGrantedPermission", () => {
  it("schoolClassData が permission_granted なら true", () => {
    expect(hasGrantedPermission('{"schoolClassData":"permission_granted","consultationWindowData":"permission_pending"}')).toBe(true);
  });

  it("consultationWindowData が permission_granted なら true", () => {
    expect(hasGrantedPermission('{"schoolClassData":"permission_pending","consultationWindowData":"permission_granted"}')).toBe(true);
  });

  it("両方とも permission_granted でなければ false(ccby_available・tokyo_restricted等は許諾扱いにしない)", () => {
    expect(hasGrantedPermission('{"schoolClassData":"ccby_available","consultationWindowData":"permission_pending"}')).toBe(false);
    expect(hasGrantedPermission('{"schoolClassData":"permission_pending","consultationWindowData":"permission_pending"}')).toBe(false);
  });

  it("null・不正なJSONは false(安全側)", () => {
    expect(hasGrantedPermission(null)).toBe(false);
    expect(hasGrantedPermission("{不正なJSON")).toBe(false);
    expect(hasGrantedPermission("[]")).toBe(false);
  });
});

describe("extractManualSurveyMunicipalityCode", () => {
  it("ds-<5桁コード>-manual-survey-programs パターンからコードを抽出する", () => {
    expect(extractManualSurveyMunicipalityCode("ds-13102-manual-survey-programs")).toBe("13102");
  });

  it("パターンに一致しない id は null を返す", () => {
    expect(extractManualSurveyMunicipalityCode("ds-tokyo-public-school-list")).toBeNull();
    expect(extractManualSurveyMunicipalityCode("ds-1310-manual-survey-programs")).toBeNull();
  });
});
