import { describe, expect, it } from "vitest";

import { MUNICIPALITIES } from "@/features/support/constants/municipalities";
import { BROAD_AREA_MUNICIPALITY_CODE } from "@/features/support/constants/municipality-codes";
import {
  aggregateCoverageByMunicipality,
  classifyDatasetScopes,
  coverageLevel,
  filterVisibleDatasetCredits,
  type FacilityCoverageRow,
  type RawDatasetCredit,
} from "@/features/coverage/services/aggregate-coverage";

describe("aggregateCoverageByMunicipality", () => {
  it("facilities が0件でも62区市町村すべてを count=0 の行として返す(AC-1, AC-2)", () => {
    const result = aggregateCoverageByMunicipality([]);

    expect(result.rows).toHaveLength(62);
    expect(result.rows.every((row) => row.count === 0)).toBe(true);
    expect(result.summary).toEqual({
      totalMunicipalities: 62,
      municipalitiesWithData: 0,
      broadAreaCount: 0,
      totalFacilities: 0,
      levelCounts: { none: 62, low: 0, partial: 0, full: 0 },
    });
  });

  it("区市町村ごとに件数・category_type 分布・座標付与率を集計する", () => {
    const rows: FacilityCoverageRow[] = [
      { municipalityCode: "13104", categoryType: "相談窓口", hasLatLng: true, datasetId: "d-common" },
      { municipalityCode: "13104", categoryType: "相談窓口", hasLatLng: false, datasetId: "d-common" },
      { municipalityCode: "13104", categoryType: "支援制度", hasLatLng: true, datasetId: "d-common" },
      { municipalityCode: "13201", categoryType: "福祉ガイド", hasLatLng: false, datasetId: "d-common" },
    ];

    const result = aggregateCoverageByMunicipality(rows);

    const shinjuku = result.rows.find((row) => row.municipality === "新宿区");
    expect(shinjuku).toMatchObject({
      count: 3,
      categoryCounts: { 相談窓口: 2, 支援制度: 1, 福祉ガイド: 0, 発達障害支援資料: 0 },
      categoryTypesCovered: 2,
      geocodedCount: 2,
    });
    expect(shinjuku?.geocodeRate).toBeCloseTo(2 / 3);

    const hachioji = result.rows.find((row) => row.municipality === "八王子市");
    expect(hachioji).toMatchObject({ count: 1, categoryTypesCovered: 1, geocodedCount: 0, geocodeRate: 0 });

    const chiyoda = result.rows.find((row) => row.municipality === "千代田区");
    expect(chiyoda).toMatchObject({ count: 0, categoryTypesCovered: 0, geocodedCount: 0, geocodeRate: null });

    expect(result.summary.municipalitiesWithData).toBe(2);
    expect(result.summary.totalFacilities).toBe(4);
    // 新宿区(2分類=partial)・八王子市(1分類=low)・残り60区市町村(0分類=none)。
    expect(result.summary.levelCounts).toEqual({ none: 60, low: 1, partial: 1, full: 0 });
  });

  it("categoryTypesCovered は発達障害支援資料を含めない(COVERAGE_CATEGORY_TYPES、2026-08是正)", () => {
    const rows: FacilityCoverageRow[] = [
      { municipalityCode: "13104", categoryType: "発達障害支援資料", hasLatLng: false, datasetId: "d-common" },
    ];

    const result = aggregateCoverageByMunicipality(rows);

    const shinjuku = result.rows.find((row) => row.municipality === "新宿区");
    expect(shinjuku).toMatchObject({
      count: 1,
      categoryCounts: { 相談窓口: 0, 支援制度: 0, 福祉ガイド: 0, 発達障害支援資料: 1 },
      categoryTypesCovered: 0,
    });
  });

  it("2区市町村以上にまたがるデータセットは commonDataCount、1区市町村のみのデータセットは municipalityOnlyDataCount に計上する", () => {
    const rows: FacilityCoverageRow[] = [
      // d-common は新宿区・八王子市の2区市町村にまたがるため common。
      { municipalityCode: "13104", categoryType: "相談窓口", hasLatLng: true, datasetId: "d-common" },
      { municipalityCode: "13201", categoryType: "相談窓口", hasLatLng: true, datasetId: "d-common" },
      // d-shinjuku-only は新宿区にしか登場しないため municipality-only。
      { municipalityCode: "13104", categoryType: "福祉ガイド", hasLatLng: true, datasetId: "d-shinjuku-only" },
      { municipalityCode: "13104", categoryType: "福祉ガイド", hasLatLng: true, datasetId: "d-shinjuku-only" },
    ];

    const result = aggregateCoverageByMunicipality(rows);

    const shinjuku = result.rows.find((row) => row.municipality === "新宿区");
    expect(shinjuku).toMatchObject({ count: 3, commonDataCount: 1, municipalityOnlyDataCount: 2 });

    const hachioji = result.rows.find((row) => row.municipality === "八王子市");
    expect(hachioji).toMatchObject({ count: 1, commonDataCount: 1, municipalityOnlyDataCount: 0 });
  });

  it("広域窓口(municipalityCode='13000')は rows(62区市町村)に含めず summary.broadAreaCount にのみ集計する", () => {
    const rows: FacilityCoverageRow[] = [
      { municipalityCode: BROAD_AREA_MUNICIPALITY_CODE, categoryType: "相談窓口", hasLatLng: false, datasetId: "d-broad" },
      { municipalityCode: BROAD_AREA_MUNICIPALITY_CODE, categoryType: "支援制度", hasLatLng: false, datasetId: "d-broad" },
    ];

    const result = aggregateCoverageByMunicipality(rows);

    expect(result.rows.map((row) => row.municipality)).not.toContain("東京都");
    expect(result.summary.broadAreaCount).toBe(2);
    expect(result.summary.municipalitiesWithData).toBe(0);
    expect(result.summary.totalFacilities).toBe(2);
  });

  it("62区市町村(municipalities.ts)を漏れなく網羅する", () => {
    const result = aggregateCoverageByMunicipality([]);
    expect(result.rows.map((row) => row.municipality).sort()).toEqual([...MUNICIPALITIES].sort());
  });
});

