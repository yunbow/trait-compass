// scripts/data/validate-manual.mjs の純関数(validateMunicipalitySurvey)のテスト。
//
// このファイルは data/manual/**.yaml を data/manual/schema/municipality.schema.ts の
// Zod スキーマの意図に沿って検証する CLI だが、main() は直接実行されたときのみ起動する
// ようガードされている(import 時の副作用なし)ため、ingest-manual-survey.test.ts と同様に
// validateMunicipalitySurvey を通常の ESM import でテストできる。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import YAML from "yaml";

import { validateMunicipalitySurvey } from "../validate-manual.mjs";

// data/manual/municipalities/*.yaml は非公開リポジトリのみに存在するため、無い環境では
// 以下2件を skip する(validateMunicipalitySurvey 自体のロジックを検証する他のテストは
// 合成データのみを使うため、この環境差の影響を受けない)。
const manualMunicipalitiesDir = join(process.cwd(), "..", "data", "manual", "municipalities");
const hasManualData = existsSync(manualMunicipalitiesDir);

describe("validateMunicipalitySurvey", () => {
  it.skipIf(!hasManualData)("既存の台東区YAML(data/manual/municipalities/13106-taito.yaml)はPASSする(違反0件)", () => {
    const raw = readFileSync(join(manualMunicipalitiesDir, "13106-taito.yaml"), "utf8");
    const survey = YAML.parse(raw);
    expect(validateMunicipalitySurvey(survey)).toEqual([]);
  });

  it.skipIf(!hasManualData)("既存の自治体YAML全件はPASSする(違反0件)", () => {
    const files = readdirSync(manualMunicipalitiesDir).filter((file) => file.endsWith(".yaml"));
    expect(files.length).toBeGreaterThanOrEqual(22);
    for (const file of files) {
      expect(validateMunicipalitySurvey(YAML.parse(readFileSync(join(manualMunicipalitiesDir, file), "utf8"), { maxAliasCount: 2000 }))).toEqual([]);
    }
  });

  const baseSurvey = {
    municipalityCode: "13106",
    municipalityName: "台東区",
    prefecture: "東京都",
    surveyDate: "2026-07-13",
    licenseAudit: {
      auditedOn: "2026-08-10",
      schoolClassData: "not_applicable",
      consultationWindowData: "not_applicable",
      zoningData: "not_applicable",
      highSchoolData: "not_applicable",
    },
    elementarySchools: [
      {
        name: "上野小学校",
        level: "elementary",
        sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
      },
    ],
  };

  it("必須フィールドがすべて揃った最小構成はPASSする", () => {
    expect(validateMunicipalitySurvey(baseSurvey)).toEqual([]);
  });

  it("トップレベルがオブジェクトでない場合はFAILする", () => {
    expect(validateMunicipalitySurvey(null)).not.toEqual([]);
    expect(validateMunicipalitySurvey("not-an-object")).not.toEqual([]);
    expect(validateMunicipalitySurvey(["array"])).not.toEqual([]);
  });

  it("必須フィールド(municipalityCode)欠落はFAILする", () => {
    const { municipalityCode: _municipalityCode, ...broken } = baseSurvey;
    const violations = validateMunicipalitySurvey(broken);
    expect(violations.some((message) => message.startsWith("municipalityCode:"))).toBe(true);
  });

  it("municipalityCode が5桁の数字でない場合はFAILする(正規表現 ^\\d{5}$)", () => {
    const violations = validateMunicipalitySurvey({ ...baseSurvey, municipalityCode: "131" });
    expect(violations.some((message) => message.startsWith("municipalityCode:"))).toBe(true);
  });

  it("surveyDate が YYYY-MM-DD形式でない場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({ ...baseSurvey, surveyDate: "2026/07/13" });
    expect(violations.some((message) => message.startsWith("surveyDate:"))).toBe(true);
  });

  it("prefecture が「東京都」以外の場合はFAILする(z.literal)", () => {
    const violations = validateMunicipalitySurvey({ ...baseSurvey, prefecture: "大阪府" });
    expect(violations.some((message) => message.startsWith("prefecture:"))).toBe(true);
  });

  it("不正なenum値(disabilityType)はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      elementarySchools: [
        {
          name: "テスト小学校",
          level: "elementary",
          fixedClasses: [{ disabilityType: "not_a_real_type" }],
          sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
        },
      ],
    });
    expect(violations.some((message) => message.includes("fixedClasses[0].disabilityType"))).toBe(true);
  });

  it("不正なenum値(programsのcategory)はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      programs: [
        {
          name: "テスト制度",
          category: "unknown_category",
          sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
        },
      ],
    });
    expect(violations.some((message) => message.includes("programs[0].category"))).toBe(true);
  });

  // 2026-08是正(外部コードレビュー指摘: 手動調査プログラムの対象年齢・確認状態が検索へ
  // 反映されない、スキーマ・投入処理の土台のみ)。
  it("programs[].ageRange/lifestageMin/lifestageMax/confirmedOn を未指定のままPASSする(既存YAML互換)", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      licenseAudit: { ...baseSurvey.licenseAudit, consultationWindowData: "permission_pending" },
      programs: [{ name: "テスト制度", category: "counseling", sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }] }],
    });
    expect(violations).toEqual([]);
  });

  it("programs[].ageRange/lifestageMin/lifestageMax/confirmedOn を正しく指定するとPASSする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      licenseAudit: { ...baseSurvey.licenseAudit, consultationWindowData: "permission_pending" },
      programs: [
        {
          name: "テスト制度",
          category: "counseling",
          ageRange: "adult",
          lifestageMin: "high-school",
          lifestageMax: "working-adult",
          confirmedOn: "2026-08-29",
          sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
        },
      ],
    });
    expect(violations).toEqual([]);
  });

  it("不正なenum値(programsのageRange)はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      programs: [
        { name: "テスト制度", category: "counseling", ageRange: "senior", sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }] },
      ],
    });
    expect(violations.some((message) => message.includes("programs[0].ageRange"))).toBe(true);
  });

  it("lifestageMinのみ指定しlifestageMaxを省略した場合はFAILする(両方指定または両方省略のみ許可)", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      programs: [
        {
          name: "テスト制度",
          category: "counseling",
          lifestageMin: "high-school",
          sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
        },
      ],
    });
    expect(violations.some((message) => message.includes("programs[0].lifestageMin/lifestageMax"))).toBe(true);
  });

  it("lifestageMin が lifestageMax より大きい場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      programs: [
        {
          name: "テスト制度",
          category: "counseling",
          lifestageMin: "working-adult",
          lifestageMax: "preschool",
          sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
        },
      ],
    });
    expect(violations.some((message) => message.includes("programs[0].lifestageMin/lifestageMax"))).toBe(true);
  });

  it("programsのconfirmedOn が YYYY-MM-DD形式でない場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      programs: [
        { name: "テスト制度", category: "counseling", confirmedOn: "2026/08/29", sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }] },
      ],
    });
    expect(violations.some((message) => message.includes("programs[0].confirmedOn"))).toBe(true);
  });

  it("School(withSources、sources必須)がsourcesを持たない場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      elementarySchools: [{ name: "テスト小学校", level: "elementary" }],
    });
    expect(violations.some((message) => message.includes("elementarySchools[0].sources"))).toBe(true);
  });

  it("sourcesが空配列(0件)の場合もFAILする(z.array().min(1))", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      elementarySchools: [{ name: "テスト小学校", level: "elementary", sources: [] }],
    });
    expect(violations.some((message) => message.includes("elementarySchools[0].sources"))).toBe(true);
  });

  it("ClassOrganization(withSources.partial、sources任意)はsources省略でPASSする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      licenseAudit: { ...baseSurvey.licenseAudit, schoolClassData: "permission_pending" },
      classOrganization: [{ level: "elementary", judgement: "separate", rationale: "テスト根拠" }],
    });
    expect(violations).toEqual([]);
  });

  it("SourceRefのconfirmedOnがYYYY-MM-DD形式でない場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      elementarySchools: [
        {
          name: "テスト小学校",
          level: "elementary",
          sources: [{ label: "テスト出典", confirmedOn: "2026年7月13日" }],
        },
      ],
    });
    expect(violations.some((message) => message.includes("sources[0].confirmedOn"))).toBe(true);
  });

  it("SourceRefのurlが不正な形式の場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      elementarySchools: [
        {
          name: "テスト小学校",
          level: "elementary",
          sources: [{ label: "テスト出典", url: "not-a-url", confirmedOn: "2026-07-13" }],
        },
      ],
    });
    expect(violations.some((message) => message.includes("sources[0].url"))).toBe(true);
  });

  it("SpecialNeedsSchoolのdisabilityTypesが空配列の場合はFAILする(z.array().min(1))", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      specialNeedsSchools: [
        {
          name: "テスト特別支援学校",
          disabilityTypes: [],
          sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
        },
      ],
    });
    expect(violations.some((message) => message.includes("specialNeedsSchools[0].disabilityTypes"))).toBe(true);
  });

  it("population/householdsが正の整数でない場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({ ...baseSurvey, population: -1, households: 1.5 });
    expect(violations.some((message) => message.startsWith("population:"))).toBe(true);
    expect(violations.some((message) => message.startsWith("households:"))).toBe(true);
  });

  it("配列型フィールドが配列でない場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({ ...baseSurvey, elementarySchools: "not-an-array" });
    expect(violations.some((message) => message.startsWith("elementarySchools:"))).toBe(true);
  });

  const baseSupportPathway = {
    id: "preschool-consultation",
    lifestages: ["preschool"],
    purposeId: "consultation",
    purposeLabel: "発達相談をしたい",
    steps: [{ order: 1, title: "こども家庭支援センターへ相談" }],
    sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
  };

  it("supportPathwaysを持つ最小構成(1エントリ、必須フィールドのみ)はPASSする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      licenseAudit: { ...baseSurvey.licenseAudit, consultationWindowData: "permission_pending" },
      supportPathways: [baseSupportPathway],
    });
    expect(violations).toEqual([]);
  });

  it("SupportPathway.lifestagesが空配列の場合はFAILする(z.array().min(1))", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      supportPathways: [{ ...baseSupportPathway, lifestages: [] }],
    });
    expect(violations.some((message) => message.includes("supportPathways[0].lifestages"))).toBe(true);
  });

  it("SupportPathway.lifestagesに不正なenum値が含まれる場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      supportPathways: [{ ...baseSupportPathway, lifestages: ["college"] }],
    });
    expect(violations.some((message) => message.includes("supportPathways[0].lifestages[0]"))).toBe(true);
  });

  it("SupportPathway.stepsが空配列の場合はFAILする(z.array().min(1))", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      supportPathways: [{ ...baseSupportPathway, steps: [] }],
    });
    expect(violations.some((message) => message.includes("supportPathways[0].steps"))).toBe(true);
  });

  it("SupportPathwayがsourcesを持たない場合はFAILする(withSourcesにより必須)", () => {
    const { sources: _sources, ...pathwayWithoutSources } = baseSupportPathway;
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      supportPathways: [pathwayWithoutSources],
    });
    expect(violations.some((message) => message.includes("supportPathways[0].sources"))).toBe(true);
  });

  it("SupportPathway.purposeId/purposeLabelが欠落した場合はFAILする", () => {
    const { purposeId: _purposeId, purposeLabel: _purposeLabel, ...pathwayWithoutPurpose } = baseSupportPathway;
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      supportPathways: [pathwayWithoutPurpose],
    });
    expect(violations.some((message) => message.includes("supportPathways[0].purposeId"))).toBe(true);
    expect(violations.some((message) => message.includes("supportPathways[0].purposeLabel"))).toBe(true);
  });

  it("PathwayStep.orderが正の整数でない場合(0, -1, 1.5)はFAILする", () => {
    for (const invalidOrder of [0, -1, 1.5]) {
      const violations = validateMunicipalitySurvey({
        ...baseSurvey,
        supportPathways: [
          { ...baseSupportPathway, steps: [{ order: invalidOrder, title: "テストステップ" }] },
        ],
      });
      expect(violations.some((message) => message.includes("supportPathways[0].steps[0].order"))).toBe(true);
    }
  });

  it("PathwayStep.titleが欠落した場合はFAILする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      supportPathways: [{ ...baseSupportPathway, steps: [{ order: 1 }] }],
    });
    expect(violations.some((message) => message.includes("supportPathways[0].steps[0].title"))).toBe(true);
  });

  it("PathwayStep.isConditionalを省略した最小ステップ(orderとtitleのみ)はPASSする", () => {
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      licenseAudit: { ...baseSurvey.licenseAudit, consultationWindowData: "permission_pending" },
      supportPathways: [{ ...baseSupportPathway, steps: [{ order: 1, title: "テストステップ" }] }],
    });
    expect(violations).toEqual([]);
  });

  it("SupportPathway.statusを省略した場合はPASSする(status自体は任意フィールド)", () => {
    expect(Object.prototype.hasOwnProperty.call(baseSupportPathway, "status")).toBe(false);
    const violations = validateMunicipalitySurvey({
      ...baseSurvey,
      licenseAudit: { ...baseSurvey.licenseAudit, consultationWindowData: "permission_pending" },
      supportPathways: [baseSupportPathway],
    });
    expect(violations).toEqual([]);
  });

  // supportPathways[].steps[].actor と programs[].name の整合性チェック(再発防止)。
  // facility-pathway-priority.ts の applyPathwayPriority は actor と programs[].name の
  // 文字列完全一致で想定ルート優先表示を行うため、表記ゆれ・未登録があると機能しなくなる
  // (13106-taito.yaml で実際に発生したバグ、data/manual/README.md 執筆ルール7)。
  describe("supportPathways[].steps[].actor と programs[].name の整合性", () => {
    const basePrograms = [
      {
        name: "こども家庭支援センター",
        category: "counseling",
        sources: [{ label: "テスト出典", confirmedOn: "2026-07-13" }],
      },
    ];

    it("actorがprogramsのnameと完全一致する場合はPASSする(エラーにならない)", () => {
      const violations = validateMunicipalitySurvey({
        ...baseSurvey,
        licenseAudit: { ...baseSurvey.licenseAudit, consultationWindowData: "permission_pending" },
        programs: basePrograms,
        supportPathways: [
          {
            ...baseSupportPathway,
            steps: [{ order: 1, title: "テストステップ", actor: "こども家庭支援センター" }],
          },
        ],
      });
      expect(violations).toEqual([]);
    });

    it("actorがprogramsのnameと表記ゆれで一致しない場合はFAILする", () => {
      const violations = validateMunicipalitySurvey({
        ...baseSurvey,
        programs: basePrograms,
        supportPathways: [
          {
            ...baseSupportPathway,
            // 全角スペース有無・微妙な表記ゆれを想定。
            steps: [{ order: 1, title: "テストステップ", actor: "こども家庭支援センター(表記ゆれ)" }],
          },
        ],
      });
      expect(
        violations.some(
          (message) =>
            message.startsWith("supportPathways[0].steps[0].actor:") && message.includes("programs の name"),
        ),
      ).toBe(true);
    });

    it("actorがprogramsに未登録の窓口名の場合はFAILする", () => {
      const violations = validateMunicipalitySurvey({
        ...baseSurvey,
        programs: basePrograms,
        supportPathways: [
          {
            ...baseSupportPathway,
            steps: [{ order: 1, title: "テストステップ", actor: "programsに存在しない窓口" }],
          },
        ],
      });
      expect(
        violations.some((message) => message.startsWith("supportPathways[0].steps[0].actor:")),
      ).toBe(true);
    });

    it("actorがundefined(省略)の場合はチェック対象外でエラーにならない", () => {
      const violationsWhenOmitted = validateMunicipalitySurvey({
        ...baseSurvey,
        licenseAudit: { ...baseSurvey.licenseAudit, consultationWindowData: "permission_pending" },
        programs: basePrograms,
        supportPathways: [
          {
            ...baseSupportPathway,
            steps: [{ order: 1, title: "actor省略ステップ" }],
          },
        ],
      });
      expect(violationsWhenOmitted).toEqual([]);
    });

    it("actorがnullの場合はactor⇔programs整合性チェックの対象外になる(型不正の別エラーとは無関係)", () => {
      // YAML の schema.ts 上 actor は optional な文字列(省略のみ想定)だが、
      // D1 経由のデータ等で null が来るケースも新チェックの対象外とし、
      // false positive で「programsのnameが見つかりません」とは報告しないことを保証する。
      const violationsWhenNull = validateMunicipalitySurvey({
        ...baseSurvey,
        programs: basePrograms,
        supportPathways: [
          {
            ...baseSupportPathway,
            steps: [{ order: 1, title: "actorがnullのステップ", actor: null }],
          },
        ],
      });
      expect(violationsWhenNull.some((message) => message.includes("programs の name"))).toBe(false);
    });
  });
});

