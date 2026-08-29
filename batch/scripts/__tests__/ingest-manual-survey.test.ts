// scripts/data/ingest-manual-survey.mjs の純関数部分のテスト。
//
// このファイルは data/manual/**.yaml を D1 へ投入する CLI スクリプトだが、
// main() は直接実行されたときのみ起動するようガードされている(import 時の副作用なし)ため、
// buildSql / CATEGORY_TYPES / isPhoneNumber / idFor を通常の ESM import でテストできる。
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { assertSurvey, buildSql, CATEGORY_TYPES, geocodeSurvey, idFor, isPhoneNumber, LIFESTAGE_ORDINAL, main, parseCliArgs } from "../ingest-manual-survey.mjs";
import { CATEGORY_TYPES as APP_CATEGORY_TYPES } from "../../../app/src/features/support/constants/category-types";
import { LIFESTAGE_ORDINAL as APP_LIFESTAGE_ORDINAL } from "../../../app/src/features/support/services/lifestage-mapping";

describe("CATEGORY_TYPES(programカテゴリ → facilities.category_typeのマッピング)", () => {
  it("9つのprogramカテゴリすべてが定義されている", () => {
    expect(Object.keys(CATEGORY_TYPES).sort()).toEqual(
      [
        "school_consultation",
        "counseling",
        "day_service_directory",
        "medical_expense_subsidy",
        "housing_support",
        "high_school_pathway",
        "ict_environment",
        "special_needs_school_zoning",
        "other",
      ].sort(),
    );
  });

  it("マッピング先の値はすべて facilities.category_type の4分類(CATEGORY_TYPES定数)のいずれかである", () => {
    for (const value of Object.values(CATEGORY_TYPES)) {
      expect(APP_CATEGORY_TYPES).toContain(value);
    }
  });

  it("相談系(school_consultation, counseling)は「相談窓口」に写像する", () => {
    expect(CATEGORY_TYPES.school_consultation).toBe("相談窓口");
    expect(CATEGORY_TYPES.counseling).toBe("相談窓口");
  });

  it("制度系(medical_expense_subsidy, housing_support)は「支援制度」に写像する", () => {
    expect(CATEGORY_TYPES.medical_expense_subsidy).toBe("支援制度");
    expect(CATEGORY_TYPES.housing_support).toBe("支援制度");
  });

  it("ガイド系(day_service_directory, high_school_pathway, ict_environment, special_needs_school_zoning, other)は「福祉ガイド」に写像する", () => {
    expect(CATEGORY_TYPES.day_service_directory).toBe("福祉ガイド");
    expect(CATEGORY_TYPES.high_school_pathway).toBe("福祉ガイド");
    expect(CATEGORY_TYPES.ict_environment).toBe("福祉ガイド");
    expect(CATEGORY_TYPES.special_needs_school_zoning).toBe("福祉ガイド");
    expect(CATEGORY_TYPES.other).toBe("福祉ガイド");
  });
});

// 2026-08是正(外部コードレビュー指摘): ingest-manual-survey.mjs は Node が .ts を直接
// import できないため LIFESTAGE_ORDINAL を再定義している(CATEGORY_TYPES と同じ事情)。
// 値・並び順が app/src 側の正本とずれるとfacilities.lifestage_min/maxの検索結果が壊れるため、
// パリティテストで一致を担保する。
describe("LIFESTAGE_ORDINAL(app/src/features/support/services/lifestage-mapping.ts とのパリティ)", () => {
  it("app/src 側の LIFESTAGE_ORDINAL と完全に一致する", () => {
    expect(LIFESTAGE_ORDINAL).toEqual(APP_LIFESTAGE_ORDINAL);
  });
});

describe("isPhoneNumber", () => {
  it("数字・ハイフンのみの電話番号は true", () => {
    expect(isPhoneNumber("03-1234-5678")).toBe(true);
  });

  it("括弧・全角ハイフン(－/ー)・+ を含んでいても数字があれば true", () => {
    expect(isPhoneNumber("(03)1234-5678")).toBe(true);
    expect(isPhoneNumber("03－1234－5678")).toBe(true);
    expect(isPhoneNumber("03ー1234ー5678")).toBe(true);
    expect(isPhoneNumber("+81 3 1234 5678")).toBe(true);
  });

  it("数字を含まない文字列は false", () => {
    expect(isPhoneNumber("窓口へお問い合わせください")).toBe(false);
  });

  it("メールアドレスのように数字以外の記号(@, .)や英字を含む文字列は false", () => {
    expect(isPhoneNumber("info@example.com")).toBe(false);
  });

  it("電話番号に日本語の補足(担当者名等)が併記されている場合は false(数字・記号のみの判定のため)", () => {
    expect(isPhoneNumber("03-1234-5678(担当:山田)")).toBe(false);
  });
});

