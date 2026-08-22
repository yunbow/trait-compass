import { describe, expect, it } from "vitest";

import { classifyLicense } from "../../../app/src/features/data-ingest/services/licenseClassifier";
import { CKAN_BASE_URL, INGEST_DATASETS, type DatasetConfig } from "../datasets.config";

describe("CKAN ポータル URL の設定スコープ", () => {
  it("DatasetConfig 型はデータセット単位の baseUrl プロパティを持たない", () => {
    type HasBaseUrl = "baseUrl" extends keyof DatasetConfig ? true : false;
    const hasBaseUrl: HasBaseUrl = false;

    expect(hasBaseUrl).toBe(false);
  });

  it("全データセット(現状9件)にデータセット単位の baseUrl は設定されていない", () => {
    expect(INGEST_DATASETS).toHaveLength(9);

    for (const dataset of INGEST_DATASETS) {
      expect(Object.keys(dataset), `${dataset.id} のプロパティ`).not.toContain("baseUrl");
    }
  });

  it("CKAN_BASE_URL は東京都ドメインを指す単一の文字列定数である", () => {
    expect(typeof CKAN_BASE_URL).toBe("string");
    expect(CKAN_BASE_URL).toContain("metro.tokyo.lg.jp");
  });
});

describe("INGEST_DATASETS", () => {
  it("id が一意である", () => {
    const ids = INGEST_DATASETS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("frozen でなく、かつ CKAN 登録済み(ckanPackageId 有)のデータセットは少なくとも1つの preferredFormats を持つ", () => {
    // TICKET-0049: ckanPackageId が null のデータセット(CKAN 未登録の国データソース等)は、
    // workflow.ts の判定(`dataset.frozen || !dataset.ckanPackageId`)により frozen 指定が
    // 無くてもメタ情報のみ記録される(ネットワーク取得を行わない)ため、本アサーションの対象外とする。
    for (const dataset of INGEST_DATASETS.filter((d) => !d.frozen && d.ckanPackageId)) {
      expect(dataset.resource.preferredFormats.length).toBeGreaterThan(0);
    }
  });

  it("都福祉局データセット(実在確認済み)はライセンス区分A・全文投入可(FR-033)", () => {
    const target = INGEST_DATASETS.find((d) => d.id === "ds-tokyo-fukushi-shisetsu");
    expect(target).toBeDefined();
    const license = classifyLicense(target!.license);
    expect(license.category).toBe("A");
    expect(license.allowed).toBe(true);
  });

  it("都福祉局データセットは FR-034 通り CSV を既知不良として扱い、XLSX を優先する", () => {
    const target = INGEST_DATASETS.find((d) => d.id === "ds-tokyo-fukushi-shisetsu");
    expect(target?.resource.knownBadFormats).toContain("CSV");
    expect(target?.resource.preferredFormats[0]).toBe("XLSX");
  });

  it("こどもDX レジストリは frozen(更新終了)としてネットワーク取得を行わない設定になっている(FR-034 AC-6)", () => {
    const target = INGEST_DATASETS.find((d) => d.id === "ds-kodomo-dx-registry");
    expect(target?.frozen).toBe(true);
    expect(target?.freshnessNote).toMatch(/2025\/8\/20/);
  });

  it("hattatsu.go.jp データセット(TICKET-0049)は CKAN 未登録の国データソースとして ckanPackageId=null で定義されている", () => {
    const target = INGEST_DATASETS.find((d) => d.id === "ds-hattatsu-shien-center");
    expect(target).toBeDefined();
    expect(target?.ckanPackageId).toBeNull();
    expect(target?.sourceOrg).toBe("国立障害者リハビリテーションセンター");
    expect(target?.frozen).toBeFalsy();
  });

  it("hattatsu.go.jp データセットは低リスク(pdl-1.0、区分F相当)として分類される(FR-033)", () => {
    const target = INGEST_DATASETS.find((d) => d.id === "ds-hattatsu-shien-center");
    const license = classifyLicense(target!.license);
    expect(license.category).toBe("F");
    expect(license.riskLevel).toBe("low");
    expect(license.allowed).toBe(true);
  });

  // ============================================================
  // 台東区6データセット(TICKET-0011作業ログ 7564a94)
  // ============================================================

  const TAITO_DATASET_IDS = [
    "ds-taito-kuyakusho",
    "ds-taito-jidokan",
    "ds-taito-hoiku-shisetsu",
    "ds-taito-kodomo-katei-shien",
    "ds-taito-hoken-shisetsu",
    "ds-taito-fukushi-shisetsu",
  ];

  it("台東区の6データセットが想定通りすべて定義されている", () => {
    for (const id of TAITO_DATASET_IDS) {
      expect(INGEST_DATASETS.find((d) => d.id === id), `${id} が見つからない`).toBeDefined();
    }
    expect(INGEST_DATASETS.filter((d) => d.id.startsWith("ds-taito-"))).toHaveLength(6);
  });

  it("台東区6データセットの ckanPackageId は互いに重複しない", () => {
    const ids = INGEST_DATASETS.filter((d) => TAITO_DATASET_IDS.includes(d.id)).map((d) => d.ckanPackageId);
    expect(ids.every((id) => id !== null)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("台東区6データセットは全件 fixedMunicipality='台東区' が設定されている(自治体名抽出をバイパス)", () => {
    for (const id of TAITO_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id);
      expect(target?.fixedMunicipality, `${id} の fixedMunicipality`).toBe("台東区");
    }
  });

  it("台東区6データセットは全件 encoding='shift-jis' が設定されている", () => {
    for (const id of TAITO_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id);
      expect(target?.encoding, `${id} の encoding`).toBe("shift-jis");
    }
  });

  it("台東区6データセットは全件ライセンス cc-by-4.0(区分A・全文投入可)", () => {
    for (const id of TAITO_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id)!;
      const license = classifyLicense(target.license);
      expect(license.category, `${id} のライセンス区分`).toBe("A");
      expect(license.allowed).toBe(true);
    }
  });

  it("台東区6データセットは全件 csvColumns に lngColumn='X座標'・latColumn='Y座標' を持つ(緯度経度の直接マッピング)", () => {
    for (const id of TAITO_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id);
      expect(target?.csvColumns?.lngColumn, `${id} の lngColumn`).toBe("X座標");
      expect(target?.csvColumns?.latColumn, `${id} の latColumn`).toBe("Y座標");
    }
  });

  it("台東区6データセットは想定通りの defaultFacilitySubtype を持つ", () => {
    const expectedSubtypes: Record<string, string> = {
      "ds-taito-kuyakusho": "行政窓口",
      "ds-taito-kodomo-katei-shien": "子ども家庭支援",
      "ds-taito-hoken-shisetsu": "保健施設",
      "ds-taito-fukushi-shisetsu": "福祉施設",
      "ds-taito-jidokan": "児童館・こどもクラブ",
      "ds-taito-hoiku-shisetsu": "保育施設",
    };

    for (const id of TAITO_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id);
      expect(target?.defaultFacilitySubtype, `${id} の defaultFacilitySubtype`).toBe(expectedSubtypes[id]);
    }
  });

  it("台東区6データセットは全件 csvColumns.subtypeColumn='大分類' が設定されている(施設サブタイプの行単位取得)", () => {
    for (const id of TAITO_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id);
      expect(target?.csvColumns?.subtypeColumn, `${id} の subtypeColumn`).toBe("大分類");
    }
  });

  it("台東区「子ども家庭支援センター」は CKAN format 誤登録(PDF表記)対策のため preferredFormats に CSV のみを指定する", () => {
    const target = INGEST_DATASETS.find((d) => d.id === "ds-taito-kodomo-katei-shien");
    expect(target?.resource.preferredFormats).toEqual(["CSV"]);
  });

  // ============================================================
  // fixedAgeRange(台東区 保育施設・児童館・子ども家庭支援センターの3データセット、
  // age=adult 検索に子ども専用施設が混入するバグの修正)
  // ============================================================

  it("児童館・保育施設・子ども家庭支援センターの3データセットは fixedAgeRange='child' が設定されている(18歳未満/子育て世帯専用のデータセットであることが確定しているため)", () => {
    const CHILD_ONLY_DATASET_IDS = ["ds-taito-jidokan", "ds-taito-hoiku-shisetsu", "ds-taito-kodomo-katei-shien"];
    for (const id of CHILD_ONLY_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id);
      expect(target?.fixedAgeRange, `${id} の fixedAgeRange`).toBe("child");
    }
  });

  it("混在年齢層のデータセット(ds-taito-kuyakusho・ds-taito-hoken-shisetsu・ds-taito-fukushi-shisetsu)には fixedAgeRange が設定されていない(意図的なスコープ境界であり、over-broadening の混入を防ぐ回帰確認)", () => {
    const MIXED_AGE_DATASET_IDS = ["ds-taito-kuyakusho", "ds-taito-hoken-shisetsu", "ds-taito-fukushi-shisetsu"];
    for (const id of MIXED_AGE_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id);
      expect(target?.fixedAgeRange, `${id} の fixedAgeRange`).toBeUndefined();
    }
  });

  // ============================================================
  // fixedContactMethods(台東区6データセット、区共通問い合わせ窓口のフォールバック、TICKET-0051)
  // ============================================================

  it("台東区6データセットは全件 fixedContactMethods に同じ非空文字列(区共通問い合わせ窓口の案内)が設定されている", () => {
    const values = new Set<string | undefined>();
    for (const id of TAITO_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id);
      expect(target?.fixedContactMethods, `${id} の fixedContactMethods`).toBeTruthy();
      expect(target?.fixedContactMethods?.trim().length, `${id} の fixedContactMethods`).toBeGreaterThan(0);
      values.add(target?.fixedContactMethods);
    }
    // 全6データセットが同一の区共通問い合わせ窓口の文言を指している(個別施設用フォームではないことの確認)。
    expect(values.size).toBe(1);
  });

  it("台東区6データセット以外には fixedContactMethods が設定されていない(意図的なスコープ境界の回帰確認)", () => {
    for (const dataset of INGEST_DATASETS.filter((d) => !TAITO_DATASET_IDS.includes(d.id))) {
      expect(dataset.fixedContactMethods, `${dataset.id} の fixedContactMethods`).toBeUndefined();
    }
  });

  // ============================================================
  // fixedUrl(台東区6データセット、区共通問い合わせフォームURLのフォールバック、TICKET-0051)
  // ============================================================

  it("台東区6データセットは全件 fixedUrl に同じ非空文字列(区共通問い合わせフォームのURL)が設定されている", () => {
    const values = new Set<string | undefined>();
    for (const id of TAITO_DATASET_IDS) {
      const target = INGEST_DATASETS.find((d) => d.id === id);
      expect(target?.fixedUrl, `${id} の fixedUrl`).toBeTruthy();
      expect(target?.fixedUrl?.trim().length, `${id} の fixedUrl`).toBeGreaterThan(0);
      expect(target?.fixedUrl?.startsWith("https://"), `${id} の fixedUrl`).toBe(true);
      values.add(target?.fixedUrl);
    }
    // 全6データセットが同一の区共通問い合わせフォームURLを指している(個別施設用フォームではないことの確認)。
    expect(values.size).toBe(1);
  });

  it("台東区6データセット以外には fixedUrl が設定されていない(意図的なスコープ境界の回帰確認)", () => {
    for (const dataset of INGEST_DATASETS.filter((d) => !TAITO_DATASET_IDS.includes(d.id))) {
      expect(dataset.fixedUrl, `${dataset.id} の fixedUrl`).toBeUndefined();
    }
  });
});
