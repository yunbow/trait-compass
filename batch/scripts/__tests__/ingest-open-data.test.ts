// scripts/data/ingest-open-data.mjs の純関数部分のテスト。
//
// このスクリプトは data/open-data/ にキャッシュした CSV を正規化し D1 へ投入する CLI だが、
// main() は直接実行されたときのみ起動するようガードされている(import 時の副作用なし)ため、
// export された純関数を通常の ESM import でテストできる。
// ネットワーク・実際の wrangler d1 execute 呼び出しは行わない。
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildSqlForSource,
  classifyLocalLicense,
  decodeCsvBuffer,
  extractTokyoMunicipality,
  findColumn,
  mapSchoolTypeToLevel,
  normalizeHattatsuHtmlSections,
  normalizeIryoJohoNetCsv,
  normalizeMextSchoolCodeCsv,
  normalizeWamNetCsv,
  parseCoordinate,
  parseCsv,
  splitSqlIntoChunks,
} from "../ingest-open-data.mjs";
import {
  classifyLicense as classifyLicenseTs,
  isLicenseAllowed,
} from "../../../app/src/features/data-ingest/services/licenseClassifier";

const fixturesDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

async function readFixture(filename: string) {
  return readFile(join(fixturesDirectory, filename), "utf8");
}