describe("idFor(IDの安定性)", () => {
  it("同じ入力からは常に同じIDを生成する(冪等な再取込のため)", () => {
    const first = idFor("13106", "elementary", "上野小学校");
    const second = idFor("13106", "elementary", "上野小学校");
    expect(first).toBe(second);
  });

  it("引数のいずれか1つでも異なれば異なるIDになる", () => {
    const base = idFor("13106", "elementary", "上野小学校");
    expect(idFor("13106", "elementary", "平成小学校")).not.toBe(base);
    expect(idFor("13106", "junior_high", "上野小学校")).not.toBe(base);
    expect(idFor("13107", "elementary", "上野小学校")).not.toBe(base);
  });

  it("先頭のprefix(parts[0])をID先頭に含む(可読性のため)", () => {
    expect(idFor("13106", "elementary", "上野小学校").startsWith("13106-")).toBe(true);
  });

  it("引数を`\\u001f`のような区切り文字なしで単純結合した場合に衝突しうる入力でも、区切り文字により異なるIDになる(結合時の曖昧さ回避)", () => {
    // "ab" + "c" と "a" + "bc" は単純な文字列連結だと同じ "abc" になるが、
    // idFor は非表示制御文字(U+001F)区切りで join するため異なるIDになる。
    expect(idFor("ab", "c")).not.toBe(idFor("a", "bc"));
  });
});