describe("coverageLevel", () => {
  it("count=0 の場合は none", () => {
    expect(coverageLevel({ count: 0, categoryTypesCovered: 0 })).toBe("none");
  });

  it("1分類のみデータがある場合は low", () => {
    expect(coverageLevel({ count: 5, categoryTypesCovered: 1 })).toBe("low");
  });

  it("2分類のデータがある場合は partial", () => {
    expect(coverageLevel({ count: 5, categoryTypesCovered: 2 })).toBe("partial");
  });

  it("3分類すべてのデータがある場合は full", () => {
    expect(coverageLevel({ count: 5, categoryTypesCovered: 3 })).toBe("full");
  });
});

describe("classifyDatasetScopes", () => {
  it("2区市町村以上に登場するデータセットは common に分類する", () => {
    const rows: FacilityCoverageRow[] = [
      { municipalityCode: "13104", categoryType: "相談窓口", hasLatLng: true, datasetId: "d-wam-net" },
      { municipalityCode: "13201", categoryType: "相談窓口", hasLatLng: true, datasetId: "d-wam-net" },
    ];

    expect(classifyDatasetScopes(rows).get("d-wam-net")).toBe("common");
  });

  it("1区市町村にしか登場しないデータセットは municipality-only に分類する(同一区市町村内の複数行でも変わらない)", () => {
    const rows: FacilityCoverageRow[] = [
      { municipalityCode: "13106", categoryType: "福祉ガイド", hasLatLng: true, datasetId: "d-taito-hoiku" },
      { municipalityCode: "13106", categoryType: "福祉ガイド", hasLatLng: true, datasetId: "d-taito-hoiku" },
    ];

    expect(classifyDatasetScopes(rows).get("d-taito-hoiku")).toBe("municipality-only");
  });

  it("データセットごとに独立して判定する", () => {
    const rows: FacilityCoverageRow[] = [
      { municipalityCode: "13104", categoryType: "相談窓口", hasLatLng: true, datasetId: "d-common" },
      { municipalityCode: "13201", categoryType: "相談窓口", hasLatLng: true, datasetId: "d-common" },
      { municipalityCode: "13104", categoryType: "福祉ガイド", hasLatLng: true, datasetId: "d-only" },
    ];

    const scopes = classifyDatasetScopes(rows);
    expect(scopes.get("d-common")).toBe("common");
    expect(scopes.get("d-only")).toBe("municipality-only");
  });
});