describe("parseCsv", () => {
  it("単純なカンマ区切りの行をパースする", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("ダブルクォートで囲まれたフィールド内のカンマはセパレータとして扱わない", () => {
    expect(parseCsv('name,note\n"すずらん,福祉センター",テスト\n')).toEqual([
      ["name", "note"],
      ["すずらん,福祉センター", "テスト"],
    ]);
  });

  it("ダブルクォートで囲まれたフィールド内の改行はレコード区切りとして扱わない", () => {
    expect(parseCsv('name,note\n"複数行\n備考",テスト\n')).toEqual([
      ["name", "note"],
      ["複数行\n備考", "テスト"],
    ]);
  });

  it('二重の""はエスケープされた1個のダブルクォートとして扱う', () => {
    expect(parseCsv('name\n"""特記事項""あり"\n')).toEqual([
      ["name"],
      ['"特記事項"あり'],
    ]);
  });

  it("CRLF改行のCSVも1レコードずつパースする(\\rは読み飛ばす)", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("末尾に改行がない最終行も取りこぼさない", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("閉じられていないダブルクォートはエラーにする", () => {
    expect(() => parseCsv('name\n"閉じていない')).toThrow();
  });
});

describe("decodeCsvBuffer", () => {
  it("UTF-8 の BOM を除去してデコードする", () => {
    const withBom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("名前,住所\n東京太郎,東京都台東区1-1-1\n", "utf8"),
    ]);
    const decoded = decodeCsvBuffer(withBom);
    expect(decoded.startsWith("﻿")).toBe(false);
    expect(decoded).toBe("名前,住所\n東京太郎,東京都台東区1-1-1\n");
  });

  it("UTF-8として不正なバイト列はShift_JISとしてフォールバックデコードする", () => {
    // "名前,住所\n東京太郎,東京都台東区1-1-1\n" のShift_JISバイト列(事前にiconv-liteで生成)。
    const shiftJisHex =
      "96bc914f2c8f5a8f8a0a938c8b9e91be98592c938c8b9e937391e4938c8be6312d312d310a";
    const shiftJisBuffer = Buffer.from(shiftJisHex, "hex");
    expect(decodeCsvBuffer(shiftJisBuffer)).toBe(
      "名前,住所\n東京太郎,東京都台東区1-1-1\n",
    );
  });
});

describe("classifyLocalLicense(licenseClassifier.tsとの突合)", () => {
  const knownLicenses = [
    "cc-by-4.0",
    "cc-by",
    "government-standard-terms-2.0",
    "government-standard-terms-1.0",
    "pdl-1.0",
  ];
  const unspecifiedLicenses = ["", "none", "notspecified", "no-license", "unknown"];
  const unknownIdentifiers = ["government-standard", "some-custom-municipality-terms-v3", "all-rights-reserved"];

  it.each(knownLicenses)("既知の低リスクライセンス「%s」はTS版・JS版いずれもallowed=true・同一riskLevel", (license) => {
    const jsResult = classifyLocalLicense(license);
    const tsResult = classifyLicenseTs(license);
    expect(jsResult.allowed).toBe(true);
    expect(jsResult.allowed).toBe(tsResult.allowed);
    expect(jsResult.allowed).toBe(isLicenseAllowed(license));
    expect(jsResult.riskLevel).toBe(tsResult.riskLevel);
    expect(jsResult.riskLevel).toBe("low");
  });

  it.each(unspecifiedLicenses)("未指定・不明なライセンス「%s」はallowed=false・riskLevel=high(TS版と一致)", (license) => {
    const jsResult = classifyLocalLicense(license);
    const tsResult = classifyLicenseTs(license);
    expect(jsResult.allowed).toBe(false);
    expect(jsResult.riskLevel).toBe("high");
    expect(jsResult.riskLevel).toBe(tsResult.riskLevel);
  });

  it.each(unknownIdentifiers)("未知の識別子「%s」はallowed=false・riskLevel=medium(TS版と一致)", (license) => {
    const jsResult = classifyLocalLicense(license);
    const tsResult = classifyLicenseTs(license);
    expect(jsResult.allowed).toBe(false);
    expect(jsResult.riskLevel).toBe("medium");
    expect(jsResult.riskLevel).toBe(tsResult.riskLevel);
  });

  it("null/undefinedは未指定として扱う(高リスク・不許可)", () => {
    expect(classifyLocalLicense(null).allowed).toBe(false);
    expect(classifyLocalLicense(null).riskLevel).toBe("high");
    expect(classifyLocalLicense(undefined).allowed).toBe(false);
  });

  it("大文字・前後空白の表記ゆれを吸収する", () => {
    expect(classifyLocalLicense("  CC-BY-4.0  ").allowed).toBe(true);
  });
});

describe("findColumn", () => {
  it("候補のいずれかに一致する列番号を返す", () => {
    expect(findColumn(["id", "事業所の名称", "住所"], ["事業所名称", "事業所の名称"])).toBe(1);
  });

  it("前後の空白は無視してマッチする", () => {
    expect(findColumn([" id ", " 名称 "], ["名称"])).toBe(1);
  });

  it("候補がどれも見つからない場合、実際のヘッダー一覧を含むErrorを投げる", () => {
    expect(() => findColumn(["id", "foo"], ["名称", "事業所名称"])).toThrowError(
      /候補: 名称 \/ 事業所名称[\s\S]*実際のヘッダー: id \| foo/,
    );
  });
});

describe("parseCoordinate", () => {
  it("有限な数値を返し、数値化できない値と範囲外の値はnullにする", () => {
    expect(parseCoordinate("35.6910", -90, 90)).toBe(35.691);
    expect(parseCoordinate("")).toBeNull();
    expect(parseCoordinate("invalid")).toBeNull();
    expect(parseCoordinate("181")).toBeNull();
    expect(parseCoordinate("91", -90, 90)).toBeNull();
  });
});

describe("extractTokyoMunicipality", () => {
  it("住所から区市町村名を抽出する(23区)", () => {
    expect(extractTokyoMunicipality("東京都台東区上野1-1-1")).toBe("台東区");
  });

  it("住所から区市町村名を抽出する(市・町・村)", () => {
    expect(extractTokyoMunicipality("東京都町田市原町田1-1-1")).toBe("町田市");
    expect(extractTokyoMunicipality("東京都瑞穂町箱根ケ崎1-1-1")).toBe("瑞穂町");
    expect(extractTokyoMunicipality("東京都檜原村4321")).toBe("檜原村");
  });

  it("長い区市町村名を優先してマッチする(短い名称が先に部分一致しても長い名称を優先)", () => {
    // 「府中市」(3文字)は「小金井市」(4文字)より元の定義順で先に登場するが、
    // 文字数の長い名称を優先してマッチさせるため、両方を含む住所では「小金井市」を返す。
    expect(extractTokyoMunicipality("小金井市と府中市の境界付近")).toBe("小金井市");
  });

  it("facilities用途(allowTokyoFallback省略時)は、都内の区市町村名が見つからない場合「東京都」にフォールバックする", () => {
    expect(extractTokyoMunicipality("東京都庁1-1-1")).toBe("東京都");
  });

  it("school_registry用途(allowTokyoFallback=false)は、都内の区市町村名が見つからない場合nullを返す", () => {
    expect(extractTokyoMunicipality("東京都庁1-1-1", false)).toBeNull();
    expect(extractTokyoMunicipality(null, false)).toBeNull();
  });
});

describe("mapSchoolTypeToLevel", () => {
  it("B1は小学校(elementary)に写像する", () => {
    expect(mapSchoolTypeToLevel("B1")).toBe("elementary");
  });

  it("C1は中学校(junior_high)に写像する", () => {
    expect(mapSchoolTypeToLevel("C1")).toBe("junior_high");
  });

  it("D1・D2は高等学校(high)に写像する", () => {
    expect(mapSchoolTypeToLevel("D1")).toBe("high");
    expect(mapSchoolTypeToLevel("D2")).toBe("high");
  });

  it("E1は特別支援学校(special_needs)に写像する", () => {
    expect(mapSchoolTypeToLevel("E1")).toBe("special_needs");
  });

  it("未知のコードはother(school_registry.levelのCHECK制約に含まれるフォールバック)にする", () => {
    expect(mapSchoolTypeToLevel("Z9")).toBe("other");
    expect(mapSchoolTypeToLevel(undefined)).toBe("other");
  });
});

describe("normalizeWamNetCsv", () => {
  it("都道府県コード13(東京都)で始まる行だけを抽出する", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const rows = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", 0, 0, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(rows.every((row) => row.municipality !== null)).toBe(true);
    expect(rows.some((row) => row.name === "県外事業所テスト")).toBe(false);
  });

  it("すべての行がis_medical=0で投入される(WAM NETは福祉施設のため医療機関ではない)", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const rows = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", 0, 0, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.is_medical === 0)).toBe(true);
  });

  it("同一事業所が原本CSVに重複掲載されている場合、2件目以降のidが重複する行はスキップする", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const rows = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", 0, 0, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    const matchingRows = rows.filter((row) => row.name === "ひまわり児童発達支援センター");
    expect(matchingRows).toHaveLength(1);

    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("カンマを含む事業所名(ダブルクォート囲み)も正しく1件として抽出する", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const rows = normalizeWamNetCsv(csv, "放課後等デイサービス", "放課後等デイサービス", "child", 1, 2, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(rows.some((row) => row.name === "すずらん,放課後等デイサービス")).toBe(true);
  });

  it("実データの住所・連絡先・座標列をfacilitiesの値へマッピングする", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const [row] = normalizeWamNetCsv(csv, "自立訓練(機能訓練)", "自立訓練", "adult", null, null, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(row).toMatchObject({
      municipality: "千代田区",
      address: "東京都千代田区一番町1-1",
      phone: "03-1234-5678",
      url: "https://example.test/himawari",
      lat: 35.691,
      lng: 139.75,
      age_range: "adult",
      service_category: "自立訓練",
    });
  });

  it("facility_subtypeにはservice_categoryと同じ値が設定される(施設一覧のバッジ表示・絞り込みチップで同一事業者の複数サービスを区別するため)", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const rows = normalizeWamNetCsv(csv, "放課後等デイサービス", "放課後等デイサービス", "child", 1, 2, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.facility_subtype === row.service_category)).toBe(true);
  });

  // ============================================================
  // lifestage_min/lifestage_max(migration 0016、児童発達支援=[0,0]・放課後等デイサービス=[1,2]、
  // それ以外のサービス種別は null=細分なし)
  // ============================================================

  it("lifestageMin/lifestageMaxに数値を渡すと、出力行のlifestage_min/lifestage_maxにそのまま設定される(児童発達支援=[0,0])", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const rows = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", 0, 0, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.lifestage_min === 0 && row.lifestage_max === 0)).toBe(true);
  });

  it("lifestageMin/lifestageMaxに異なる数値を渡すと、その値が出力行に反映される(放課後等デイサービス=[1,2])", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const rows = normalizeWamNetCsv(csv, "放課後等デイサービス", "放課後等デイサービス", "child", 1, 2, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.lifestage_min === 1 && row.lifestage_max === 2)).toBe(true);
  });

  it("lifestageMin/lifestageMaxにnullを渡すと、出力行のlifestage_min/lifestage_maxもnullになる(細分なしのサービス種別、例: 自立訓練)", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const rows = normalizeWamNetCsv(csv, "自立訓練(機能訓練)", "自立訓練", "adult", null, null, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.lifestage_min === null && row.lifestage_max === null)).toBe(true);
  });
});

