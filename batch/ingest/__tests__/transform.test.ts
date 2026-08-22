import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  csvRowsToRecords,
  extractMunicipality,
  inferAgeRange,
  isMedicalFacility,
  isOutOfScopeFacility,
  normalizeCsvRow,
  normalizeCsvText,
  parseCsv,
  resolveLifestageRange,
  stableFacilityId,
  type CsvColumnMap,
} from "../transform";

const FIXTURE_CSV = readFileSync(
  join(__dirname, "fixtures", "facilities-sample.csv"),
  "utf-8",
);

const COLUMNS: CsvColumnMap = {
  name: "名称",
  address: "所在地",
  phone: "電話番号",
  url: "ホームページ",
  ageHint: "対象",
  municipality: "区市町村",
  medicalHint: "分類",
  description: "備考",
};

describe("parseCsv", () => {
  it("単純な CSV をヘッダー込みの行×列にパースする", () => {
    const rows = parseCsv("a,b,c\n1,2,3");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("ダブルクォート内のカンマ・エスケープされた \"\" を1フィールドとして扱う", () => {
    const rows = parseCsv('name,note\n"江戸川区""者""ガイド","備考にカンマ,を含む行"');
    expect(rows[1]).toEqual(['江戸川区"者"ガイド', "備考にカンマ,を含む行"]);
  });

  it("完全な空行は結果から除外する", () => {
    const rows = parseCsv("a,b\n1,2\n\n3,4");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("csvRowsToRecords", () => {
  it("ヘッダー行をキーにしたレコード配列に変換し、全欄空の行は除外する", () => {
    const records = csvRowsToRecords(FIXTURE_CSV);
    // フィクスチャは7データ行(うち1行は全欄空)なので6件になる。
    expect(records).toHaveLength(6);
    expect(records[0]["名称"]).toBe("世田谷区発達障がい相談支援センター");
  });
});

describe("extractMunicipality", () => {
  it("住所文字列から区市町村名を抽出する", () => {
    expect(extractMunicipality(undefined, "東京都八王子市XX7-8-9", undefined)).toBe("八王子市");
  });

  it("区市町村欄が優先候補として渡された場合はそれを優先する", () => {
    expect(extractMunicipality("東京都", "東京都新宿区XX9-9-9")).toBe("東京都");
  });

  it("どの候補にも区市町村名が見つからない場合は '東京都' にフォールバックする", () => {
    expect(extractMunicipality(undefined, undefined, "施設名のみ")).toBe("東京都");
  });

  it("東京都外の神奈川県横浜市中区の住所でも、現状は誤って '東京都' にフォールバックする", () => {
    // これは望ましくない現状の挙動を記録する回帰テスト。
    expect(extractMunicipality(undefined, "神奈川県横浜市中区日本大通1", undefined)).toBe("東京都");
  });

  it("大阪府大阪市北区の住所では、東京都北区との文字列一致により '北区' を返す", () => {
    // これは望ましくない現状の挙動を記録する回帰テスト。
    expect(extractMunicipality(undefined, "大阪府大阪市北区梅田1", undefined)).toBe("北区");
  });

  it("東京都外の大阪府大阪市浪速区の住所でも、現状は誤って '東京都' にフォールバックする", () => {
    // これは望ましくない現状の挙動を記録する回帰テスト。
    expect(extractMunicipality(undefined, "大阪府大阪市浪速区難波中1", undefined)).toBe("東京都");
  });

  it("「新宿区」等、他の区名の部分文字列にならない区を正しく判定する", () => {
    expect(extractMunicipality("東京都西東京市XX1-1-1")).toBe("西東京市");
  });
});

describe("normalizeCsvRow: municipalityCode(全国版移行 Phase 1)", () => {
  it("「東京都府中市…」の住所から municipalityCode='13206' を付与する", () => {
    const row = normalizeCsvRow({ "名称": "テスト窓口", "所在地": "東京都府中市宮西町1-1-1" }, { name: "名称", address: "所在地" }, "ds-test", "相談窓口");
    expect(row?.municipality).toBe("府中市");
    expect(row?.municipalityCode).toBe("13206");
  });

  it("区市町村名を抽出できない住所には広域コード '13000' を付与する", () => {
    const row = normalizeCsvRow({ "名称": "テスト窓口", "所在地": "" }, { name: "名称", address: "所在地" }, "ds-test", "相談窓口");
    expect(row?.municipality).toBe("東京都");
    expect(row?.municipalityCode).toBe("13000");
  });

  it("fixedMunicipality 指定時もそれに対応するコードを付与する", () => {
    const row = normalizeCsvRow({ "名称": "テスト窓口" }, { name: "名称" }, "ds-test", "相談窓口", "新宿区");
    expect(row?.municipality).toBe("新宿区");
    expect(row?.municipalityCode).toBe("13104");
  });
});

describe("inferAgeRange", () => {
  it("「18歳未満」を含む場合は child", () => {
    expect(inferAgeRange("18歳未満が対象")).toBe("child");
  });

  it("「18歳以上」を含む場合は adult", () => {
    expect(inferAgeRange("18歳以上が対象")).toBe("adult");
  });

  it("子ども・成人いずれの言及もある場合は both", () => {
    expect(inferAgeRange("子どもから大人まで")).toBe("both");
  });

  it("年齢の手がかりが無い場合は both にフォールバックする", () => {
    expect(inferAgeRange("", null, undefined)).toBe("both");
    expect(inferAgeRange("区市町村を問わず利用できる広域窓口")).toBe("both");
  });
});

describe("isMedicalFacility", () => {
  it("「診療科」を含む場合は医療機関と判定する", () => {
    expect(isMedicalFacility("医療機関", "都立小児発達医療センター 発達診療科")).toBe(true);
  });

  it("「クリニック」を含む場合は医療機関と判定する", () => {
    expect(isMedicalFacility(undefined, "○○発達クリニック")).toBe(true);
  });

  it("該当する語が無い場合は false", () => {
    expect(isMedicalFacility("相談窓口", "世田谷区発達障がい相談支援センター")).toBe(false);
  });
});

describe("isOutOfScopeFacility", () => {
  it("「地域包括支援センター・ケアマネジメントセンター」は対象領域外と判定する", () => {
    expect(isOutOfScopeFacility("地域包括支援センター・ケアマネジメントセンター")).toBe(true);
  });

  it("「特別養護老人ホーム・高齢者在宅サービスセンター」は対象領域外と判定する", () => {
    expect(isOutOfScopeFacility("特別養護老人ホーム・高齢者在宅サービスセンター")).toBe(true);
  });

  it("「老人福祉センター・老人福祉館」は対象領域外と判定する", () => {
    expect(isOutOfScopeFacility("老人福祉センター・老人福祉館")).toBe(true);
  });

  it("該当しない値(汎用バケット「福祉施設」等)は false", () => {
    expect(isOutOfScopeFacility("福祉施設")).toBe(false);
  });

  it("null/undefined の場合は false", () => {
    expect(isOutOfScopeFacility(null)).toBe(false);
    expect(isOutOfScopeFacility(undefined)).toBe(false);
  });

  describe("名称・説明文からの検出(migration 0012、ケアハウス松が谷)", () => {
    it("サブタイプが汎用バケット「福祉施設」でも、名称に「ケアハウス」を含む場合は対象領域外と判定する(ケアハウス松が谷、検出漏れの解消)", () => {
      expect(isOutOfScopeFacility("福祉施設", "ケアハウス松が谷")).toBe(true);
    });

    it("名称に「老人ホーム」を含む場合は対象領域外と判定する", () => {
      expect(isOutOfScopeFacility(null, "○○老人ホーム")).toBe(true);
    });

    it("名称に「老人福祉」を含む場合は対象領域外と判定する", () => {
      expect(isOutOfScopeFacility(null, "○○老人福祉センター")).toBe(true);
    });

    it("名称に「地域包括支援センター」を直接含む場合も対象領域外と判定する(サブタイプ側で既に検出済みだが、名称単独でも一致することを確認する防御的テスト)", () => {
      expect(isOutOfScopeFacility(null, "○○地域包括支援センター")).toBe(true);
    });

    it("単独の「高齢者」はキーワードに含まれないため、他の3語のいずれにも一致しない名称は false のまま(高齢者・障害者複合施設等の誤除外を避ける設計判断の確認)", () => {
      expect(isOutOfScopeFacility(null, "高齢者・障害者相談センター")).toBe(false);
    });

    it("サブタイプにもキーワードにも該当しない場合は false", () => {
      expect(isOutOfScopeFacility("福祉施設", "つばさ福祉工房")).toBe(false);
    });

    it("description に含まれるキーワードでも検出される(name・description を連結して判定するため)", () => {
      expect(isOutOfScopeFacility(null, "つばさ福祉工房", "旧ケアハウスを改装した施設")).toBe(true);
    });
  });

  describe("名称の完全一致・追加キーワードからの検出(migration 0013、老人保健施設千束・三ノ輪口腔ケアセンター)", () => {
    it("名称に「老人保健施設」を含む場合は対象領域外と判定する(老人保健施設千束、キーワード検出)", () => {
      expect(isOutOfScopeFacility(null, "老人保健施設千束")).toBe(true);
    });

    it("名称が OUT_OF_SCOPE_EXACT_NAMES に完全一致する場合は対象領域外と判定する(三ノ輪口腔ケアセンター、サブタイプ・キーワードいずれにも依らない完全一致検出)", () => {
      expect(isOutOfScopeFacility("福祉施設", "三ノ輪口腔ケアセンター")).toBe(true);
    });

    it("「口腔ケア」を含んでいても登録済みの完全一致名でない場合は false のまま(「口腔ケア」単独はキーワード化していない設計判断の確認、障害者歯科等の誤除外を避ける)", () => {
      expect(isOutOfScopeFacility(null, "障害者口腔ケア相談室")).toBe(false);
    });

    it("完全一致名の前後に空白(全角・半角)がある場合も TRIM 後に一致し true になる", () => {
      expect(isOutOfScopeFacility(null, "　三ノ輪口腔ケアセンター　")).toBe(true);
      expect(isOutOfScopeFacility(null, " 三ノ輪口腔ケアセンター ")).toBe(true);
    });
  });

  describe("サブタイプ・施設名の追加(migration 0014、区民事務所・地区センター・社会福祉協議会・フロム千束)", () => {
    it("サブタイプ「区民事務所」は対象領域外と判定する(ds-taito-kuyakusho、住民票等の証明書発行窓口で相談機能を持たない)", () => {
      expect(isOutOfScopeFacility("区民事務所")).toBe(true);
    });

    it("サブタイプ「地区センター」は対象領域外と判定する(ds-taito-kuyakusho、集会室貸出施設で相談機能を持たない)", () => {
      expect(isOutOfScopeFacility("地区センター")).toBe(true);
    });

    it("サブタイプ「区役所」は対象領域外に含めない(台東区役所本体は多部門庁舎のため除外対象外、over-broadening 防止の回帰確認)", () => {
      expect(isOutOfScopeFacility("区役所")).toBe(false);
    });

    it("名称が「社会福祉協議会」(無修飾)に完全一致する場合は対象領域外と判定する(台東区社協の総合事務所)", () => {
      expect(isOutOfScopeFacility(null, "社会福祉協議会")).toBe(true);
    });

    it("市区町村名等の修飾が付いた「〇〇社会福祉協議会…」は対象領域外にしない(WAM NET の正規の障害相談窓口を誤除外しない、無修飾完全一致のみで判定する設計の確認)", () => {
      expect(isOutOfScopeFacility(null, "立川市社会福祉協議会障害者相談支援事業所")).toBe(false);
    });

    it("名称が「身体障害者生活ホーム「フロム千束」」に完全一致する場合は対象領域外と判定する(身体障害専用のグループホーム)", () => {
      expect(isOutOfScopeFacility(null, "身体障害者生活ホーム「フロム千束」")).toBe(true);
    });

    it("同じ「身体障害者生活ホーム」でも別施設名(完全一致しない)は対象領域外にしない(「身体障害者」をキーワード化していない設計の確認、三障害複合の相談支援施設名との誤除外を避ける)", () => {
      expect(isOutOfScopeFacility(null, "身体障害者生活ホーム「べつの場所」")).toBe(false);
    });
  });
});

describe("stableFacilityId", () => {
  it("同じ入力からは常に同じ ID を生成する(決定的)", () => {
    const a = stableFacilityId("ds-tokyo-fukushi-shisetsu", "世田谷区発達障がい相談支援センター|東京都世田谷区XX1-2-3");
    const b = stableFacilityId("ds-tokyo-fukushi-shisetsu", "世田谷区発達障がい相談支援センター|東京都世田谷区XX1-2-3");
    expect(a).toBe(b);
    expect(a).toMatch(/^fac-[0-9a-f]{8}$/);
  });

  it("入力が異なれば異なる ID になる", () => {
    const a = stableFacilityId("ds-tokyo-fukushi-shisetsu", "施設A|住所A");
    const b = stableFacilityId("ds-tokyo-fukushi-shisetsu", "施設B|住所B");
    expect(a).not.toBe(b);
  });

  it("データセットが異なれば同じ施設情報でも異なる ID になる(データセット間の衝突防止)", () => {
    const a = stableFacilityId("ds-a", "施設X|住所X");
    const b = stableFacilityId("ds-b", "施設X|住所X");
    expect(a).not.toBe(b);
  });
});

describe("normalizeCsvRow", () => {
  it("名称が空の行は null を返す(見出し・注釈行の混入対策)", () => {
    expect(normalizeCsvRow({ 名称: "" }, COLUMNS, "ds-1", "相談窓口")).toBeNull();
  });

  it("CSV 行を facility レコードへ正規化する", () => {
    const row = {
      名称: "世田谷区発達障がい相談支援センター",
      所在地: "東京都世田谷区XX1-2-3",
      電話番号: "03-0000-1001",
      ホームページ: "https://example.setagaya.tokyo.jp/soudan",
      対象: "18歳未満",
      区市町村: "",
      分類: "相談窓口",
      備考: "発達に関する相談窓口",
    };
    const facility = normalizeCsvRow(row, COLUMNS, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility).not.toBeNull();
    expect(facility).toMatchObject({
      datasetId: "ds-tokyo-fukushi-shisetsu",
      name: "世田谷区発達障がい相談支援センター",
      categoryType: "相談窓口",
      municipality: "世田谷区",
      address: "東京都世田谷区XX1-2-3",
      phone: "03-0000-1001",
      url: "https://example.setagaya.tokyo.jp/soudan",
      ageRange: "child",
      isMedical: false,
    });
    expect(facility?.id).toMatch(/^fac-[0-9a-f]{8}$/);
    expect(JSON.parse(facility!.rawJson)).toEqual(row);
  });

  it("contactMethods 列が未指定の CsvColumnMap では常に null になる(TICKET-0051、現状の ds-tokyo-fukushi-shisetsu の実装状態)", () => {
    const row = {
      名称: "世田谷区発達障がい相談支援センター",
      所在地: "東京都世田谷区XX1-2-3",
      電話番号: "03-0000-1001",
      ホームページ: "https://example.setagaya.tokyo.jp/soudan",
      対象: "18歳未満",
      区市町村: "",
      分類: "相談窓口",
      備考: "発達に関する相談窓口",
      連絡手段: "メール可・来所予約可",
    };
    // COLUMNS(実際の datasets.config.ts の ds-tokyo-fukushi-shisetsu 設定)には
    // contactMethods マッピングが無いため、生データ上に「連絡手段」列があっても取り込まれない
    // (作業ログ参照: 実データの列名が未確認のため意図的に未マッピング)。
    const facility = normalizeCsvRow(row, COLUMNS, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.contactMethods).toBeNull();
  });

  it("contactMethods 列がマッピングされている場合は値を取り込む(TICKET-0051、列名確認後の想定動作)", () => {
    const columnsWithContactMethods: CsvColumnMap = { ...COLUMNS, contactMethods: "連絡手段" };
    const row = {
      名称: "世田谷区発達障がい相談支援センター",
      所在地: "東京都世田谷区XX1-2-3",
      電話番号: "03-0000-1001",
      ホームページ: "https://example.setagaya.tokyo.jp/soudan",
      対象: "18歳未満",
      区市町村: "",
      分類: "相談窓口",
      備考: "発達に関する相談窓口",
      連絡手段: "メール可・来所予約可",
    };
    const facility = normalizeCsvRow(row, columnsWithContactMethods, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.contactMethods).toBe("メール可・来所予約可");
  });

  it("contactMethods 列がマッピングされていても値が空の場合は null になる(「連絡手段なし」と誤読させない、AC-4)", () => {
    const columnsWithContactMethods: CsvColumnMap = { ...COLUMNS, contactMethods: "連絡手段" };
    const row = {
      名称: "世田谷区発達障がい相談支援センター",
      所在地: "東京都世田谷区XX1-2-3",
      電話番号: "03-0000-1001",
      ホームページ: "https://example.setagaya.tokyo.jp/soudan",
      対象: "18歳未満",
      区市町村: "",
      分類: "相談窓口",
      備考: "発達に関する相談窓口",
      連絡手段: "",
    };
    const facility = normalizeCsvRow(row, columnsWithContactMethods, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.contactMethods).toBeNull();
  });

  it("医療機関の行は isMedical=true になる", () => {
    const row = {
      名称: "都立小児発達医療センター 発達診療科",
      所在地: "東京都府中市XX1-1-1",
      電話番号: "042-000-1004",
      ホームページ: "https://example.fuchu.tokyo.jp/hospital",
      対象: "18歳未満",
      区市町村: "",
      分類: "医療機関",
      備考: "診療科(小児科)",
    };
    const facility = normalizeCsvRow(row, COLUMNS, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.isMedical).toBe(true);
    expect(facility?.municipality).toBe("府中市");
  });
});

describe("normalizeCsvText (フィクスチャ全体の正規化)", () => {
  const facilities = normalizeCsvText(FIXTURE_CSV, COLUMNS, "ds-tokyo-fukushi-shisetsu", "相談窓口");

  it("空行を除いた6件が正規化される", () => {
    expect(facilities).toHaveLength(6);
  });

  it("区市町村が個別欄になくても住所から抽出できる", () => {
    const hachioji = facilities.find((f) => f.name === "八王子市発達障害者支援センター");
    expect(hachioji?.municipality).toBe("八王子市");
    expect(hachioji?.ageRange).toBe("adult");
  });

  it("広域窓口(区市町村欄='東京都')はフォールバック値をそのまま使う", () => {
    const wide = facilities.find((f) => f.name === "東京都発達障害者支援センター");
    expect(wide?.municipality).toBe("東京都");
  });

  it("医療機関(分類='医療機関')は isMedical=true として抽出される", () => {
    const hospital = facilities.find((f) => f.name.includes("発達診療科"));
    expect(hospital?.isMedical).toBe(true);
  });

  it("ダブルクォート・カンマを含む行も名称・備考が正しく復元される", () => {
    const edogawa = facilities.find((f) => f.name.startsWith("江戸川区"));
    expect(edogawa?.name).toBe('江戸川区 発達障害児"者"支援ガイド');
    expect(edogawa?.description).toBe("備考にカンマ,を含む行");
  });

  it("全 facility の id が一意である", () => {
    const ids = facilities.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ============================================================
// latColumn/lngColumn(台東区6データセット、TICKET-0011作業ログ 7564a94)
// ============================================================

describe("normalizeCsvRow (latColumn/lngColumn)", () => {
  const TAITO_COLUMNS: CsvColumnMap = {
    name: "名称",
    address: "所在地",
    phone: "電話番号",
    ageHint: "名称",
    lngColumn: "X座標",
    latColumn: "Y座標",
  };

  it("X座標/Y座標が数値として解釈できる場合、lat/lng に数値を格納する", () => {
    const row = {
      名称: "区役所",
      所在地: "台東区東上野4丁目5番6号",
      電話番号: "03-5246-1111",
      X座標: "139.7798",
      Y座標: "35.7127",
    };
    const facility = normalizeCsvRow(row, TAITO_COLUMNS, "ds-taito-kuyakusho", "相談窓口", "台東区");
    expect(facility?.lng).toBe(139.7798);
    expect(facility?.lat).toBe(35.7127);
  });

  it("X座標/Y座標が空文字の場合は lat/lng とも null になる", () => {
    const row = { 名称: "施設A", 所在地: "台東区X", 電話番号: "", X座標: "", Y座標: "" };
    const facility = normalizeCsvRow(row, TAITO_COLUMNS, "ds-taito-kuyakusho", "相談窓口", "台東区");
    expect(facility?.lat).toBeNull();
    expect(facility?.lng).toBeNull();
  });

  it("X座標/Y座標が数値化できない不正値の場合は lat/lng とも null になる(ジオコーディング対象に残す)", () => {
    const row = { 名称: "施設B", 所在地: "台東区Y", 電話番号: "", X座標: "不明", Y座標: "N/A" };
    const facility = normalizeCsvRow(row, TAITO_COLUMNS, "ds-taito-kuyakusho", "相談窓口", "台東区");
    expect(facility?.lat).toBeNull();
    expect(facility?.lng).toBeNull();
  });

  it("latColumn/lngColumn 自体が CsvColumnMap に未指定の場合は常に null になる(既存データセットの回帰確認)", () => {
    const columnsWithoutCoords: CsvColumnMap = { name: "名称" };
    const row = { 名称: "施設C", X座標: "139.7798", Y座標: "35.7127" };
    const facility = normalizeCsvRow(row, columnsWithoutCoords, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.lat).toBeNull();
    expect(facility?.lng).toBeNull();
  });
});

// ============================================================
// fixedMunicipality(台東区6データセット、TICKET-0011作業ログ 7564a94)
// ============================================================

describe("normalizeCsvRow (fixedMunicipality)", () => {
  it("fixedMunicipality 指定時はその値をそのまま使い、住所・施設名からの抽出(extractMunicipality)を行わない", () => {
    // 住所は敢えて他区(新宿区)を含む文字列にして、fixedMunicipality が優先されることを確認する。
    const row = { 名称: "施設D", 所在地: "新宿区に見えるが実際は台東区の施設" };
    const facility = normalizeCsvRow(row, { name: "名称", address: "所在地" }, "ds-taito-jidokan", "福祉ガイド", "台東区");
    expect(facility?.municipality).toBe("台東区");
  });

  it("fixedMunicipality 未指定時は従来どおり extractMunicipality の結果を使う(回帰確認)", () => {
    const row = { 名称: "施設E", 所在地: "東京都新宿区XX1-1-1" };
    const facility = normalizeCsvRow(row, { name: "名称", address: "所在地" }, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.municipality).toBe("新宿区");
  });
});

// ============================================================
// normalizeCsvText への fixedMunicipality 伝播
// ============================================================

describe("normalizeCsvText (fixedMunicipality 伝播)", () => {
  it("fixedMunicipality を渡すと全行が同じ municipality になる(住所の区名混在に影響されない)", () => {
    const csv = "名称,所在地\n施設F,新宿区みたいな表記\n施設G,台東区花川戸1-1-1";
    const facilities = normalizeCsvText(csv, { name: "名称", address: "所在地" }, "ds-taito-jidokan", "福祉ガイド", "台東区");
    expect(facilities).toHaveLength(2);
    expect(facilities.every((f) => f.municipality === "台東区")).toBe(true);
  });
});

// ============================================================
// defaultFacilitySubtype(台東区6データセットのデータセット単位サブタイプ付与)
// ============================================================

describe("normalizeCsvRow (defaultFacilitySubtype)", () => {
  it("defaultFacilitySubtype を渡すと facilitySubtype にそのまま設定される", () => {
    const row = { 名称: "区役所", 所在地: "台東区東上野4丁目5番6号" };
    const facility = normalizeCsvRow(
      row,
      { name: "名称", address: "所在地" },
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
    );
    expect(facility?.facilitySubtype).toBe("行政窓口");
  });

  it("defaultFacilitySubtype 未指定時は facilitySubtype が null になる(既存データセットの回帰確認)", () => {
    const row = { 名称: "世田谷区発達障がい相談支援センター", 所在地: "東京都世田谷区XX1-2-3" };
    const facility = normalizeCsvRow(row, { name: "名称", address: "所在地" }, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.facilitySubtype).toBeNull();
  });
});

describe("normalizeCsvText (defaultFacilitySubtype 伝播)", () => {
  it("defaultFacilitySubtype を渡すと全行の facilitySubtype に同じ値が設定される", () => {
    const csv = "名称,所在地\n施設F,台東区花川戸1-1-1\n施設G,台東区花川戸2-2-2";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地" },
      "ds-taito-jidokan",
      "福祉ガイド",
      "台東区",
      "児童館・こどもクラブ",
    );
    expect(facilities).toHaveLength(2);
    expect(facilities.every((f) => f.facilitySubtype === "児童館・こどもクラブ")).toBe(true);
  });
});

// ============================================================
// subtypeColumn(施設サブタイプの行単位取得、台東区CSVの「大分類」列)
// ============================================================

describe("normalizeCsvRow (subtypeColumn)", () => {
  const SUBTYPE_COLUMNS: CsvColumnMap = { name: "名称", address: "所在地", subtypeColumn: "大分類" };

  it("subtypeColumn が設定され行の値が非空の場合、defaultFacilitySubtype より行の値が優先される", () => {
    const row = { 名称: "浅草橋区民館", 所在地: "台東区浅草橋1-1-1", 大分類: "地区センター" };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-kuyakusho", "相談窓口", "台東区", "行政窓口");
    expect(facility?.facilitySubtype).toBe("地区センター");
  });

  it("subtypeColumn のセルが空文字の場合、defaultFacilitySubtype にフォールバックする", () => {
    const row = { 名称: "施設H", 所在地: "台東区浅草1-1-1", 大分類: "" };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-kuyakusho", "相談窓口", "台東区", "行政窓口");
    expect(facility?.facilitySubtype).toBe("行政窓口");
  });

  it("subtypeColumn のセルが空白のみの場合も、defaultFacilitySubtype にフォールバックする", () => {
    const row = { 名称: "施設I", 所在地: "台東区浅草2-2-2", 大分類: "   " };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-kuyakusho", "相談窓口", "台東区", "行政窓口");
    expect(facility?.facilitySubtype).toBe("行政窓口");
  });

  it("subtypeColumn が設定されていても行にその列自体が存在しない場合、defaultFacilitySubtype にフォールバックする", () => {
    const row = { 名称: "施設J", 所在地: "台東区浅草3-3-3" };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-kuyakusho", "相談窓口", "台東区", "行政窓口");
    expect(facility?.facilitySubtype).toBe("行政窓口");
  });

  it("subtypeColumn が未設定の CsvColumnMap では、行に「大分類」列があっても無視し defaultFacilitySubtype を使う(既存データセットの回帰確認)", () => {
    const row = { 名称: "世田谷区発達障がい相談支援センター", 所在地: "東京都世田谷区XX1-2-3", 大分類: "地区センター" };
    const facility = normalizeCsvRow(
      row,
      { name: "名称", address: "所在地" },
      "ds-tokyo-fukushi-shisetsu",
      "相談窓口",
      undefined,
      "相談窓口(デフォルト)",
    );
    expect(facility?.facilitySubtype).toBe("相談窓口(デフォルト)");
  });

  it("subtypeColumn 経由で解決したサブタイプが対象領域外3分類の1つの場合、isOutOfScope=true になる(台東区「福祉施設」CSV、migration 0011)", () => {
    const row = {
      名称: "○○地域包括支援センター",
      所在地: "台東区X",
      大分類: "地域包括支援センター・ケアマネジメントセンター",
    };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-fukushi-shisetsu", "相談窓口", "台東区");
    expect(facility?.isOutOfScope).toBe(true);
  });

  it("subtypeColumn 経由で解決したサブタイプが汎用バケット「福祉施設」の場合、isOutOfScope=false のまま(除外対象外)", () => {
    const row = { 名称: "○○福祉施設", 所在地: "台東区X", 大分類: "福祉施設" };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-fukushi-shisetsu", "相談窓口", "台東区");
    expect(facility?.isOutOfScope).toBe(false);
  });

  it("subtypeColumn 経由で解決したサブタイプが汎用バケット「福祉施設」でも、名称に「ケアハウス」を含む場合は isOutOfScope=true になる(ケアハウス松が谷、migration 0012、サブタイプ判定と名称判定が組み合わさることの確認)", () => {
    const row = { 名称: "ケアハウス松が谷", 所在地: "台東区松が谷1-1-1", 大分類: "福祉施設" };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-fukushi-shisetsu", "相談窓口", "台東区");
    // facilitySubtype 自体は汎用値「福祉施設」のままで、単体では対象領域外3分類に一致しない。
    expect(facility?.facilitySubtype).toBe("福祉施設");
    expect(facility?.isOutOfScope).toBe(true);
  });

  it("subtypeColumn 経由で解決したサブタイプが汎用バケット「保健施設」でも、名称に「老人保健施設」を含む場合は isOutOfScope=true になる(老人保健施設千束、migration 0013、ds-taito-hoken-shisetsu は大分類が常に「保健施設」でサブタイプ側では判別できない)", () => {
    const row = { 名称: "老人保健施設千束", 所在地: "台東区X", 大分類: "保健施設" };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-hoken-shisetsu", "相談窓口", "台東区");
    expect(facility?.facilitySubtype).toBe("保健施設");
    expect(facility?.isOutOfScope).toBe(true);
  });

  it("subtypeColumn 経由で解決したサブタイプが汎用バケット「保健施設」でも、名称が OUT_OF_SCOPE_EXACT_NAMES に完全一致する場合は isOutOfScope=true になる(三ノ輪口腔ケアセンター、migration 0013)", () => {
    const row = { 名称: "三ノ輪口腔ケアセンター", 所在地: "台東区X", 大分類: "保健施設" };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-hoken-shisetsu", "相談窓口", "台東区");
    expect(facility?.facilitySubtype).toBe("保健施設");
    expect(facility?.isOutOfScope).toBe(true);
  });

  it("subtypeColumn 経由で解決したサブタイプが「区民事務所」の場合、isOutOfScope=true になる(ds-taito-kuyakusho、migration 0014)", () => {
    const row = { 名称: "浅草区民事務所", 所在地: "台東区X", 大分類: "区民事務所" };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-kuyakusho", "相談窓口", "台東区");
    expect(facility?.facilitySubtype).toBe("区民事務所");
    expect(facility?.isOutOfScope).toBe(true);
  });

  it("subtypeColumn 経由で解決したサブタイプが「区役所」の場合(台東区役所本体)、isOutOfScope=false のまま(migration 0014、多部門庁舎のため除外対象外)", () => {
    const row = { 名称: "台東区役所", 所在地: "台東区X", 大分類: "区役所" };
    const facility = normalizeCsvRow(row, SUBTYPE_COLUMNS, "ds-taito-kuyakusho", "相談窓口", "台東区");
    expect(facility?.facilitySubtype).toBe("区役所");
    expect(facility?.isOutOfScope).toBe(false);
  });
});

describe("normalizeCsvText (subtypeColumn 伝播)", () => {
  it("subtypeColumn を設定すると行ごとに異なる facilitySubtype が設定され、空セルの行だけ defaultFacilitySubtype にフォールバックする", () => {
    const csv = "名称,所在地,大分類\n施設K,台東区花川戸1-1-1,地区センター\n施設L,台東区花川戸2-2-2,";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地", subtypeColumn: "大分類" },
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
    );
    expect(facilities).toHaveLength(2);
    expect(facilities.find((f) => f.name === "施設K")?.facilitySubtype).toBe("地区センター");
    expect(facilities.find((f) => f.name === "施設L")?.facilitySubtype).toBe("行政窓口");
  });
});

// ============================================================
// fixedAgeRange(台東区 保育施設・児童館・子ども家庭支援センターの3データセット、
// 「AIAI NURSERY」「ほうらい子育てサポートセンター」等が age=adult 検索に混入するバグの修正)
// ============================================================

describe("normalizeCsvRow (fixedAgeRange)", () => {
  // 台東区 CSV には実在の年齢手がかり列が無いため、datasets.config.ts では ageHint を
  // 「名称」列(施設名)に割り当てている(弱いシグナル)。COLUMNS 定数とは別に、この
  // 台東区特有のマッピングを再現する。
  const TAITO_AGE_COLUMNS: CsvColumnMap = { name: "名称", address: "所在地", ageHint: "名称" };

  it("保育園名(「AIAI NURSERY　入谷」)は CHILD_PATTERN/ADULT_PATTERN いずれにも一致しないため、fixedAgeRange 未指定では inferAgeRange の既定値 'both' になる(この修正が対処する検出漏れの「修正前」挙動を記録する)", () => {
    const row = { 名称: "AIAI NURSERY　入谷", 所在地: "台東区入谷1-1-1" };
    const facility = normalizeCsvRow(row, TAITO_AGE_COLUMNS, "ds-taito-hoiku-shisetsu", "福祉ガイド", "台東区");
    expect(facility?.ageRange).toBe("both");
  });

  it("保育園名(「AIAI NURSERY　入谷」)でも fixedAgeRange='child' を渡すと inferAgeRange の結果を無視して 'child' になる(オーバーライドが機能することの確認)", () => {
    const row = { 名称: "AIAI NURSERY　入谷", 所在地: "台東区入谷1-1-1" };
    const facility = normalizeCsvRow(
      row,
      TAITO_AGE_COLUMNS,
      "ds-taito-hoiku-shisetsu",
      "福祉ガイド",
      "台東区",
      undefined,
      "child",
    );
    expect(facility?.ageRange).toBe("child");
  });

  it("「ほうらい子育てサポートセンター」は「子育て」を含むが CHILD_PATTERN は「子ども」「こども」のみを対象とし「子育て」は含まないため、fixedAgeRange 未指定では 'both' になる(この dataset の根本原因となった具体的な検出漏れの記録)", () => {
    const row = { 名称: "ほうらい子育てサポートセンター", 所在地: "台東区X" };
    const facility = normalizeCsvRow(row, TAITO_AGE_COLUMNS, "ds-taito-kodomo-katei-shien", "相談窓口", "台東区");
    expect(facility?.ageRange).toBe("both");
  });

  it("「ほうらい子育てサポートセンター」でも fixedAgeRange='child' を渡すと 'child' になる", () => {
    const row = { 名称: "ほうらい子育てサポートセンター", 所在地: "台東区X" };
    const facility = normalizeCsvRow(
      row,
      TAITO_AGE_COLUMNS,
      "ds-taito-kodomo-katei-shien",
      "相談窓口",
      "台東区",
      undefined,
      "child",
    );
    expect(facility?.ageRange).toBe("child");
  });

  it("fixedAgeRange 未指定時は、ageHint/description に明示的なキーワードがある行では従来どおり inferAgeRange の結果を使う(「未就学」→ child、回帰確認)", () => {
    const row = { 名称: "施設M", 所在地: "台東区X", 対象: "未就学児が対象" };
    const facility = normalizeCsvRow(
      row,
      { name: "名称", address: "所在地", ageHint: "対象" },
      "ds-tokyo-fukushi-shisetsu",
      "相談窓口",
    );
    expect(facility?.ageRange).toBe("child");
  });

  it("fixedAgeRange 未指定時は、「18歳以上」を含む行では従来どおり adult と推定される(回帰確認、この変更が加算的であり既存データセットの挙動を変えないことの確認)", () => {
    const row = { 名称: "施設N", 所在地: "台東区X", 対象: "18歳以上が対象" };
    const facility = normalizeCsvRow(
      row,
      { name: "名称", address: "所在地", ageHint: "対象" },
      "ds-tokyo-fukushi-shisetsu",
      "相談窓口",
    );
    expect(facility?.ageRange).toBe("adult");
  });
});

// ============================================================
// fixedContactMethods(台東区6データセット、区共通問い合わせ窓口のフォールバック、TICKET-0051)
// ============================================================

describe("normalizeCsvRow (fixedContactMethods)", () => {
  it("columns.contactMethods が未指定(マッピング自体が無い)の場合、fixedContactMethods がそのまま使われる", () => {
    const row = { 名称: "区役所", 所在地: "台東区東上野4丁目5番6号" };
    const facility = normalizeCsvRow(
      row,
      { name: "名称", address: "所在地" },
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      "区の総合問い合わせ窓口",
    );
    expect(facility?.contactMethods).toBe("区の総合問い合わせ窓口");
  });

  it("columns.contactMethods はマッピングされているが行の値が空文字の場合、fixedContactMethods にフォールバックする", () => {
    const columnsWithContactMethods: CsvColumnMap = { name: "名称", address: "所在地", contactMethods: "連絡手段" };
    const row = { 名称: "区役所", 所在地: "台東区東上野4丁目5番6号", 連絡手段: "" };
    const facility = normalizeCsvRow(
      row,
      columnsWithContactMethods,
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      "区の総合問い合わせ窓口",
    );
    expect(facility?.contactMethods).toBe("区の総合問い合わせ窓口");
  });

  it("columns.contactMethods はマッピングされているが行の値が空白のみの場合も、fixedContactMethods にフォールバックする", () => {
    const columnsWithContactMethods: CsvColumnMap = { name: "名称", address: "所在地", contactMethods: "連絡手段" };
    const row = { 名称: "区役所", 所在地: "台東区東上野4丁目5番6号", 連絡手段: "   " };
    const facility = normalizeCsvRow(
      row,
      columnsWithContactMethods,
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      "区の総合問い合わせ窓口",
    );
    expect(facility?.contactMethods).toBe("区の総合問い合わせ窓口");
  });

  it("columns.contactMethods に値がある場合は行の値が優先され、fixedContactMethods は使われない(行値が常に優先される設計の確認)", () => {
    const columnsWithContactMethods: CsvColumnMap = { name: "名称", address: "所在地", contactMethods: "連絡手段" };
    const row = { 名称: "区役所", 所在地: "台東区東上野4丁目5番6号", 連絡手段: "メール可・来所予約可" };
    const facility = normalizeCsvRow(
      row,
      columnsWithContactMethods,
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      "区の総合問い合わせ窓口",
    );
    expect(facility?.contactMethods).toBe("メール可・来所予約可");
  });

  it("columns.contactMethods も fixedContactMethods もいずれも無い場合は null になる(既存データセットの回帰確認)", () => {
    const row = { 名称: "世田谷区発達障がい相談支援センター", 所在地: "東京都世田谷区XX1-2-3" };
    const facility = normalizeCsvRow(row, { name: "名称", address: "所在地" }, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.contactMethods).toBeNull();
  });
});

describe("normalizeCsvText (fixedContactMethods 伝播)", () => {
  it("fixedContactMethods を渡すと、columns.contactMethods が無いバッチ内の全行が同じ contactMethods になる", () => {
    const csv = "名称,所在地\n区役所,台東区東上野4丁目5番6号\n分庁舎,台東区西浅草3-25-1";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地" },
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      "区の総合問い合わせ窓口",
    );
    expect(facilities).toHaveLength(2);
    expect(facilities.every((f) => f.contactMethods === "区の総合問い合わせ窓口")).toBe(true);
  });

  it("fixedContactMethods 未指定時は従来どおり columns.contactMethods 由来の行値(または null)が使われる(回帰確認)", () => {
    const csv = "名称,所在地,連絡手段\n施設P,台東区X,メール可\n施設Q,台東区Y,";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地", contactMethods: "連絡手段" },
      "ds-tokyo-fukushi-shisetsu",
      "相談窓口",
    );
    expect(facilities.find((f) => f.name === "施設P")?.contactMethods).toBe("メール可");
    expect(facilities.find((f) => f.name === "施設Q")?.contactMethods).toBeNull();
  });
});

// ============================================================
// fixedUrl(台東区6データセット、区共通問い合わせフォームURLのフォールバック、TICKET-0051)
// ============================================================

describe("normalizeCsvRow (fixedUrl)", () => {
  it("columns.url が未指定(マッピング自体が無い)の場合、fixedUrl がそのまま使われる", () => {
    const row = { 名称: "区役所", 所在地: "台東区東上野4丁目5番6号" };
    const facility = normalizeCsvRow(
      row,
      { name: "名称", address: "所在地" },
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      undefined,
      "https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html",
    );
    expect(facility?.url).toBe("https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html");
  });

  it("columns.url はマッピングされているが行の値が空文字の場合、fixedUrl にフォールバックする", () => {
    const columnsWithUrl: CsvColumnMap = { name: "名称", address: "所在地", url: "ホームページ" };
    const row = { 名称: "区役所", 所在地: "台東区東上野4丁目5番6号", ホームページ: "" };
    const facility = normalizeCsvRow(
      row,
      columnsWithUrl,
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      undefined,
      "https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html",
    );
    expect(facility?.url).toBe("https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html");
  });

  it("columns.url はマッピングされているが行の値が空白のみの場合も、fixedUrl にフォールバックする", () => {
    const columnsWithUrl: CsvColumnMap = { name: "名称", address: "所在地", url: "ホームページ" };
    const row = { 名称: "区役所", 所在地: "台東区東上野4丁目5番6号", ホームページ: "   " };
    const facility = normalizeCsvRow(
      row,
      columnsWithUrl,
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      undefined,
      "https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html",
    );
    expect(facility?.url).toBe("https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html");
  });

  it("columns.url に値がある場合は行の値が優先され、fixedUrl は使われない(行値が常に優先される設計の確認)", () => {
    const columnsWithUrl: CsvColumnMap = { name: "名称", address: "所在地", url: "ホームページ" };
    const row = { 名称: "区役所", 所在地: "台東区東上野4丁目5番6号", ホームページ: "https://example.com/taito-yakusho" };
    const facility = normalizeCsvRow(
      row,
      columnsWithUrl,
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      undefined,
      "https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html",
    );
    expect(facility?.url).toBe("https://example.com/taito-yakusho");
  });

  it("columns.url も fixedUrl もいずれも無い場合は null になる(既存データセットの回帰確認)", () => {
    const row = { 名称: "世田谷区発達障がい相談支援センター", 所在地: "東京都世田谷区XX1-2-3" };
    const facility = normalizeCsvRow(row, { name: "名称", address: "所在地" }, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.url).toBeNull();
  });
});

describe("normalizeCsvText (fixedUrl 伝播)", () => {
  it("fixedUrl を渡すと、columns.url が無いバッチ内の全行が同じ url になる", () => {
    const csv = "名称,所在地\n区役所,台東区東上野4丁目5番6号\n分庁舎,台東区西浅草3-25-1";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地" },
      "ds-taito-kuyakusho",
      "相談窓口",
      "台東区",
      "行政窓口",
      undefined,
      undefined,
      undefined,
      "https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html",
    );
    expect(facilities).toHaveLength(2);
    expect(facilities.every((f) => f.url === "https://www.city.taito.lg.jp/index/kuminnokoe/toiawaseiken/index.html")).toBe(true);
  });

  it("fixedUrl 未指定時は従来どおり columns.url 由来の行値(または null)が使われる(回帰確認)", () => {
    const csv = "名称,所在地,ホームページ\n施設P,台東区X,https://example.com/p\n施設Q,台東区Y,";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地", url: "ホームページ" },
      "ds-tokyo-fukushi-shisetsu",
      "相談窓口",
    );
    expect(facilities.find((f) => f.name === "施設P")?.url).toBe("https://example.com/p");
    expect(facilities.find((f) => f.name === "施設Q")?.url).toBeNull();
  });
});

describe("normalizeCsvText (fixedAgeRange 伝播)", () => {
  it("fixedAgeRange を渡すと、年齢の手がかりが無い名称の行も含めてバッチ内の全行が同じ ageRange になる(一部の行だけ適用されるような取りこぼしが無いことの確認)", () => {
    const csv = "名称,所在地\nAIAI NURSERY　入谷,台東区入谷1-1-1\nほうらい子育てサポートセンター,台東区X\n施設O,台東区Y";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地", ageHint: "名称" },
      "ds-taito-hoiku-shisetsu",
      "福祉ガイド",
      "台東区",
      undefined,
      "child",
    );
    expect(facilities).toHaveLength(3);
    expect(facilities.every((f) => f.ageRange === "child")).toBe(true);
  });

  it("fixedAgeRange 未指定時は従来どおり行ごとに inferAgeRange の結果が使われる(回帰確認)", () => {
    const csv = "名称,所在地,対象\n施設P,台東区X,未就学児\n施設Q,台東区Y,18歳以上";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地", ageHint: "対象" },
      "ds-tokyo-fukushi-shisetsu",
      "相談窓口",
    );
    expect(facilities.find((f) => f.name === "施設P")?.ageRange).toBe("child");
    expect(facilities.find((f) => f.name === "施設Q")?.ageRange).toBe("adult");
  });
});

// ============================================================
// resolveLifestageRange / lifestageMin・lifestageMax(migration 0016、
// 台東区「児童館・こどもクラブ」CSV(ds-taito-jidokan)・保育施設CSV(ds-taito-hoiku-shisetsu)。
// age_range の粗い区分(child/adult/both)に加え、lifestage_min/max による細分絞り込みを
// 追加する。NULL は「細分なし(従来どおり)」を意味する)
// ============================================================

describe("resolveLifestageRange", () => {
  it("サブタイプ「こどもクラブ・学童保育所」は SUBTYPE_LIFESTAGE_RANGE に一致し {min:1,max:1} を返す(fixedLifestageRange 未指定)", () => {
    expect(resolveLifestageRange("こどもクラブ・学童保育所")).toEqual({ min: 1, max: 1 });
  });

  it("サブタイプ「こどもクラブ・学童保育所」は fixedLifestageRange が渡されてもサブタイプ表を優先する(サブタイプ表が fixedLifestageRange に勝つ)", () => {
    expect(resolveLifestageRange("こどもクラブ・学童保育所", [0, 2])).toEqual({ min: 1, max: 1 });
  });

  it("サブタイプ「児童館」は SUBTYPE_LIFESTAGE_RANGE に無く、fixedLifestageRange 未指定では {min:null,max:null} になる(広範な一般来館施設のため細分しない)", () => {
    expect(resolveLifestageRange("児童館")).toEqual({ min: null, max: null });
  });

  it("サブタイプ「児童館」でも fixedLifestageRange が渡された場合はその値へフォールバックする(サブタイプ表に無い値はデータセット既定を使う)", () => {
    expect(resolveLifestageRange("児童館", [0, 2])).toEqual({ min: 0, max: 2 });
  });

  it("サブタイプ表に無い未知のサブタイプでも fixedLifestageRange が渡されればその値を使う", () => {
    expect(resolveLifestageRange("保育施設", [0, 0])).toEqual({ min: 0, max: 0 });
  });

  it("facilitySubtype が null で fixedLifestageRange も未指定の場合は {min:null,max:null}(既定、細分なし)", () => {
    expect(resolveLifestageRange(null)).toEqual({ min: null, max: null });
    expect(resolveLifestageRange(undefined)).toEqual({ min: null, max: null });
  });
});

describe("normalizeCsvRow (lifestageMin/lifestageMax, migration 0016)", () => {
  it("保育施設CSV相当(fixedLifestageRange:[0,0] を渡す)は lifestageMin/lifestageMax に 0/0 を設定する(ds-taito-hoiku-shisetsu)", () => {
    const row = { 名称: "AIAI NURSERY　入谷", 所在地: "台東区入谷1-1-1" };
    const facility = normalizeCsvRow(
      row,
      { name: "名称", address: "所在地" },
      "ds-taito-hoiku-shisetsu",
      "福祉ガイド",
      "台東区",
      undefined,
      "child",
      [0, 0],
    );
    expect(facility?.lifestageMin).toBe(0);
    expect(facility?.lifestageMax).toBe(0);
  });

  it("児童館・こどもクラブCSV相当(subtypeColumn='大分類'、fixedLifestageRange 未指定)は、大分類='こどもクラブ・学童保育所' の行で [1,1] になる(ds-taito-jidokan)", () => {
    const row = { 名称: "浅草橋こどもクラブ", 所在地: "台東区浅草橋1-1-1", 大分類: "こどもクラブ・学童保育所" };
    const facility = normalizeCsvRow(
      row,
      { name: "名称", address: "所在地", subtypeColumn: "大分類" },
      "ds-taito-jidokan",
      "福祉ガイド",
      "台東区",
      undefined,
      "child",
    );
    expect(facility?.lifestageMin).toBe(1);
    expect(facility?.lifestageMax).toBe(1);
  });

  it("児童館・こどもクラブCSV相当で、大分類='児童館' の行は [null,null] のまま(一般来館施設のため細分しない)", () => {
    const row = { 名称: "浅草橋児童館", 所在地: "台東区浅草橋2-2-2", 大分類: "児童館" };
    const facility = normalizeCsvRow(
      row,
      { name: "名称", address: "所在地", subtypeColumn: "大分類" },
      "ds-taito-jidokan",
      "福祉ガイド",
      "台東区",
      undefined,
      "child",
    );
    expect(facility?.lifestageMin).toBeNull();
    expect(facility?.lifestageMax).toBeNull();
  });

  it("サブタイプ一致・fixedLifestageRange いずれも無いデータセットは lifestageMin/lifestageMax とも null になる(既存データセットの回帰確認)", () => {
    const row = { 名称: "世田谷区発達障がい相談支援センター", 所在地: "東京都世田谷区XX1-2-3" };
    const facility = normalizeCsvRow(row, { name: "名称", address: "所在地" }, "ds-tokyo-fukushi-shisetsu", "相談窓口");
    expect(facility?.lifestageMin).toBeNull();
    expect(facility?.lifestageMax).toBeNull();
  });
});

describe("normalizeCsvText (lifestageMin/lifestageMax 伝播、migration 0016)", () => {
  it("fixedLifestageRange を渡すとバッチ内の全行が同じ lifestageMin/lifestageMax になる(ds-taito-hoiku-shisetsu 相当)", () => {
    const csv = "名称,所在地\nAIAI NURSERY　入谷,台東区入谷1-1-1\n施設R,台東区X";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地" },
      "ds-taito-hoiku-shisetsu",
      "福祉ガイド",
      "台東区",
      undefined,
      "child",
      [0, 0],
    );
    expect(facilities).toHaveLength(2);
    expect(facilities.every((f) => f.lifestageMin === 0 && f.lifestageMax === 0)).toBe(true);
  });

  it("subtypeColumn 経由で行ごとに異なる lifestageMin/lifestageMax が設定される(ds-taito-jidokan 相当、大分類の値ごとにサブタイプ表と照合)", () => {
    const csv = "名称,所在地,大分類\n浅草橋こどもクラブ,台東区浅草橋1-1-1,こどもクラブ・学童保育所\n浅草橋児童館,台東区浅草橋2-2-2,児童館";
    const facilities = normalizeCsvText(
      csv,
      { name: "名称", address: "所在地", subtypeColumn: "大分類" },
      "ds-taito-jidokan",
      "福祉ガイド",
      "台東区",
      undefined,
      "child",
    );
    expect(facilities).toHaveLength(2);
    const club = facilities.find((f) => f.name === "浅草橋こどもクラブ");
    const hall = facilities.find((f) => f.name === "浅草橋児童館");
    expect(club?.lifestageMin).toBe(1);
    expect(club?.lifestageMax).toBe(1);
    expect(hall?.lifestageMin).toBeNull();
    expect(hall?.lifestageMax).toBeNull();
  });
});