describe("buildSql", () => {
  const baseSurvey = {
    municipalityCode: "13106",
    municipalityName: "台東区",
    surveyDate: "2026-07-13",
    population: 217717,
    households: 139018,
    representativeStations: ["JR上野駅"],
    elementarySchools: [
      {
        name: "上野小学校",
        level: "elementary",
        areaHint: "東上野",
        fixedClasses: [
          {
            disabilityType: "intellectual",
            className: "たけのこ学級",
            classCount: 2,
            capacity: 16,
            status: "confirmed",
            note: "備考",
          },
        ],
        resourceRoom: {
          hasResourceRoom: true,
          isHubSchool: true,
          groupName: "すずかけ教室",
        },
        sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
      },
    ],
    juniorHighSchools: [],
    highSchoolPathways: [
      {
        name: "チャレンジスクールA",
        pathwayType: "challenge_school",
        commuteRating: "excellent",
        estimatedCommuteMinutes: 20,
        sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
      },
    ],
    classOrganization: [
      { level: "elementary", judgement: "separate", rationale: "テスト根拠" },
    ],
    specialNeedsSchools: [],
    limitations: ["未確認事項あり"],
    programs: [
      { name: "電話相談窓口", category: "school_consultation", description: "説明1", contact: "03-1234-5678" },
      { name: "メール相談窓口", category: "counseling", description: "説明2", contact: "info@example.com" },
      { name: "未分類の制度", category: "unknown_category", description: "説明3" },
    ],
  };

  it("PRAGMAで始まる(D1リモートが明示的なBEGIN TRANSACTIONを許可しないため含めない)", () => {
    const sql = buildSql(baseSurvey);
    expect(sql.startsWith("PRAGMA foreign_keys = ON;\n")).toBe(true);
    expect(sql).not.toContain("BEGIN TRANSACTION");
    expect(sql).not.toContain("COMMIT;");
  });

  it("prefectureが東京都以外でも例外を投げずINSERTを含むSQLを生成する", () => {
    const nonTokyoSurvey = {
      ...baseSurvey,
      prefecture: "大阪府",
      municipalityCode: "27100",
      municipalityName: "大阪市",
    };

    expect(() => buildSql(nonTokyoSurvey)).not.toThrow();
    expect(buildSql(nonTokyoSurvey)).toContain("INSERT INTO schools");
  });

  it("同名の府中市を別の自治体コードで再取込すると、削除とメタ情報UPSERTは自治体コードをキーにするため両者は衝突しない", () => {
    const tokyoFuchuSurvey = {
      ...baseSurvey,
      municipalityName: "府中市",
      municipalityCode: "13206",
      elementarySchools: [{ name: "東京都府中市立小学校", level: "elementary" }],
      programs: [],
    };
    const hiroshimaFuchuSurvey = {
      ...baseSurvey,
      municipalityName: "府中市",
      municipalityCode: "34207",
      elementarySchools: [{ name: "広島県府中市立小学校", level: "elementary" }],
      programs: [],
    };

    const tokyoSql = buildSql(tokyoFuchuSurvey);
    const hiroshimaSql = buildSql(hiroshimaFuchuSurvey);
    const deleteLines = (sql: string) => sql.split("\n").filter((line) => line.startsWith("DELETE FROM"));
    const metaUpsert = (sql: string) => sql.split("\n").find((line) => line.startsWith("INSERT INTO municipality_survey_meta"));

    const tokyoDeletes = deleteLines(tokyoSql).filter((line) => line.includes("municipality_code"));
    const hiroshimaDeletes = deleteLines(hiroshimaSql).filter((line) => line.includes("municipality_code"));

    expect(tokyoDeletes).toContain("DELETE FROM schools WHERE municipality_code = '13206';");
    expect(hiroshimaDeletes).toContain("DELETE FROM schools WHERE municipality_code = '34207';");
    expect(tokyoDeletes).toContain("DELETE FROM municipality_survey_meta WHERE municipality_code = '13206';");
    expect(hiroshimaDeletes).toContain("DELETE FROM municipality_survey_meta WHERE municipality_code = '34207';");

    expect(metaUpsert(tokyoSql)).toContain("ON CONFLICT(municipality_code) DO UPDATE SET");
    expect(metaUpsert(tokyoSql)).toContain("municipality = excluded.municipality");

    expect(tokyoDeletes).not.toEqual(hiroshimaDeletes);
    expect(tokyoSql).toContain("'13206'");
    expect(hiroshimaSql).toContain("'34207'");
  });

  it("冪等な再取込のため、対象自治体の子テーブルから親テーブルの順にDELETEする(facility_tagsはfacilitiesより先に削除する、外部キー制約対策)", () => {
    const sql = buildSql(baseSurvey);
    const deleteLines = sql.split("\n").filter((line) => line.startsWith("DELETE FROM"));
    expect(deleteLines).toEqual([
      "DELETE FROM school_fixed_classes WHERE school_id IN (SELECT id FROM schools WHERE municipality_code = '13106');",
      "DELETE FROM school_resource_rooms WHERE school_id IN (SELECT id FROM schools WHERE municipality_code = '13106');",
      "DELETE FROM schools WHERE municipality_code = '13106';",
      "DELETE FROM high_school_pathways WHERE municipality_code = '13106';",
      "DELETE FROM class_organizations WHERE municipality_code = '13106';",
      "DELETE FROM special_needs_schools WHERE municipality_code = '13106';",
      "DELETE FROM support_pathway_steps WHERE pathway_id IN (SELECT id FROM support_pathways WHERE municipality_code = '13106');",
      "DELETE FROM support_pathways WHERE municipality_code = '13106';",
      "DELETE FROM results_guide_notes WHERE municipality_code = '13106';",
      "DELETE FROM municipality_survey_meta WHERE municipality_code = '13106';",
      "DELETE FROM facility_tags WHERE facility_id IN (SELECT id FROM facilities WHERE dataset_id = 'ds-13106-manual-survey-programs');",
      "DELETE FROM facilities WHERE dataset_id = 'ds-13106-manual-survey-programs';",
      "DELETE FROM datasets WHERE id = 'ds-13106-manual-survey-programs';",
    ]);
  });

  // 2026-08是正(外部コードレビュー指摘): facility_tags は本スクリプトが一切関知しない
  // 手動キュレーションデータ(consultation-desk-tags*.sql投入)のため、削除前に退避し、
  // 同じidで再投入されたプログラムにのみ復元する。data-governance.mdの「削除したタグの
  // 自動復元機能は無い」という既知の制約を、少なくとも本スクリプト経由の再取込については解消する。
  // D1 は CREATE TEMP TABLE を許可しない(実機確認済み、SQLITE_AUTH)ため、通常の
  // CREATE TABLE ... AS SELECT + 末尾 DROP TABLE を使う(自己修復のため冒頭に
  // DROP TABLE IF EXISTS も置く)。
  it("再取込時、facility_tagsを削除前にステージングテーブルへ退避し、facilities再投入後に復元する", () => {
    const sql = buildSql(baseSurvey);
    const lines = sql.split("\n").filter((line) => line.length > 0);

    const dropIfExistsIndex = lines.indexOf("DROP TABLE IF EXISTS _facility_tags_backup;");
    const backupIndex = lines.indexOf(
      "CREATE TABLE _facility_tags_backup AS SELECT facility_id, tag FROM facility_tags WHERE facility_id IN (SELECT id FROM facilities WHERE dataset_id = 'ds-13106-manual-survey-programs');",
    );
    const deleteTagsIndex = lines.findIndex((line) => line.startsWith("DELETE FROM facility_tags"));
    const lastFacilityInsertIndex = lines.map((line) => line.startsWith("INSERT INTO facilities")).lastIndexOf(true);
    const restoreIndex = lines.indexOf(
      "INSERT INTO facility_tags (facility_id, tag) SELECT facility_id, tag FROM _facility_tags_backup WHERE facility_id IN (SELECT id FROM facilities);",
    );
    const dropIndex = lines.indexOf("DROP TABLE _facility_tags_backup;");

    // 自己修復DROP → 退避 → 削除 → (facilities再投入) → 復元 → ステージングテーブル破棄、の順序。
    expect(dropIfExistsIndex).toBeGreaterThanOrEqual(0);
    expect(backupIndex).toBeGreaterThan(dropIfExistsIndex);
    expect(deleteTagsIndex).toBeGreaterThan(backupIndex);
    expect(restoreIndex).toBeGreaterThan(lastFacilityInsertIndex);
    expect(dropIndex).toBe(restoreIndex + 1);
  });

  it("学校1件につき schools への INSERT を1件生成する", () => {
    const sql = buildSql(baseSurvey);
    expect(sql).toContain("INSERT INTO schools");
    expect(sql).toContain("'上野小学校'");
  });

  it("固定級(fixedClasses)は school_fixed_classes への INSERT になる", () => {
    const sql = buildSql(baseSurvey);
    expect(sql).toContain("INSERT INTO school_fixed_classes");
    expect(sql).toContain("'たけのこ学級'");
  });

  it("特別支援教室(resourceRoom)は school_resource_rooms への INSERT になる", () => {
    const sql = buildSql(baseSurvey);
    expect(sql).toContain("INSERT INTO school_resource_rooms");
    expect(sql).toContain("'すずかけ教室'");
  });

  it("高校進学先(highSchoolPathways)は high_school_pathways への INSERT になる", () => {
    const sql = buildSql(baseSurvey);
    expect(sql).toContain("INSERT INTO high_school_pathways");
    expect(sql).toContain("'チャレンジスクールA'");
  });

  it("学級編制判定(classOrganization)は class_organizations への INSERT になる", () => {
    const sql = buildSql(baseSurvey);
    expect(sql).toContain("INSERT INTO class_organizations");
    expect(sql).toContain("'テスト根拠'");
  });

  it("自治体調査メタ情報(municipality_survey_meta)はON CONFLICTでUPSERTする", () => {
    const sql = buildSql(baseSurvey);
    expect(sql).toContain("INSERT INTO municipality_survey_meta");
    expect(sql).toContain("ON CONFLICT(municipality_code) DO UPDATE SET");
  });

  it("datasets へprograms由来facilities用のデータセット行(license=manual-fact-verified, risk_level=low)をINSERTする", () => {
    const sql = buildSql(baseSurvey);
    expect(sql).toContain("INSERT INTO datasets");
    expect(sql).toContain("'ds-13106-manual-survey-programs'");
    expect(sql).toContain("'manual-fact-verified'");
    expect(sql).toContain("'low'");
  });

  it("programsはfacilitiesへ変換され、categoryはCATEGORY_TYPESでcategory_typeへ写像される", () => {
    const sql = buildSql(baseSurvey);
    expect(sql).toContain("INSERT INTO facilities");
    expect(sql).toContain("'電話相談窓口'");
    expect(sql).toContain("'相談窓口'"); // school_consultation → 相談窓口
  });

  it("programのaddress/lat/lngはfacilitiesのaddress/lat/lng列にそのまま渡される", () => {
    const sql = buildSql({
      ...baseSurvey,
      programs: [
        { name: "電話相談窓口", category: "school_consultation", description: "説明1", contact: "03-1234-5678", address: "東京都台東区東上野4-5-6", lat: 35.6, lng: 139.7 },
      ],
    });
    const facilitiesLine = sql.split("\n").find((line) => line.startsWith("INSERT INTO facilities") && line.includes("'電話相談窓口'"));
    expect(facilitiesLine).toContain("'東京都台東区東上野4-5-6'");
    expect(facilitiesLine).toContain("35.6, 139.7");
  });

  it("未知のcategory値はCATEGORY_TYPES.other(福祉ガイド)にフォールバックする", () => {
    const sql = buildSql(baseSurvey);
    const facilitiesInsertLines = sql
      .split("\n")
      .filter((line) => line.startsWith("INSERT INTO facilities") && line.includes("'未分類の制度'"));
    expect(facilitiesInsertLines).toHaveLength(1);
    expect(facilitiesInsertLines[0]).toContain("'福祉ガイド'");
  });

  it("contactが電話番号形式ならphoneに、それ以外(メール等)ならcontact_methodsに振り分ける", () => {
    const sql = buildSql(baseSurvey);
    const lines = sql.split("\n").filter((line) => line.startsWith("INSERT INTO facilities"));
    const phoneLine = lines.find((line) => line.includes("'電話相談窓口'"));
    const emailLine = lines.find((line) => line.includes("'メール相談窓口'"));
    // facilities のカラム順: id, dataset_id, name, category_type, municipality, address, phone,
    // age_range, is_medical, description, contact_methods, raw_json
    expect(phoneLine).toContain("'03-1234-5678'");
    expect(emailLine).toContain("'info@example.com'");
  });

  it("すべてのfacilitiesはis_medical=0・age_range='both'で投入される(programsは医療機関ではないため)", () => {
    const sql = buildSql(baseSurvey);
    const lines = sql.split("\n").filter((line) => line.startsWith("INSERT INTO facilities"));
    for (const line of lines) {
      expect(line).toContain("'both'");
    }
  });

  it("同一の入力から常に同じSQLを生成する(冪等・決定的)", () => {
    const first = buildSql(baseSurvey);
    const second = buildSql(baseSurvey);
    expect(first).toBe(second);
  });

  // 2026-08是正(外部コードレビュー指摘 P0-4回帰確認): programのIDが配列indexに依存していたため、
  // 内容が変わっていないprogramでも、他のprogramの並べ替え・追加・削除・コメントアウトだけで
  // IDが変わり、facility_tags の手動キュレーションが指すIDが静かに失効していた。
  it("programの並べ替え(内容は同じ)ではfacility IDが変わらない(配列indexに依存しない)", () => {
    const programA = { name: "電話相談窓口", category: "school_consultation", description: "説明1", contact: "03-1234-5678", address: "東京都台東区東上野4-5-6" };
    const programB = { name: "メール相談窓口", category: "counseling", description: "説明2", contact: "info@example.com" };

    const sqlOriginalOrder = buildSql({ ...baseSurvey, programs: [programA, programB] });
    const sqlReversedOrder = buildSql({ ...baseSurvey, programs: [programB, programA] });

    const extractFacilityId = (sql, name) => {
      const line = sql.split("\n").find((l) => l.startsWith("INSERT INTO facilities") && l.includes(`'${name}'`));
      return line.match(/VALUES \('([^']+)'/)[1];
    };

    expect(extractFacilityId(sqlOriginalOrder, "電話相談窓口")).toBe(extractFacilityId(sqlReversedOrder, "電話相談窓口"));
    expect(extractFacilityId(sqlOriginalOrder, "メール相談窓口")).toBe(extractFacilityId(sqlReversedOrder, "メール相談窓口"));
  });

  it("前方のprogramが削除・コメントアウトされても、内容が変わっていない後方のprogramのIDは変わらない", () => {
    const programA = { name: "電話相談窓口", category: "school_consultation", description: "説明1", contact: "03-1234-5678", address: "東京都台東区東上野4-5-6" };
    const programB = { name: "メール相談窓口", category: "counseling", description: "説明2", contact: "info@example.com" };

    const sqlWithBoth = buildSql({ ...baseSurvey, programs: [programA, programB] });
    const sqlWithoutFirst = buildSql({ ...baseSurvey, programs: [programB] });

    const extractFacilityId = (sql, name) => {
      const line = sql.split("\n").find((l) => l.startsWith("INSERT INTO facilities") && l.includes(`'${name}'`));
      return line.match(/VALUES \('([^']+)'/)[1];
    };

    expect(extractFacilityId(sqlWithBoth, "メール相談窓口")).toBe(extractFacilityId(sqlWithoutFirst, "メール相談窓口"));
  });

  it("programsが空配列でもdatasets行は常にINSERTするが、facilitiesへのINSERTは生成しない", () => {
    const sql = buildSql({ ...baseSurvey, programs: [] });
    expect(sql).not.toContain("INSERT INTO facilities");
    // datasets 行自体は programs の有無に関わらず(将来 programs が追加された際の
    // dataset_id 参照整合性のため)常に1件INSERTされる。
    expect(sql).toContain("INSERT INTO datasets");
  });
});