describe("normalizeIryoJohoNetCsv", () => {
  it("東京都で始まる所在地の行だけを抽出する", async () => {
    const csv = await readFixture("iryo-joho-net-sample.csv");
    const rows = normalizeIryoJohoNetCsv(csv, "ds-iryo-joho-net", "2026-07-20T00:00:00.000Z");
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.name === "かながわ病院")).toBe(false);
  });

  it("すべての行がis_medical=1で投入される(医療情報ネットは医療機関のため検索除外対象)", async () => {
    const csv = await readFixture("iryo-joho-net-sample.csv");
    const rows = normalizeIryoJohoNetCsv(csv, "ds-iryo-joho-net", "2026-07-20T00:00:00.000Z");
    expect(rows.every((row) => row.is_medical === 1)).toBe(true);
  });

  it("実データのURL・座標列をfacilitiesの値へマッピングする", async () => {
    const csv = await readFixture("iryo-joho-net-sample.csv");
    const [row] = normalizeIryoJohoNetCsv(csv, "ds-iryo-joho-net", "2026-07-20T00:00:00.000Z");
    expect(row).toMatchObject({
      municipality: "中央区",
      url: "https://example.test/chuo",
      lat: 35.668,
      lng: 139.77,
    });
  });
});

describe("normalizeHattatsuHtmlSections", () => {
  const datasetId = "ds-hattatsu-shien-center";
  const fetchedAt = "2026-07-20T00:00:00.000Z";

  it("titleまたはtextが空のページを除外する", () => {
    const rows = normalizeHattatsuHtmlSections([
      { url: "https://example.test/empty-title", title: "  ", text: "本文" },
      { url: "https://example.test/empty-text", title: "タイトル", text: "\n " },
      { url: "https://example.test/valid", title: " 有効なタイトル ", text: " 有効な本文 " },
    ], datasetId, fetchedAt);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "有効なタイトル",
      category_type: "発達障害支援資料",
      municipality: "東京都",
      address: null,
      phone: null,
      age_range: "both",
      service_category: null,
      is_medical: 0,
      description: "有効な本文",
      fetched_at: fetchedAt,
    });
    expect(rows[0].raw_json).toBe(JSON.stringify({
      url: "https://example.test/valid",
      title: "有効なタイトル",
      text: "有効な本文",
    }));
  });

  it("本文が500文字を超える場合は500文字と省略記号へ切り詰める", () => {
    const text = "あ".repeat(501);
    const [row] = normalizeHattatsuHtmlSections([
      { url: "https://example.test/long", title: "長文", text },
    ], datasetId, fetchedAt);

    expect(row.description).toBe(`${"あ".repeat(500)}…`);
  });

  it("同じdatasetIdとURLからは常に同じidを生成する", () => {
    const page = { url: "https://example.test/article", title: "タイトル", text: "本文" };
    const [first] = normalizeHattatsuHtmlSections([page], datasetId, fetchedAt);
    const [second] = normalizeHattatsuHtmlSections([page], datasetId, "2026-08-01T00:00:00.000Z");

    expect(first.id).toBe(second.id);
  });
});