describe("licenseAudit", () => {
  const baseSurvey = {
    municipalityCode: "13106", municipalityName: "台東区", prefecture: "東京都", surveyDate: "2026-07-13",
    licenseAudit: { auditedOn: "2026-08-10", schoolClassData: "not_applicable", consultationWindowData: "not_applicable", zoningData: "not_applicable", highSchoolData: "not_applicable" },
    elementarySchools: [{ name: "上野小学校", level: "elementary", sources: [{ label: "出典", confirmedOn: "2026-07-13" }] }],
  };
  const source = { label: "出典", confirmedOn: "2026-07-13" };

  it("必須であり、auditedOnとstatus enumを検証する", () => {
    const { licenseAudit: _audit, ...withoutAudit } = baseSurvey;
    expect(validateMunicipalitySurvey(withoutAudit).some((message) => message.includes("licenseAudit is required"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...baseSurvey, licenseAudit: { ...baseSurvey.licenseAudit, auditedOn: "2026/08/10" } }).some((message) => message.includes("licenseAudit.auditedOn"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...baseSurvey, licenseAudit: { ...baseSurvey.licenseAudit, zoningData: "unknown" } }).some((message) => message.includes("licenseAudit.zoningData") && message.includes("unknown"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...baseSurvey, licenseAudit: { ...baseSurvey.licenseAudit, highSchoolData: "unknown" } }).some((message) => message.includes("licenseAudit.highSchoolData") && message.includes("unknown"))).toBe(true);
  });

  it("license_research_onlyの骨組みYAMLは空配列とlicenseAuditの整合性チェックをスキップする", () => {
    const skeletonSurvey = {
      ...baseSurvey,
      elementarySchools: [],
      juniorHighSchools: [],
      programs: [],
      classOrganization: [],
      highSchoolPathways: [],
      specialNeedsSchools: [],
      supportPathways: [],
      resultsGuideNotes: [],
      licenseAudit: {
        ...baseSurvey.licenseAudit,
        schoolClassData: "permission_pending",
        consultationWindowData: "permission_pending",
      },
    };

    expect(validateMunicipalitySurvey(skeletonSurvey).some((message) => message.includes("not_applicable である必要があります"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...skeletonSurvey, surveyStatus: "license_research_only" })).toEqual([]);
    expect(validateMunicipalitySurvey({
      ...skeletonSurvey,
      surveyStatus: "license_research_only",
      licenseAudit: { ...skeletonSurvey.licenseAudit, schoolClassData: "permission_granted" },
    }).some((message) => message.includes("licenseAudit.note"))).toBe(true);
  });

  it("surveyStatusのenum外の値はFAILする", () => {
    const violations = validateMunicipalitySurvey({ ...baseSurvey, surveyStatus: "incomplete" });
    expect(violations.some((message) => message.startsWith("surveyStatus:") && message.includes("incomplete"))).toBe(true);
  });

  it("surveyStatus省略時はfull_surveyとして従来どおり厳格に整合性を検証する", () => {
    const survey = {
      ...baseSurvey,
      elementarySchools: [],
      licenseAudit: { ...baseSurvey.licenseAudit, schoolClassData: "permission_pending" },
    };
    expect(validateMunicipalitySurvey(survey).some((message) => message.includes("licenseAudit.schoolClassData") && message.includes("not_applicable である必要があります"))).toBe(true);
  });

  it("zoning・schoolClass・consultationのデータ有無とnot_applicableの整合性を検証する", () => {
    const zoningData = { ...baseSurvey, specialNeedsSchools: [{ name: "都立学校", disabilityTypes: ["intellectual"], zoningNote: "通学区域", sources: [source] }] };
    expect(validateMunicipalitySurvey(zoningData).some((message) => message.includes("licenseAudit.zoningData"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...baseSurvey, licenseAudit: { ...baseSurvey.licenseAudit, zoningData: "permission_pending" } }).some((message) => message.includes("licenseAudit.zoningData"))).toBe(true);

    const classData = { ...baseSurvey, elementarySchools: [{ ...baseSurvey.elementarySchools[0], fixedClasses: [{ disabilityType: "intellectual" }] }] };
    expect(validateMunicipalitySurvey(classData).some((message) => message.includes("licenseAudit.schoolClassData"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...baseSurvey, licenseAudit: { ...baseSurvey.licenseAudit, schoolClassData: "permission_pending" } }).some((message) => message.includes("licenseAudit.schoolClassData"))).toBe(true);

    const consultationData = { ...baseSurvey, programs: [{ name: "相談窓口", category: "school_consultation", sources: [source] }] };
    expect(validateMunicipalitySurvey(consultationData).some((message) => message.includes("licenseAudit.consultationWindowData"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...baseSurvey, licenseAudit: { ...baseSurvey.licenseAudit, consultationWindowData: "permission_pending" } }).some((message) => message.includes("licenseAudit.consultationWindowData"))).toBe(true);
  });

  it("highSchoolPathwaysのmetro.ed.jp由来データとhighSchoolDataの整合性を検証する", () => {
    const metroPathway = { name: "都立高校", pathwayType: "challenge_school", url: "https://www.metro.ed.jp/example/", sources: [source] };
    expect(validateMunicipalitySurvey({ ...baseSurvey, highSchoolPathways: [metroPathway] }).some((message) => message.includes("licenseAudit.highSchoolData"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...baseSurvey, licenseAudit: { ...baseSurvey.licenseAudit, highSchoolData: "permission_pending" } }).some((message) => message.includes("licenseAudit.highSchoolData"))).toBe(true);
  });

  it("私立のcorrespondence_support_schoolのみならhighSchoolData: not_applicableでPASSする", () => {
    const survey = {
      ...baseSurvey,
      highSchoolPathways: [{ name: "私立通信制高校", pathwayType: "correspondence_support_school", url: "https://www.try-gakuin.com/", sources: [source] }],
    };
    expect(validateMunicipalitySurvey(survey)).toEqual([]);
  });

  it("highSchoolData: ccby_replacedにはhighSchoolPathwaysのlicense付き出典を要求する", () => {
    const pathway = { name: "都立高校", pathwayType: "challenge_school", url: "https://www.metro.ed.jp/example/", sources: [source] };
    const survey = { ...baseSurvey, licenseAudit: { ...baseSurvey.licenseAudit, highSchoolData: "ccby_replaced" }, highSchoolPathways: [pathway] };
    expect(validateMunicipalitySurvey(survey).some((message) => message.includes("license 付き出典"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...survey, highSchoolPathways: [{ ...pathway, sources: [{ ...source, license: "CC BY 4.0" }] }] })).toEqual([]);
  });

  it("classOrganizationのみでもschoolClassDataをnot_applicableにできない", () => {
    const survey = {
      ...baseSurvey,
      classOrganization: [{ level: "elementary", judgement: "separate", rationale: "固定級の学級数" }],
    };
    expect(validateMunicipalitySurvey(survey).some((message) => message.includes("licenseAudit.schoolClassData"))).toBe(true);
  });

  it("schoolBoundaryFlexibilityまたはhazardMapのみでもconsultationWindowDataをnot_applicableにできない", () => {
    for (const scopedData of [
      { schoolBoundaryFlexibility: { approvalCriteria: [] } },
      { hazardMap: { evacuationPolicyNote: "避難方針" } },
    ]) {
      expect(validateMunicipalitySurvey({ ...baseSurvey, ...scopedData }).some((message) => message.includes("licenseAudit.consultationWindowData"))).toBe(true);
    }
  });

  it("ccby_replacedにはlicense付き出典を、permission_grantedにはnoteを要求する", () => {
    const ccbyWithoutLicense = {
      ...baseSurvey,
      elementarySchools: [{ ...baseSurvey.elementarySchools[0], fixedClasses: [{ disabilityType: "intellectual" }] }],
      licenseAudit: { ...baseSurvey.licenseAudit, schoolClassData: "ccby_replaced" },
    };
    expect(validateMunicipalitySurvey(ccbyWithoutLicense).some((message) => message.includes("license 付き出典"))).toBe(true);
    const ccbyWithLicense = { ...ccbyWithoutLicense, elementarySchools: [{ ...ccbyWithoutLicense.elementarySchools[0], sources: [{ ...source, license: "CC BY 4.0" }] }] };
    expect(validateMunicipalitySurvey(ccbyWithLicense)).toEqual([]);
    const granted = {
      ...baseSurvey,
      elementarySchools: [{ ...baseSurvey.elementarySchools[0], fixedClasses: [{ disabilityType: "intellectual" }] }],
      licenseAudit: { ...baseSurvey.licenseAudit, schoolClassData: "permission_granted" },
    };
    expect(validateMunicipalitySurvey(granted).some((message) => message.includes("licenseAudit.note"))).toBe(true);
    expect(validateMunicipalitySurvey({ ...granted, licenseAudit: { ...granted.licenseAudit, note: "2026-08-10 台東区教育委員会が許諾" } })).toEqual([]);
  });

  it("permission_deniedはエラーにせず警告する", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const survey = {
      ...baseSurvey,
      specialNeedsSchools: [{ name: "都立学校", disabilityTypes: ["intellectual"], zoningNote: "通学区域", sources: [source] }],
      licenseAudit: { ...baseSurvey.licenseAudit, zoningData: "permission_denied" },
    };
    expect(validateMunicipalitySurvey(survey)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("値の削除または代替データへの差し替えが必要"));
    warn.mockRestore();
  });
});