/** `INSERT INTO facilities (col1, col2, ...) VALUES (v1, v2, ...);` を列名→値(文字列のまま)の
 *  Mapへ変換する(no-diagnosis-facilities-seed.test.ts と同じ方針、値にカンマ・カッコを
 *  含まないテストフィクスチャ限定の簡易パーサ)。 */
function parseFacilitiesInsertLine(line) {
  const match = line.match(/^INSERT INTO facilities \(([^)]+)\) VALUES \((.+)\);$/);
  if (!match) throw new Error(`facilities INSERT文の形式が想定と異なります: ${line}`);
  const columns = match[1].split(", ");
  const values = match[2].split(", ");
  return new Map(columns.map((column, index) => [column, values[index]]));
}

// 2026-08是正(外部コードレビュー指摘: 手動調査プログラムの対象年齢・確認状態が検索へ
// 反映されない、スキーマ・投入処理の土台のみ)。
describe("buildSql: program.ageRange/lifestageMin/lifestageMax/status/confirmedOn", () => {
  const surveyBase = {
    municipalityCode: "13101",
    municipalityName: "千代田区",
    surveyDate: "2026-07-13",
    elementarySchools: [],
    juniorHighSchools: [],
  };

  it("未指定の場合、従来どおり age_range='both'・lifestage_min/max=NULL・confirmation_status='confirmed'・confirmed_on=NULL で投入される(既存YAML互換)", () => {
    const sql = buildSql({
      ...surveyBase,
      programs: [{ name: "テスト窓口", category: "counseling", description: "説明" }],
    });
    const line = sql.split("\n").find((l) => l.startsWith("INSERT INTO facilities"));
    const row = parseFacilitiesInsertLine(line);

    expect(row.get("age_range")).toBe("'both'");
    expect(row.get("lifestage_min")).toBe("NULL");
    expect(row.get("lifestage_max")).toBe("NULL");
    expect(row.get("confirmation_status")).toBe("'confirmed'");
    expect(row.get("confirmed_on")).toBe("NULL");
  });

  it("指定した場合、ageRange・lifestageMin/Maxの序数・status・confirmedOnがそのまま投入される", () => {
    const sql = buildSql({
      ...surveyBase,
      programs: [
        {
          name: "テスト窓口2",
          category: "counseling",
          description: "説明",
          ageRange: "adult",
          lifestageMin: "high-school",
          lifestageMax: "working-adult",
          status: "unconfirmed",
          confirmedOn: "2026-08-29",
        },
      ],
    });
    const line = sql.split("\n").find((l) => l.startsWith("INSERT INTO facilities"));
    const row = parseFacilitiesInsertLine(line);

    expect(row.get("age_range")).toBe("'adult'");
    expect(row.get("lifestage_min")).toBe(String(LIFESTAGE_ORDINAL["high-school"]));
    expect(row.get("lifestage_max")).toBe(String(LIFESTAGE_ORDINAL["working-adult"]));
    expect(row.get("confirmation_status")).toBe("'unconfirmed'");
    expect(row.get("confirmed_on")).toBe("'2026-08-29'");
  });
});