describe("buildSqlForSource", () => {
  const facilitiesSource = {
    id: "wam-net-disability-services",
    dataset_id: "ds-wam-net-disability-services",
    title: "障害福祉サービス等情報公表システム オープンデータ",
    sourceOrg: "独立行政法人福祉医療機構(WAM NET)",
    url: "https://www.wam.go.jp/content/wamnet/pcpub/top/sfkopendata/",
    license: "pdl-1.0",
    ingest_target: "facilities",
  };

  const facilityRow = {
    id: "ds-wam-net-disability-services-abc123",
    dataset_id: "ds-wam-net-disability-services",
    name: "ひまわり児童発達支援センター",
    category_type: "福祉ガイド",
    municipality: "千代田区",
    address: "東京都千代田区一番町1-1",
    age_range: "child",
    service_category: "児童発達支援",
    is_medical: 0,
    description: "児童発達支援",
    raw_json: { name: "ひまわり児童発達支援センター" },
  };

  const schoolRegistrySource = {
    id: "mext-school-code-list",
    dataset_id: "ds-mext-school-code-list",
    title: "学校コード一覧",
    sourceOrg: "文部科学省",
    url: "https://www.mext.go.jp/b_menu/toukei/mext_01087.html",
    license: "government-standard-terms-2.0",
    ingest_target: "school_registry",
  };

  const schoolRegistryRow = {
    id: "mext-school-code-list-abc123",
    source_id: "mext-school-code-list",
    school_code: "13101012345",
    name: "上野小学校",
    level: "elementary",
    municipality: "台東区",
    address: "東京都台東区上野1-1-1",
    raw_json: { name: "上野小学校" },
    fetched_at: "2026-07-20T00:00:00.000Z",
  };

  const licenseHoldSource = {
    id: "tokyo-public-school-list",
    dataset_id: "ds-tokyo-public-school-list",
    title: "東京都公立学校一覧(CSV)",
    sourceOrg: "東京都教育委員会",
    url: "https://www.kyoiku.metro.tokyo.lg.jp/about/statistics_and_research/list_of_public_school/school_lists2025",
    license: "none",
    ingest_target: "none",
  };

  it("DELETE文はfacility_tags→facilities→school_registry→datasetsの順で並ぶ(school_registryターゲット時)", () => {
    const statements = buildSqlForSource(schoolRegistrySource, [], "2026-07-20T00:00:00.000Z");
    const deleteStatements = statements.filter((statement) => statement.startsWith("DELETE FROM"));
    expect(deleteStatements).toEqual([
      "DELETE FROM facility_tags WHERE facility_id IN (SELECT id FROM facilities WHERE dataset_id = 'ds-mext-school-code-list');",
      "DELETE FROM facilities WHERE dataset_id = 'ds-mext-school-code-list';",
      "DELETE FROM school_registry WHERE source_id = 'mext-school-code-list';",
      "DELETE FROM datasets WHERE id = 'ds-mext-school-code-list';",
    ]);
  });

  it("facilitiesターゲットではDELETEはfacility_tags→facilities→datasetsの順で並ぶ(school_registryのDELETEは含まない)", () => {
    const statements = buildSqlForSource(facilitiesSource, [], "2026-07-20T00:00:00.000Z");
    const deleteStatements = statements.filter((statement) => statement.startsWith("DELETE FROM"));
    expect(deleteStatements).toEqual([
      "DELETE FROM facility_tags WHERE facility_id IN (SELECT id FROM facilities WHERE dataset_id = 'ds-wam-net-disability-services');",
      "DELETE FROM facilities WHERE dataset_id = 'ds-wam-net-disability-services';",
      "DELETE FROM datasets WHERE id = 'ds-wam-net-disability-services';",
    ]);
  });

  // 2026-08是正(外部コードレビュー指摘): facility_tags は本スクリプトが一切関知しない
  // 手動キュレーションデータ(consultation-desk-tags*.sql投入)のため、削除前に退避し、
  // 同じidで再投入された施設にのみ復元する(ingest-manual-survey.mjs と同じ方針)。
  // D1 は CREATE TEMP TABLE を許可しない(実機確認済み)ため、通常の CREATE TABLE ... AS SELECT
  // + 末尾 DROP TABLE を使う。
  it("再取込時、facility_tagsを削除前にステージングテーブルへ退避し、facilities再投入後に復元する", () => {
    const statements = buildSqlForSource(facilitiesSource, [facilityRow], "2026-07-20T00:00:00.000Z");

    const dropIfExistsIndex = statements.indexOf("DROP TABLE IF EXISTS _facility_tags_backup;");
    const backupIndex = statements.indexOf(
      "CREATE TABLE _facility_tags_backup AS SELECT facility_id, tag FROM facility_tags WHERE facility_id IN (SELECT id FROM facilities WHERE dataset_id = 'ds-wam-net-disability-services');",
    );
    const deleteTagsIndex = statements.findIndex((statement) => statement.startsWith("DELETE FROM facility_tags"));
    const lastFacilityInsertIndex = statements.map((s) => s.startsWith("INSERT INTO facilities")).lastIndexOf(true);
    const restoreIndex = statements.indexOf(
      "INSERT INTO facility_tags (facility_id, tag) SELECT facility_id, tag FROM _facility_tags_backup WHERE facility_id IN (SELECT id FROM facilities);",
    );
    const dropIndex = statements.indexOf("DROP TABLE _facility_tags_backup;");

    // 自己修復DROP → 退避 → 削除 → (facilities再投入) → 復元 → ステージングテーブル破棄、の順序。
    expect(dropIfExistsIndex).toBeGreaterThanOrEqual(0);
    expect(backupIndex).toBeGreaterThan(dropIfExistsIndex);
    expect(deleteTagsIndex).toBeGreaterThan(backupIndex);
    expect(restoreIndex).toBeGreaterThan(lastFacilityInsertIndex);
    expect(dropIndex).toBe(restoreIndex + 1);
  });

  it("SQL文字列中のシングルクォートはエスケープされる", () => {
    const statements = buildSqlForSource(
      facilitiesSource,
      [{ ...facilityRow, name: "O'Brien's Center" }],
      "2026-07-20T00:00:00.000Z",
    );
    const insertLine = statements.find((statement) => statement.startsWith("INSERT INTO facilities"));
    expect(insertLine).toContain("'O''Brien''s Center'");
  });

  it("ライセンス未許可(license-hold)の場合、datasets行のみが生成されfacilities/school_registryへのINSERTは生成しない", () => {
    const statements = buildSqlForSource(licenseHoldSource, [], "2026-07-20T00:00:00.000Z");
    expect(statements.some((statement) => statement.startsWith("INSERT INTO datasets"))).toBe(true);
    expect(statements.some((statement) => statement.startsWith("INSERT INTO facilities"))).toBe(false);
    expect(statements.some((statement) => statement.startsWith("INSERT INTO school_registry"))).toBe(false);
  });

  it("ライセンス未許可でも渡された行があれば無視してdatasetsのfreshness_noteにlicense-hold注記を残す", () => {
    const statements = buildSqlForSource(licenseHoldSource, [facilityRow], "2026-07-20T00:00:00.000Z");
    const datasetsLine = statements.find((statement) => statement.startsWith("INSERT INTO datasets"));
    expect(datasetsLine).toContain("license-hold");
    expect(statements.some((statement) => statement.startsWith("INSERT INTO facilities"))).toBe(false);
  });

  it("ingest_target='facilities'かつライセンス許可の場合、渡された行数だけfacilitiesへINSERTする", () => {
    const statements = buildSqlForSource(facilitiesSource, [facilityRow, { ...facilityRow, id: "row-2" }], "2026-07-20T00:00:00.000Z");
    const insertLines = statements.filter((statement) => statement.startsWith("INSERT INTO facilities"));
    expect(insertLines).toHaveLength(2);
  });

  it("facilities INSERTにはphone/url/lat/lngを含め、未指定値はNULLにする", () => {
    const statements = buildSqlForSource(facilitiesSource, [facilityRow], "2026-07-20T00:00:00.000Z");
    const insertLine = statements.find((statement) => statement.startsWith("INSERT INTO facilities"));
    expect(insertLine).toContain("address, phone, url, lat, lng, age_range, service_category");
    expect(insertLine).toContain("'東京都千代田区一番町1-1', NULL, NULL, NULL, NULL, 'child', '児童発達支援'");
  });

  // ============================================================
  // facility_subtype(WAM NET由来データを施設一覧のバッジ表示・絞り込みチップで
  // 区別するため、service_categoryと同じ値を投入する)
  // ============================================================

  it("facilities INSERTの列リストとVALUES句にfacility_subtypeを含む(service_categoryの直後)", () => {
    const statements = buildSqlForSource(
      facilitiesSource,
      [{ ...facilityRow, facility_subtype: "児童発達支援" }],
      "2026-07-20T00:00:00.000Z",
    );
    const insertLine = statements.find((statement) => statement.startsWith("INSERT INTO facilities"));
    expect(insertLine).toContain("service_category, facility_subtype, lifestage_min");
    expect(insertLine).toContain("'child', '児童発達支援', '児童発達支援', NULL, NULL, 0");
  });

  it("normalizeIryoJohoNetCsv等WAM NET以外の正規化関数由来の行(facility_subtypeプロパティ自体を持たない)を渡しても、facility_subtypeはNULLとしてINSERTされエラーにならない(他データソースへの悪影響が無いことの確認)", async () => {
    const csv = await readFixture("iryo-joho-net-sample.csv");
    const [row] = normalizeIryoJohoNetCsv(csv, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(row.facility_subtype).toBeUndefined();

    let statements;
    expect(() => {
      statements = buildSqlForSource(facilitiesSource, [row], "2026-07-20T00:00:00.000Z");
    }).not.toThrow();

    const insertLine = statements.find((statement) => statement.startsWith("INSERT INTO facilities"));
    expect(insertLine).toContain("'both', NULL, NULL, NULL, NULL, 1");
  });

  // ============================================================
  // lifestage_min/lifestage_max(migration 0016、service_categoryの直後に追加)
  // ============================================================

  it("facilities INSERTの列リストにlifestage_min/lifestage_maxを含む", () => {
    const statements = buildSqlForSource(facilitiesSource, [facilityRow], "2026-07-20T00:00:00.000Z");
    const insertLine = statements.find((statement) => statement.startsWith("INSERT INTO facilities"));
    expect(insertLine).toContain("age_range, service_category, facility_subtype, lifestage_min, lifestage_max, is_medical");
  });

  it("行にlifestage_min/lifestage_maxが数値で設定されている場合はその値をそのままVALUES句に埋め込む", () => {
    const statements = buildSqlForSource(
      facilitiesSource,
      [{ ...facilityRow, lifestage_min: 0, lifestage_max: 0 }],
      "2026-07-20T00:00:00.000Z",
    );
    const insertLine = statements.find((statement) => statement.startsWith("INSERT INTO facilities"));
    expect(insertLine).toContain("'child', '児童発達支援', NULL, 0, 0, 0");
  });

  it("行にlifestage_min/lifestage_maxが無い(undefined)場合はNULLへフォールバックする(WAM NET以外の既存source等の回帰確認)", () => {
    const statements = buildSqlForSource(facilitiesSource, [facilityRow], "2026-07-20T00:00:00.000Z");
    const insertLine = statements.find((statement) => statement.startsWith("INSERT INTO facilities"));
    expect(insertLine).toContain("'child', '児童発達支援', NULL, NULL, NULL, 0");
  });

  it("行のlifestage_min/lifestage_maxが明示的にnullの場合もNULLへ変換する", () => {
    const statements = buildSqlForSource(
      facilitiesSource,
      [{ ...facilityRow, lifestage_min: null, lifestage_max: null }],
      "2026-07-20T00:00:00.000Z",
    );
    const insertLine = statements.find((statement) => statement.startsWith("INSERT INTO facilities"));
    expect(insertLine).toContain("'child', '児童発達支援', NULL, NULL, NULL, 0");
  });

  it("ingest_target='school_registry'かつライセンス許可の場合、渡された行数だけschool_registryへINSERTする", () => {
    const statements = buildSqlForSource(schoolRegistrySource, [schoolRegistryRow], "2026-07-20T00:00:00.000Z");
    const insertLines = statements.filter((statement) => statement.startsWith("INSERT INTO school_registry"));
    expect(insertLines).toHaveLength(1);
    expect(insertLines[0]).toContain("'上野小学校'");
  });

  it("同一の入力からは常に同じSQLを生成する(冪等・決定的)", () => {
    const first = buildSqlForSource(facilitiesSource, [facilityRow], "2026-07-20T00:00:00.000Z");
    const second = buildSqlForSource(facilitiesSource, [facilityRow], "2026-07-20T00:00:00.000Z");
    expect(first).toEqual(second);
  });
});

describe("idFor(idFor経由のID決定性、normalizeWamNetCsv/normalizeIryoJohoNetCsv/normalizeSchoolCsv共通)", () => {
  it("同じCSV入力からnormalizeWamNetCsvを2回呼んでも同じidが生成される(冪等な再取込のため)", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const first = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", 0, 0, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    const second = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", 0, 0, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id));
  });

  it("fetched_atが異なっても(取得時刻はidに影響しないため)idは変わらない", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const first = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", 0, 0, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    const second = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", 0, 0, "ds-wam-net-disability-services", "2026-08-01T00:00:00.000Z");
    expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id));
  });

  it("lifestageMin/lifestageMaxが異なってもidは変わらない(idはサービス名・事業所名・住所のみに依存する)", async () => {
    const csv = await readFixture("wam-net-sample.csv");
    const first = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", 0, 0, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    const second = normalizeWamNetCsv(csv, "児童発達支援", "児童発達支援", "child", null, null, "ds-wam-net-disability-services", "2026-07-20T00:00:00.000Z");
    expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id));
  });
});