// 2026-08是正: /coverage の出典一覧を /data-sources の「利用しているデータ」一覧と同じ
// Source of Truth(lib/dataset-visibility.ts の isDatasetVisible)で絞り込む。
describe("filterVisibleDatasetCredits", () => {
  it("license: 'none'(開放ライセンス未確認)のデータセットは出典から除外する", () => {
    const rows: RawDatasetCredit[] = [
      { id: "ds-tokyo-special-school-zoning", datasetTitle: "都立特別支援学校検索(通学区域)", sourceOrg: "東京都", license: "none", sourceUrl: null },
    ];

    expect(filterVisibleDatasetCredits(rows, new Set(), new Set(["ds-tokyo-special-school-zoning"]))).toEqual([]);
  });

  it("個別許諾データは、許諾がまだ確認できていない自治体(grantedMunicipalityCodesに無い)を出典から除外する", () => {
    const rows: RawDatasetCredit[] = [
      { id: "ds-13101-manual-survey-programs", datasetTitle: "千代田区 手動調査データ", sourceOrg: "千代田区", license: "manual-fact-verified", sourceUrl: null },
    ];

    expect(filterVisibleDatasetCredits(rows, new Set(), new Set(["ds-13101-manual-survey-programs"]))).toEqual([]);
  });

  it("許諾済みの個別許諾データ・オープンデータ・標準利用規約データは出典に残す(idは結果から除く)", () => {
    const rows: RawDatasetCredit[] = [
      { id: "ds-13102-manual-survey-programs", datasetTitle: "中央区 手動調査データ", sourceOrg: "中央区", license: "manual-fact-verified", sourceUrl: null },
      { id: "d-open", datasetTitle: "オープンデータの例", sourceOrg: "東京都", license: "cc-by-4.0", sourceUrl: "https://example.com/open" },
    ];

    expect(
      filterVisibleDatasetCredits(rows, new Set(["13102"]), new Set(["ds-13102-manual-survey-programs", "d-open"])),
    ).toEqual([
      { datasetTitle: "中央区 手動調査データ", sourceOrg: "中央区", license: "manual-fact-verified", sourceUrl: null },
      { datasetTitle: "オープンデータの例", sourceOrg: "東京都", license: "cc-by-4.0", sourceUrl: "https://example.com/open" },
    ]);
  });

  it("許諾済み(グループ内の一部区分のみ許諾)でも facilities が0件のデータセットは出典から除外する(渋谷区の実例に対応する回帰テスト)", () => {
    // 渋谷区: schoolClassData は permission_granted、consultationWindowData は ccby_available(許諾未取得)。
    // isDatasetVisible は「いずれか1区分でも許諾されていれば可視」と判定するため grantedMunicipalityCodes には
    // 含まれるが、相談・制度(programs)側の facilities は取り込まれていないため、出典には出さない。
    const rows: RawDatasetCredit[] = [
      { id: "ds-13113-manual-survey-programs", datasetTitle: "渋谷区 手動調査データ(相談・制度)", sourceOrg: "渋谷区", license: "manual-fact-verified", sourceUrl: null },
    ];

    expect(filterVisibleDatasetCredits(rows, new Set(["13113"]), new Set())).toEqual([]);
  });
});