describe("buildSql: municipality_code(全国版移行 Phase 1)", () => {
  const baseSurvey = {
    municipalityCode: "13106", municipalityName: "台東区", surveyDate: "2026-07-13",
    elementarySchools: [{ name: "上野小学校", level: "elementary" }], juniorHighSchools: [],
    highSchoolPathways: [{ name: "チャレンジスクールA", pathwayType: "challenge_school", sources: [] }],
    classOrganization: [{ level: "elementary", judgement: "separate", rationale: "テスト根拠" }],
    specialNeedsSchools: [{ name: "テスト特別支援学校", disabilityTypes: ["intellectual"], levels: ["elementary"], sources: [] }],
    supportPathways: [{ purposeId: "test-purpose", purposeLabel: "テスト目的", lifestages: ["preschool"], sources: [], steps: [{ order: 1, title: "テスト手順", isConditional: false }] }],
    resultsGuideNotes: [{ tab: "consult", body: ["テスト本文"], sources: [] }],
    limitations: [], programs: [{ name: "電話相談窓口", category: "school_consultation", description: "説明1", contact: "03-1234-5678" }],
  };

  it("各自治体別INSERTに municipality_code(=survey.municipalityCode)を含む", () => {
    const sql = buildSql(baseSurvey);
    const insertLinesFor = (table: string) => sql.split("\n").filter((line) => line.startsWith(`INSERT INTO ${table} `));
    for (const table of ["schools", "high_school_pathways", "class_organizations", "special_needs_schools", "support_pathways", "results_guide_notes", "facilities"]) {
      const lines = insertLinesFor(table);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toContain("municipality_code");
        expect(line).toContain("'13106'");
      }
    }
  });
});