describe("normalizeMextSchoolCodeCsv", () => {
  it("先頭のタイトル行をスキップして2行目のヘッダーから正規化する", () => {
    const csv = [
      "文部科学省　学校コード一覧,,,,更新日：,5/20/2026",
      "学校コード,学校種,都道府県番号,学校名,学校所在地",
      "B131100000001,B1(小学校),13,テスト小学校,東京都練馬区豊玉北1-1-1",
    ].join("\n");

    expect(normalizeMextSchoolCodeCsv(csv, "mext-school-code-list", "2026-07-20T00:00:00.000Z"))
      .toMatchObject([{
        school_code: "B131100000001",
        name: "テスト小学校",
        municipality: "練馬区",
      }]);
  });
});

describe("splitSqlIntoChunks", () => {
  it("チャンクサイズ以下の場合は1チャンクにまとめる", () => {
    const chunks = splitSqlIntoChunks(["INSERT 1;", "INSERT 2;"], 1000);
    expect(chunks).toHaveLength(1);
  });

  it("チャンクサイズを超える場合は複数チャンクに分割する", () => {
    const statements = Array.from({ length: 2500 }, (_, index) => `INSERT ${index};`);
    const chunks = splitSqlIntoChunks(statements, 1000);
    expect(chunks).toHaveLength(3);
  });

  it("各チャンクはPRAGMAで始まる(D1リモートが明示的なBEGIN TRANSACTIONを許可しないため含めない)", () => {
    const statements = Array.from({ length: 1500 }, (_, index) => `INSERT ${index};`);
    const chunks = splitSqlIntoChunks(statements, 1000);
    for (const chunk of chunks) {
      expect(chunk.startsWith("PRAGMA foreign_keys = ON;\n")).toBe(true);
      expect(chunk).not.toContain("BEGIN TRANSACTION");
      expect(chunk).not.toContain("COMMIT;");
    }
  });

  it("分割後も全SQL文の総数(元の文の数)が保たれる", () => {
    const statements = Array.from({ length: 2001 }, (_, index) => `INSERT ${index};`);
    const chunks = splitSqlIntoChunks(statements, 1000);
    const totalInsertLines = chunks
      .flatMap((chunk) => chunk.split("\n"))
      .filter((line) => line.startsWith("INSERT")).length;
    expect(totalInsertLines).toBe(2001);
  });

  it("チャンクサイズに0以下・非整数を渡すとErrorを投げる", () => {
    expect(() => splitSqlIntoChunks(["INSERT 1;"], 0)).toThrow();
    expect(() => splitSqlIntoChunks(["INSERT 1;"], 1.5)).toThrow();
  });
});