describe("assertSurvey", () => {
  it("municipalityCode が5桁の数字でない場合は例外を投げる", () => {
    expect(() => assertSurvey({ municipalityCode: "1310", municipalityName: "台東区", surveyDate: "2026-07-13" })).toThrow();
    expect(() => assertSurvey({ municipalityCode: "abcde", municipalityName: "台東区", surveyDate: "2026-07-13" })).toThrow();
  });
  it("municipalityCode が5桁の数字であれば例外を投げない", () => {
    expect(() => assertSurvey({ municipalityCode: "13106", municipalityName: "台東区", surveyDate: "2026-07-13" })).not.toThrow();
  });
  it("必須フィールドが欠けている場合は例外を投げる(既存の回帰確認)", () => {
    expect(() => assertSurvey({ municipalityCode: "13106", municipalityName: "台東区" })).toThrow();
  });
});

describe("main: license_research_only", () => {
  it("SQL生成・D1投入を行わず、スキップメッセージを出力して正常終了する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trait-compass-license-research-only-"));
    const inputPath = join(directory, "skeleton.yaml");
    const survey = {
      municipalityCode: "13106",
      municipalityName: "台東区",
      prefecture: "東京都",
      surveyDate: "2026-08-10",
      surveyStatus: "license_research_only",
      licenseAudit: {
        auditedOn: "2026-08-10",
        schoolClassData: "permission_pending",
        consultationWindowData: "permission_pending",
        zoningData: "not_applicable",
        highSchoolData: "not_applicable",
      },
      elementarySchools: [],
      juniorHighSchools: [],
      programs: [],
      classOrganization: [],
      highSchoolPathways: [],
      specialNeedsSchools: [],
      supportPathways: [],
      resultsGuideNotes: [],
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await writeFile(inputPath, JSON.stringify(survey), "utf8");
      await expect(main([inputPath])).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith("スキップ: 13106 はライセンス調査のみのため投入対象外です(surveyStatus=license_research_only)。");
    } finally {
      log.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("buildSql: licenseAudit投入ゲーティング", () => {
  const survey = {
    municipalityCode: "13106", municipalityName: "台東区", surveyDate: "2026-07-13",
    licenseAudit: { auditedOn: "2026-08-10", schoolClassData: "permission_pending", consultationWindowData: "permission_pending", zoningData: "tokyo_restricted", highSchoolData: "permission_pending" },
    elementarySchools: [{ name: "上野小学校", level: "elementary", fixedClasses: [{ disabilityType: "intellectual", className: "固定級" }], resourceRoom: { hasResourceRoom: true } }],
    highSchoolPathways: [{ name: "都立高校", pathwayType: "challenge_school" }],
    classOrganization: [{ level: "elementary", judgement: "separate", rationale: "固定級の学級数" }],
    schoolBoundaryFlexibility: { approvalCriteria: ["固定級在籍"] },
    hazardMap: { evacuationPolicyNote: "避難方針" },
    specialNeedsSchools: [{ name: "都立学校", disabilityTypes: ["intellectual"], zoningNote: "都立通学区域" }],
    programs: [
      { name: "相談窓口", category: "school_consultation" },
      { name: "都立通学区域案内", category: "special_needs_school_zoning" },
    ],
    supportPathways: [{ purposeId: "consult", purposeLabel: "相談", lifestages: ["preschool"], steps: [{ order: 1, title: "相談" }] }],
    resultsGuideNotes: [{ tab: "相談窓口", body: ["補足"] }],
  };

  it("制限されたschoolClassDataは学級INSERTだけ除外し、schools本体は残す", () => {
    const sql = buildSql(survey);
    expect(sql).toContain("INSERT INTO schools");
    expect(sql).not.toContain("INSERT INTO school_fixed_classes");
    expect(sql).not.toContain("INSERT INTO school_resource_rooms");
    expect(sql).not.toContain("INSERT INTO class_organizations");
  });

  it("制限されたhighSchoolDataはhigh_school_pathwaysのINSERTを除外する", () => {
    const sql = buildSql(survey);
    expect(sql).not.toContain("INSERT INTO high_school_pathways");
  });

  it("制限されたconsultationWindowDataはprograms・想定ルート・ガイドを除外する", () => {
    const sql = buildSql(survey);
    expect(sql).not.toContain("'相談窓口'");
    expect(sql).not.toContain("INSERT INTO support_pathways");
    expect(sql).not.toContain("INSERT INTO support_pathway_steps");
    expect(sql).not.toContain("INSERT INTO results_guide_notes");
    const metaLine = sql.split("\n").find((line) => line.startsWith("INSERT INTO municipality_survey_meta"));
    expect(metaLine).toMatch(/, NULL, NULL, '\[.*\]', '\{.*\}'\) ON CONFLICT/);
  });

  it("license_audit_jsonはincludeX系フラグに関わらず常にauditの4ステータスを保持する(除外理由の表示に使うメタ情報のため)", () => {
    const sql = buildSql(survey);
    const metaLine = sql.split("\n").find((line) => line.startsWith("INSERT INTO municipality_survey_meta"));
    expect(metaLine).toContain(
      `'${JSON.stringify({ schoolClassData: "permission_pending", consultationWindowData: "permission_pending", zoningData: "tokyo_restricted", highSchoolData: "permission_pending" })}'`,
    );
  });

  it("制限されたzoningDataはzoning_noteをNULLにし、zoning programを除外する", () => {
    const sql = buildSql(survey);
    const schoolLine = sql.split("\n").find((line) => line.startsWith("INSERT INTO special_needs_schools"));
    expect(schoolLine).toContain("NULL");
    expect(sql).not.toContain("'都立通学区域案内'");
  });

  it("includeRestrictedなら制限セクションも通常どおり生成する", () => {
    const sql = buildSql(survey, { includeRestricted: true });
    expect(sql).toContain("INSERT INTO school_fixed_classes");
    expect(sql).toContain("INSERT INTO school_resource_rooms");
    expect(sql).toContain("INSERT INTO class_organizations");
    expect(sql).toContain("INSERT INTO high_school_pathways");
    expect(sql).toContain("INSERT INTO support_pathways");
    expect(sql).toContain("INSERT INTO results_guide_notes");
    expect(sql).toContain("'相談窓口'");
    expect(sql).toContain("'都立通学区域案内'");
    expect(sql).toContain("'都立通学区域'");
    expect(sql).toContain("'{\"approvalCriteria\":[\"固定級在籍\"]}'");
    expect(sql).toContain("'{\"evacuationPolicyNote\":\"避難方針\"}'");
  });
});

describe("parseCliArgs", () => {
  it("--remoteと--include-restrictedの併用を拒否する", () => {
    expect(() => parseCliArgs(["survey.yaml", "--remote", "--include-restricted"])).toThrow("--remoteでは--include-restrictedを使用できません");
  });
});

describe("geocodeSurvey", () => {
  const survey = (): {
    municipalityCode: string;
    municipalityName: string;
    surveyDate: string;
    elementarySchools: Array<{ name: string; address?: string; lat?: number; lng?: number }>;
    juniorHighSchools: Array<{ name: string; address?: string; lat?: number; lng?: number }>;
  } => ({
    municipalityCode: "13106",
    municipalityName: "台東区",
    surveyDate: "2026-07-13",
    elementarySchools: [{ name: "小学校A", address: "東京都台東区A" }],
    juniorHighSchools: [{ name: "中学校A", address: "東京都台東区B" }],
  });
  const successfulFetch = vi.fn(async () => new Response(JSON.stringify([{ geometry: { coordinates: [139.7, 35.6] } }]), { status: 200 }));

  it("小中学校の座標未設定エントリを補完する", async () => {
    const result = await geocodeSurvey(survey(), { fetchImpl: successfulFetch as unknown as typeof fetch, sleepImpl: vi.fn(async () => {}) });
    expect(result.elementarySchools[0]).toMatchObject({ lat: 35.6, lng: 139.7 });
    expect(result.juniorHighSchools[0]).toMatchObject({ lat: 35.6, lng: 139.7 });
  });
  it("既存座標と住所なしのエントリはスキップして保持する", async () => {
    const input = survey();
    input.elementarySchools = [{ name: "既存", address: "東京都", lat: 1, lng: 2 }, { name: "住所なし" }];
    input.juniorHighSchools = [];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ geometry: { coordinates: [139.7, 35.6] } }]), { status: 200 }));
    const result = await geocodeSurvey(input, { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: vi.fn(async () => {}) });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.elementarySchools).toEqual(input.elementarySchools);
  });
  it("空のGSI応答またはfetch失敗時は座標を補完せず例外を投げない", async () => {
    const input = survey();
    const emptyResult = await geocodeSurvey(input, { fetchImpl: vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch, sleepImpl: vi.fn(async () => {}) });
    expect(emptyResult.elementarySchools[0].lat).toBeUndefined();
    const thrownResult = await geocodeSurvey(input, { fetchImpl: vi.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch, sleepImpl: vi.fn(async () => {}) });
    expect(thrownResult.elementarySchools[0].lat).toBeUndefined();
  });
  it("入力を変更しない", async () => {
    const input = survey();
    const original = structuredClone(input);
    await geocodeSurvey(input, { fetchImpl: successfulFetch as unknown as typeof fetch, sleepImpl: vi.fn(async () => {}) });
    expect(input).toEqual(original);
  });
  it("対象が0件なら fetch と sleep を呼ばず、内容を保つ", async () => {
    const input = { ...survey(), elementarySchools: [{ name: "既存", lat: 1, lng: 2 }], juniorHighSchools: [] };
    const fetchImpl = vi.fn();
    const sleepImpl = vi.fn();
    await expect(geocodeSurvey(input, { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl })).resolves.toEqual({ ...input, programs: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sleepImpl).not.toHaveBeenCalled();
  });
  it("小中学校をまたいで1回だけスロットルする", async () => {
    const sleepImpl = vi.fn(async () => {});
    await geocodeSurvey(survey(), { fetchImpl: successfulFetch as unknown as typeof fetch, sleepImpl });
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });
  it("補完した座標は既存の SQL 生成に渡される", async () => {
    const sql = buildSql(await geocodeSurvey(survey(), { fetchImpl: successfulFetch as unknown as typeof fetch, sleepImpl: vi.fn(async () => {}) }));
    expect(sql).toContain("35.6, 139.7");
  });

  it("addressのみ設定されたprogramsエントリは座標を補完する", async () => {
    const input = { ...survey(), elementarySchools: [], juniorHighSchools: [], programs: [{ name: "電話相談窓口", address: "東京都台東区C" }] };
    const result = await geocodeSurvey(input, { fetchImpl: successfulFetch as unknown as typeof fetch, sleepImpl: vi.fn(async () => {}) });
    expect(result.programs[0]).toMatchObject({ lat: 35.6, lng: 139.7 });
  });

  it("既にlat/lngが設定済み、またはaddressが無いprogramsエントリはジオコーディング対象にならない", async () => {
    const input = {
      ...survey(),
      elementarySchools: [],
      juniorHighSchools: [],
      programs: [
        { name: "既存座標あり", address: "東京都台東区C", lat: 1, lng: 2 },
        { name: "住所なし" },
      ],
    };
    const fetchImpl = vi.fn();
    const result = await geocodeSurvey(input, { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: vi.fn(async () => {}) });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.programs).toEqual(input.programs);
  });

  it("学校とprogramsが混在する場合、両方が正しくジオコーディングされる", async () => {
    const input = { ...survey(), programs: [{ name: "電話相談窓口", address: "東京都台東区C" }] };
    const result = await geocodeSurvey(input, { fetchImpl: successfulFetch as unknown as typeof fetch, sleepImpl: vi.fn(async () => {}) });
    expect(result.elementarySchools[0]).toMatchObject({ lat: 35.6, lng: 139.7 });
    expect(result.juniorHighSchools[0]).toMatchObject({ lat: 35.6, lng: 139.7 });
    expect(result.programs[0]).toMatchObject({ lat: 35.6, lng: 139.7 });
  });
});
