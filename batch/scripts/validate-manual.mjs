#!/usr/bin/env node
/**
 * data/manual/municipalities/*.yaml を data/manual/schema/municipality.schema.ts の
 * Zod スキーマの意図に沿って検証する CLI。
 *
 * TypeScript の MunicipalitySurveySchema は Node が .ts を直接 import できないため、
 * ingest-manual-survey.mjs の assertSurvey と同様、依存を増やさない手書きのランタイム
 * チェックとする。ただし assertSurvey(必須フィールドの有無のみ)より詳細に、必須
 * フィールド・enum値・sources必須(min 1)・正規表現(municipalityCode/surveyDate/
 * confirmedOn/asOfYear)を可能な範囲でチェックする。完全なスキーマ検証は TypeScript 側の
 * data/manual/schema/municipality.schema.ts を正とする。
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultDir = join(projectRoot, "data/manual/municipalities");

const MUNICIPALITY_CODE_RE = /^\d{5}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

const CONFIRMATION_STATUS = ["confirmed", "unconfirmed", "phone_required"];
const DISABILITY_TYPES = ["intellectual", "autism_emotional", "hearing", "language", "visual", "health_impairment", "physical", "other"];
const SCHOOL_LEVELS = ["elementary", "junior_high"];
const OPERATION_MODES = ["itinerant_teacher", "student_travels_to_hub"];
const PROGRAM_CATEGORIES = [
  "school_consultation",
  "counseling",
  "day_service_directory",
  "medical_expense_subsidy",
  "housing_support",
  "high_school_pathway",
  "ict_environment",
  "special_needs_school_zoning",
  "other",
];
const CLASS_ORGANIZATION_JUDGEMENTS = ["separate", "combined", "mixed", "unconfirmed", "not_applicable"];
const HIGH_SCHOOL_PATHWAY_TYPES = [
  "challenge_school",
  "encourage_school",
  "correspondence_support_school",
  "palette_school",
  "community_active_school",
  "creative_school",
  "other",
];
const COMMUTE_RATINGS = ["excellent", "good", "marginal"];
const SPECIAL_NEEDS_SCHOOL_LEVELS = ["elementary", "junior_high", "high", "vocational"];
const LIFESTAGE_VALUES = ["preschool", "elementary-junior-high", "high-school", "university-vocational", "working-adult"];
export const LICENSE_STATUSES = [
  "ccby_replaced",
  "ccby_available",
  "permission_pending",
  "permission_granted",
  "permission_denied",
  "tokyo_restricted",
  "not_applicable",
];
export const PUBLISHABLE_LICENSE_STATUSES = ["ccby_replaced", "permission_granted", "not_applicable"];
export const SURVEY_STATUSES = ["full_survey", "license_research_only"];

// --- 汎用バリデーションヘルパー ---------------------------------------

function isPlainObject(input) {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

class ErrorCollector {
  constructor() {
    this.errors = [];
  }

  add(path, message) {
    this.errors.push(`${path || "(root)"}: ${message}`);
  }
}

function checkString(value, path, errors, { optional = false, minLength = 0, regex, regexMessage } = {}) {
  if (value === undefined) {
    if (!optional) errors.add(path, "必須の文字列フィールドがありません。");
    return;
  }
  if (typeof value !== "string") {
    errors.add(path, `文字列である必要があります(実際: ${typeof value})。`);
    return;
  }
  if (value.length < minLength) {
    errors.add(path, `${minLength}文字以上である必要があります。`);
  }
  if (regex && !regex.test(value)) {
    errors.add(path, regexMessage ?? `形式が不正です(${regex})。`);
  }
}

function checkUrl(value, path, errors) {
  if (value === undefined) return;
  if (typeof value !== "string") {
    errors.add(path, `文字列(URL)である必要があります(実際: ${typeof value})。`);
    return;
  }
  try {
    void new URL(value);
  } catch {
    errors.add(path, "有効なURLである必要があります。");
  }
}

function checkEnum(value, path, errors, allowed, { optional = false } = {}) {
  if (value === undefined) {
    if (!optional) errors.add(path, "必須のフィールドがありません。");
    return;
  }
  if (!allowed.includes(value)) {
    errors.add(path, `許可された値(${allowed.join(", ")})のいずれかである必要があります(実際: ${JSON.stringify(value)})。`);
  }
}

function checkBoolean(value, path, errors, { optional = true } = {}) {
  if (value === undefined) {
    if (!optional) errors.add(path, "必須のbooleanフィールドがありません。");
    return;
  }
  if (typeof value !== "boolean") {
    errors.add(path, `booleanである必要があります(実際: ${typeof value})。`);
  }
}

function checkPositiveInt(value, path, errors, { optional = true } = {}) {
  if (value === undefined) {
    if (!optional) errors.add(path, "必須の数値フィールドがありません。");
    return;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors.add(path, `正の整数である必要があります(実際: ${JSON.stringify(value)})。`);
  }
}

function checkPositiveNumber(value, path, errors, { optional = true } = {}) {
  if (value === undefined) {
    if (!optional) errors.add(path, "必須の数値フィールドがありません。");
    return;
  }
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    errors.add(path, `正の数値である必要があります(実際: ${JSON.stringify(value)})。`);
  }
}

function checkNumberRange(value, path, errors, { min, max, optional = true } = {}) {
  if (value === undefined) {
    if (!optional) errors.add(path, "必須の数値フィールドがありません。");
    return;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.add(path, `数値である必要があります(実際: ${JSON.stringify(value)})。`);
    return;
  }
  if (min !== undefined && value < min) errors.add(path, `${min}以上である必要があります。`);
  if (max !== undefined && value > max) errors.add(path, `${max}以下である必要があります。`);
}

/** 配列かどうかを検証する。検証に成功した(=以降 forEach してよい)場合のみ true を返す。 */
function checkArray(value, path, errors, { optional = true, minLength = 0 } = {}) {
  if (value === undefined) {
    if (!optional) errors.add(path, "必須の配列フィールドがありません。");
    return false;
  }
  if (!Array.isArray(value)) {
    errors.add(path, `配列である必要があります(実際: ${typeof value})。`);
    return false;
  }
  if (value.length < minLength) {
    errors.add(path, `${minLength}件以上の要素が必要です。`);
  }
  return true;
}

// --- data/manual/schema/municipality.schema.ts に対応する各チェック ----

function checkSourceRef(source, path, errors) {
  if (!isPlainObject(source)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkString(source.label, `${path}.label`, errors, { minLength: 1 });
  checkUrl(source.url, `${path}.url`, errors);
  checkString(source.license, `${path}.license`, errors, { optional: true, minLength: 1 });
  checkString(source.asOfYear, `${path}.asOfYear`, errors, {
    optional: true,
    regex: YEAR_RE,
    regexMessage: "asOfYear は YYYY形式である必要があります。",
  });
  checkString(source.confirmedOn, `${path}.confirmedOn`, errors, {
    regex: DATE_RE,
    regexMessage: "confirmedOn は YYYY-MM-DD形式である必要があります。",
  });
}

/**
 * sources フィールドを検証する。schema.ts の withSources / withSources.partial() に対応:
 * required=false でもキー自体は省略可能なだけで、指定した場合は常に1件以上必要(z.array().min(1)は
 * partial() でも変わらない)。
 */
function checkSources(sources, path, errors, { required }) {
  if (sources === undefined) {
    if (required) errors.add(path, "sources は必須(1件以上)です。");
    return;
  }
  if (!checkArray(sources, path, errors, { optional: true, minLength: 1 })) return;
  sources.forEach((source, index) => checkSourceRef(source, `${path}[${index}]`, errors));
}

function checkFixedClass(fixedClass, path, errors) {
  if (!isPlainObject(fixedClass)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkEnum(fixedClass.disabilityType, `${path}.disabilityType`, errors, DISABILITY_TYPES);
  checkString(fixedClass.className, `${path}.className`, errors, { optional: true });
  checkPositiveInt(fixedClass.classCount, `${path}.classCount`, errors);
  checkPositiveInt(fixedClass.capacity, `${path}.capacity`, errors);
  checkEnum(fixedClass.status, `${path}.status`, errors, CONFIRMATION_STATUS, { optional: true });
  checkString(fixedClass.note, `${path}.note`, errors, { optional: true });
  checkSources(fixedClass.sources, `${path}.sources`, errors, { required: false });
}

function checkResourceRoom(resourceRoom, path, errors) {
  if (!isPlainObject(resourceRoom)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkBoolean(resourceRoom.hasResourceRoom, `${path}.hasResourceRoom`, errors, { optional: false });
  checkBoolean(resourceRoom.isHubSchool, `${path}.isHubSchool`, errors, { optional: true });
  checkString(resourceRoom.hubSchoolName, `${path}.hubSchoolName`, errors, { optional: true });
  checkString(resourceRoom.groupName, `${path}.groupName`, errors, { optional: true });
  checkEnum(resourceRoom.operationMode, `${path}.operationMode`, errors, OPERATION_MODES, { optional: true });
}

function checkSchool(school, path, errors) {
  if (!isPlainObject(school)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkString(school.name, `${path}.name`, errors, { minLength: 1 });
  checkEnum(school.level, `${path}.level`, errors, SCHOOL_LEVELS);
  checkString(school.areaHint, `${path}.areaHint`, errors, { optional: true });
  checkString(school.address, `${path}.address`, errors, { optional: true });
  checkNumberRange(school.lat, `${path}.lat`, errors, { min: -90, max: 90 });
  checkNumberRange(school.lng, `${path}.lng`, errors, { min: -180, max: 180 });
  if (checkArray(school.fixedClasses, `${path}.fixedClasses`, errors, { optional: true })) {
    school.fixedClasses.forEach((fixedClass, index) => checkFixedClass(fixedClass, `${path}.fixedClasses[${index}]`, errors));
  }
  if (school.resourceRoom !== undefined) checkResourceRoom(school.resourceRoom, `${path}.resourceRoom`, errors);
  checkString(school.districtNote, `${path}.districtNote`, errors, { optional: true });
  checkSources(school.sources, `${path}.sources`, errors, { required: true });
}

function checkClinic(clinic, path, errors) {
  if (!isPlainObject(clinic)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkString(clinic.name, `${path}.name`, errors, { minLength: 1 });
  checkString(clinic.department, `${path}.department`, errors, { optional: true });
  checkString(clinic.address, `${path}.address`, errors, { optional: true });
  checkString(clinic.accessNote, `${path}.accessNote`, errors, { optional: true });
  checkString(clinic.targetAgeNote, `${path}.targetAgeNote`, errors, { optional: true });
  checkEnum(clinic.acceptingNewPatients, `${path}.acceptingNewPatients`, errors, CONFIRMATION_STATUS, { optional: true });
  checkBoolean(clinic.isReferenceOnly, `${path}.isReferenceOnly`, errors, { optional: true });
  checkSources(clinic.sources, `${path}.sources`, errors, { required: true });
}

function checkProgram(program, path, errors) {
  if (!isPlainObject(program)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkString(program.name, `${path}.name`, errors, { minLength: 1 });
  checkEnum(program.category, `${path}.category`, errors, PROGRAM_CATEGORIES);
  checkString(program.description, `${path}.description`, errors, { optional: true });
  checkString(program.contact, `${path}.contact`, errors, { optional: true });
  checkString(program.address, `${path}.address`, errors, { optional: true });
  checkNumberRange(program.lat, `${path}.lat`, errors, { min: -90, max: 90 });
  checkNumberRange(program.lng, `${path}.lng`, errors, { min: -180, max: 180 });
  checkEnum(program.status, `${path}.status`, errors, CONFIRMATION_STATUS, { optional: true });
  checkSources(program.sources, `${path}.sources`, errors, { required: true });
}

function checkClassOrganization(organization, path, errors) {
  if (!isPlainObject(organization)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkEnum(organization.level, `${path}.level`, errors, SCHOOL_LEVELS);
  checkEnum(organization.judgement, `${path}.judgement`, errors, CLASS_ORGANIZATION_JUDGEMENTS);
  checkString(organization.rationale, `${path}.rationale`, errors, { minLength: 1 });
  checkSources(organization.sources, `${path}.sources`, errors, { required: false });
}

function checkHighSchoolPathway(pathway, path, errors) {
  if (!isPlainObject(pathway)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkString(pathway.name, `${path}.name`, errors, { minLength: 1 });
  checkEnum(pathway.pathwayType, `${path}.pathwayType`, errors, HIGH_SCHOOL_PATHWAY_TYPES);
  checkString(pathway.prefecture, `${path}.prefecture`, errors, { optional: true });
  checkString(pathway.address, `${path}.address`, errors, { optional: true });
  checkString(pathway.nearestStation, `${path}.nearestStation`, errors, { optional: true });
  checkPositiveInt(pathway.estimatedCommuteMinutes, `${path}.estimatedCommuteMinutes`, errors);
  checkEnum(pathway.commuteRating, `${path}.commuteRating`, errors, COMMUTE_RATINGS, { optional: true });
  checkString(pathway.commuteNote, `${path}.commuteNote`, errors, { optional: true });
  checkSources(pathway.sources, `${path}.sources`, errors, { required: true });
}

function checkSchoolBoundaryFlexibility(flexibility, path, errors) {
  if (!isPlainObject(flexibility)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkBoolean(flexibility.allowsChangeForFixedClassEnrollment, `${path}.allowsChangeForFixedClassEnrollment`, errors, { optional: true });
  if (checkArray(flexibility.approvalCriteria, `${path}.approvalCriteria`, errors, { optional: true })) {
    flexibility.approvalCriteria.forEach((criterion, index) => checkString(criterion, `${path}.approvalCriteria[${index}]`, errors));
  }
  checkString(flexibility.note, `${path}.note`, errors, { optional: true });
  checkSources(flexibility.sources, `${path}.sources`, errors, { required: false });
}

function checkHazardMap(hazardMap, path, errors) {
  if (!isPlainObject(hazardMap)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkNumberRange(hazardMap.floodRiskAreaPercent, `${path}.floodRiskAreaPercent`, errors, { min: 0, max: 100 });
  checkPositiveNumber(hazardMap.maxFloodDepthMeters, `${path}.maxFloodDepthMeters`, errors);
  checkNumberRange(hazardMap.tsunamiRiskAreaPercent, `${path}.tsunamiRiskAreaPercent`, errors, { min: 0, max: 100 });
  checkPositiveNumber(hazardMap.maxTsunamiDepthMeters, `${path}.maxTsunamiDepthMeters`, errors);
  checkNumberRange(hazardMap.earthquakeProbability30yPercent, `${path}.earthquakeProbability30yPercent`, errors, { min: 0, max: 100 });
  checkString(hazardMap.evacuationPolicyNote, `${path}.evacuationPolicyNote`, errors, { optional: true });
  checkSources(hazardMap.sources, `${path}.sources`, errors, { required: false });
}

function checkSpecialNeedsSchool(school, path, errors) {
  if (!isPlainObject(school)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkString(school.name, `${path}.name`, errors, { minLength: 1 });
  if (checkArray(school.disabilityTypes, `${path}.disabilityTypes`, errors, { optional: false, minLength: 1 })) {
    school.disabilityTypes.forEach((type, index) => checkEnum(type, `${path}.disabilityTypes[${index}]`, errors, DISABILITY_TYPES));
  }
  if (checkArray(school.levels, `${path}.levels`, errors, { optional: true })) {
    school.levels.forEach((level, index) => checkEnum(level, `${path}.levels[${index}]`, errors, SPECIAL_NEEDS_SCHOOL_LEVELS));
  }
  checkString(school.address, `${path}.address`, errors, { optional: true });
  checkBoolean(school.isInMunicipality, `${path}.isInMunicipality`, errors, { optional: true });
  checkString(school.zoningNote, `${path}.zoningNote`, errors, { optional: true });
  checkSources(school.sources, `${path}.sources`, errors, { required: true });
}

function checkPathwayStep(step, path, errors) {
  if (!isPlainObject(step)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkPositiveInt(step.order, `${path}.order`, errors, { optional: false });
  checkString(step.title, `${path}.title`, errors, { minLength: 1 });
  checkString(step.actor, `${path}.actor`, errors, { optional: true, minLength: 1 });
  checkString(step.contact, `${path}.contact`, errors, { optional: true });
  checkBoolean(step.isConditional, `${path}.isConditional`, errors, { optional: true });
  checkString(step.note, `${path}.note`, errors, { optional: true });
  checkSources(step.sources, `${path}.sources`, errors, { required: false });
}

function checkSupportPathway(pathway, path, errors) {
  if (!isPlainObject(pathway)) {
    errors.add(path, "オブジェクトである必要があります。");
    return;
  }
  checkString(pathway.id, `${path}.id`, errors, { minLength: 1 });
  if (checkArray(pathway.lifestages, `${path}.lifestages`, errors, { optional: false, minLength: 1 })) {
    pathway.lifestages.forEach((lifestage, index) => checkEnum(lifestage, `${path}.lifestages[${index}]`, errors, LIFESTAGE_VALUES));
  }
  checkString(pathway.purposeId, `${path}.purposeId`, errors, { minLength: 1 });
  checkString(pathway.purposeLabel, `${path}.purposeLabel`, errors, { minLength: 1 });
  if (checkArray(pathway.steps, `${path}.steps`, errors, { optional: false, minLength: 1 })) {
    pathway.steps.forEach((step, index) => checkPathwayStep(step, `${path}.steps[${index}]`, errors));
  }
  checkEnum(pathway.status, `${path}.status`, errors, CONFIRMATION_STATUS, { optional: true });
  checkSources(pathway.sources, `${path}.sources`, errors, { required: true });
}

/**
 * supportPathways[].steps[].actor と programs[].name の整合性をチェックする。
 *
 * facility-pathway-priority.ts の applyPathwayPriority は actor と programs[].name の
 * 文字列完全一致で「想定ルート優先表示」を行う(app/src/features/support/services/
 * facility-pathway-priority.ts)。表記ゆれや programs への未登録があると一致せず、
 * 想定ルートに登場した窓口が施設一覧の優先表示から漏れる(過去に 13106-taito.yaml で
 * 実際に発生したバグ)。data/manual/README.md 執筆ルール7の「actor は programs にも
 * 同名で登録する」を機械的に担保するため、ここで survey 全体を横断してチェックする。
 */
function checkPathwayActorsHaveMatchingProgram(survey, errors) {
  if (!Array.isArray(survey.programs) || !Array.isArray(survey.supportPathways)) return;

  const programNames = new Set(
    survey.programs
      .filter((program) => isPlainObject(program) && typeof program.name === "string")
      .map((program) => program.name),
  );

  survey.supportPathways.forEach((pathway, pathwayIndex) => {
    if (!isPlainObject(pathway) || !Array.isArray(pathway.steps)) return;
    pathway.steps.forEach((step, stepIndex) => {
      if (!isPlainObject(step)) return;
      const actor = step.actor;
      if (actor === null || actor === undefined) return;
      if (typeof actor !== "string") return; // 型不正は checkPathwayStep 側で既に報告済み。
      if (!programNames.has(actor)) {
        errors.add(
          `supportPathways[${pathwayIndex}].steps[${stepIndex}].actor`,
          `"${actor}" と一致する programs の name が見つかりません(data/manual/README.md 執筆ルール7を参照)。表記ゆれがないか確認するか、programs に同名エントリを追加してください。`,
        );
      }
    });
  });
}

function hasLicensedSource(entries) {
  return entries.some((entry) => isPlainObject(entry)
    && Array.isArray(entry.sources)
    && entry.sources.some((source) => isPlainObject(source) && typeof source.license === "string" && source.license.length > 0));
}

function hasMetroEdJpSource(pathway) {
  if (!isPlainObject(pathway)) return false;
  if (typeof pathway.url === "string" && pathway.url.includes("metro.ed.jp")) return true;
  return Array.isArray(pathway.sources)
    && pathway.sources.some((source) => isPlainObject(source) && typeof source.url === "string" && source.url.includes("metro.ed.jp"));
}

/** licenseAudit と、監査対象データが実際に存在するかの整合性を検証する。 */
export function checkLicenseAudit(survey, errors) {
  // schema.ts の SurveyStatusSchema.default("full_survey") と同じ既定値を適用する。
  const surveyStatus = survey.surveyStatus ?? "full_survey";
  checkEnum(surveyStatus, "surveyStatus", errors, SURVEY_STATUSES);

  const audit = survey.licenseAudit;
  if (!isPlainObject(audit)) {
    errors.add("licenseAudit", "licenseAudit is required");
    return;
  }

  checkString(audit.auditedOn, "licenseAudit.auditedOn", errors, {
    regex: DATE_RE,
    regexMessage: "auditedOn は YYYY-MM-DD形式である必要があります。",
  });
  for (const key of ["schoolClassData", "consultationWindowData", "zoningData", "highSchoolData"]) {
    checkEnum(audit[key], `licenseAudit.${key}`, errors, LICENSE_STATUSES);
  }
  checkString(audit.note, "licenseAudit.note", errors, { optional: true });

  const schools = [...(Array.isArray(survey.elementarySchools) ? survey.elementarySchools : []), ...(Array.isArray(survey.juniorHighSchools) ? survey.juniorHighSchools : [])];
  const fixedClassSchools = schools.filter((school) => isPlainObject(school) && Array.isArray(school.fixedClasses) && school.fixedClasses.length > 0);
  const schoolsWithClassData = schools.filter((school) => isPlainObject(school) && ((Array.isArray(school.fixedClasses) && school.fixedClasses.length > 0) || school.resourceRoom !== undefined));
  const programs = Array.isArray(survey.programs) ? survey.programs.filter(isPlainObject) : [];
  const zoningPrograms = programs.filter((program) => program.category === "special_needs_school_zoning");
  const consultationPrograms = programs.filter((program) => program.category !== "special_needs_school_zoning");
  const specialNeedsSchools = Array.isArray(survey.specialNeedsSchools) ? survey.specialNeedsSchools.filter(isPlainObject) : [];
  const schoolsWithZoning = specialNeedsSchools.filter((school) => typeof school.zoningNote === "string" && school.zoningNote.length > 0);
  const supportPathways = Array.isArray(survey.supportPathways) ? survey.supportPathways.filter(isPlainObject) : [];
  const resultsGuideNotes = Array.isArray(survey.resultsGuideNotes) ? survey.resultsGuideNotes.filter(isPlainObject) : [];
  const classOrganization = Array.isArray(survey.classOrganization) ? survey.classOrganization.filter(isPlainObject) : [];
  const highSchoolPathways = Array.isArray(survey.highSchoolPathways) ? survey.highSchoolPathways.filter(isPlainObject) : [];
  const hasConsultationWindowData = consultationPrograms.length + supportPathways.length + resultsGuideNotes.length > 0
    || survey.schoolBoundaryFlexibility !== undefined && survey.schoolBoundaryFlexibility !== null
    || survey.hazardMap !== undefined && survey.hazardMap !== null;

  if (surveyStatus !== "license_research_only") {
    const scopeChecks = [
      ["zoningData", schoolsWithZoning.length + zoningPrograms.length > 0],
      ["schoolClassData", schoolsWithClassData.length > 0 || classOrganization.length > 0],
      ["consultationWindowData", hasConsultationWindowData],
      ["highSchoolData", highSchoolPathways.some(hasMetroEdJpSource)],
    ];
    for (const [key, hasData] of scopeChecks) {
      if (hasData && audit[key] === "not_applicable") {
        errors.add(`licenseAudit.${key}`, `${key} は該当データが存在するため not_applicable にできません。`);
      }
      if (!hasData && audit[key] !== "not_applicable") {
        errors.add(`licenseAudit.${key}`, `${key} は該当データがないため not_applicable である必要があります。`);
      }
    }

    const ccbyScopes = {
      schoolClassData: fixedClassSchools,
      consultationWindowData: [...consultationPrograms, ...supportPathways, ...resultsGuideNotes],
      zoningData: [...schoolsWithZoning, ...zoningPrograms],
      highSchoolData: highSchoolPathways,
    };
    for (const [key, entries] of Object.entries(ccbyScopes)) {
      if (audit[key] === "ccby_replaced" && !hasLicensedSource(entries)) {
        errors.add(`licenseAudit.${key}`, "ccby_replaced ですが license 付き出典が見つかりません。");
      }
    }
  }

  const statuses = [audit.schoolClassData, audit.consultationWindowData, audit.zoningData, audit.highSchoolData];
  if (statuses.includes("permission_granted") && (typeof audit.note !== "string" || audit.note.length === 0)) {
    errors.add("licenseAudit.note", "permission_granted の場合は許諾日・許諾元を note に記録する必要があります。");
  }
  for (const key of ["schoolClassData", "consultationWindowData", "zoningData", "highSchoolData"]) {
    if (audit[key] === "permission_denied") {
      console.warn(`${survey.municipalityCode ?? "(自治体コード不明)"}: licenseAudit.${key} は permission_denied です。該当セクションの値の削除または代替データへの差し替えが必要です。`);
    }
  }
}

/**
 * data/manual/schema/municipality.schema.ts の MunicipalitySurveySchema に対応する検証。
 * 違反があれば人間可読なエラーメッセージの配列を返す(空配列ならPASS)。
 */
export function validateMunicipalitySurvey(survey) {
  const errors = new ErrorCollector();
  if (!isPlainObject(survey)) {
    errors.add("", "YAMLのトップレベルはオブジェクト(マップ)である必要があります。");
    return errors.errors;
  }

  checkString(survey.municipalityCode, "municipalityCode", errors, {
    regex: MUNICIPALITY_CODE_RE,
    regexMessage: "municipalityCode は5桁の数字(例: 13106)である必要があります。",
  });
  checkString(survey.municipalityName, "municipalityName", errors, { minLength: 1 });
  if (survey.prefecture !== "東京都") {
    errors.add("prefecture", `"東京都" である必要があります(実際: ${JSON.stringify(survey.prefecture)})。`);
  }
  checkString(survey.surveyDate, "surveyDate", errors, {
    regex: DATE_RE,
    regexMessage: "surveyDate は YYYY-MM-DD形式である必要があります。",
  });
  checkLicenseAudit(survey, errors);
  checkPositiveInt(survey.population, "population", errors);
  checkPositiveInt(survey.households, "households", errors);

  if (checkArray(survey.representativeStations, "representativeStations", errors, { optional: true })) {
    survey.representativeStations.forEach((station, index) => checkString(station, `representativeStations[${index}]`, errors));
  }
  if (checkArray(survey.elementarySchools, "elementarySchools", errors, { optional: true })) {
    survey.elementarySchools.forEach((school, index) => checkSchool(school, `elementarySchools[${index}]`, errors));
  }
  if (checkArray(survey.juniorHighSchools, "juniorHighSchools", errors, { optional: true })) {
    survey.juniorHighSchools.forEach((school, index) => checkSchool(school, `juniorHighSchools[${index}]`, errors));
  }
  if (checkArray(survey.clinics, "clinics", errors, { optional: true })) {
    survey.clinics.forEach((clinic, index) => checkClinic(clinic, `clinics[${index}]`, errors));
  }
  if (checkArray(survey.programs, "programs", errors, { optional: true })) {
    survey.programs.forEach((program, index) => checkProgram(program, `programs[${index}]`, errors));
  }
  if (checkArray(survey.classOrganization, "classOrganization", errors, { optional: true })) {
    survey.classOrganization.forEach((organization, index) => checkClassOrganization(organization, `classOrganization[${index}]`, errors));
  }
  if (checkArray(survey.highSchoolPathways, "highSchoolPathways", errors, { optional: true })) {
    survey.highSchoolPathways.forEach((pathway, index) => checkHighSchoolPathway(pathway, `highSchoolPathways[${index}]`, errors));
  }
  if (survey.schoolBoundaryFlexibility !== undefined) {
    checkSchoolBoundaryFlexibility(survey.schoolBoundaryFlexibility, "schoolBoundaryFlexibility", errors);
  }
  if (survey.hazardMap !== undefined) checkHazardMap(survey.hazardMap, "hazardMap", errors);
  if (checkArray(survey.specialNeedsSchools, "specialNeedsSchools", errors, { optional: true })) {
    survey.specialNeedsSchools.forEach((school, index) => checkSpecialNeedsSchool(school, `specialNeedsSchools[${index}]`, errors));
  }
  if (checkArray(survey.supportPathways, "supportPathways", errors, { optional: true })) {
    survey.supportPathways.forEach((pathway, index) => checkSupportPathway(pathway, `supportPathways[${index}]`, errors));
  }
  checkPathwayActorsHaveMatchingProgram(survey, errors);
  if (checkArray(survey.limitations, "limitations", errors, { optional: true })) {
    survey.limitations.forEach((limitation, index) => checkString(limitation, `limitations[${index}]`, errors));
  }

  return errors.errors;
}

async function resolveTargets(args) {
  if (args.length > 0) return args.map((arg) => resolve(arg));
  const entries = await readdir(defaultDir);
  return entries
    .filter((entry) => entry.endsWith(".yaml"))
    .sort()
    .map((entry) => join(defaultDir, entry));
}

async function main() {
  const targets = await resolveTargets(process.argv.slice(2));
  if (targets.length === 0) {
    console.error(`検証対象のYAMLファイルが見つかりません: ${defaultDir}`);
    process.exitCode = 1;
    return;
  }

  let hasFailure = false;
  for (const target of targets) {
    const label = relative(projectRoot, target);
    let survey;
    try {
      // maxAliasCount: 自治体YAMLは同一出典(sources)をYAMLアンカー/エイリアスで多数の学校間で
      // 使い回す(例: 13201-hachioji.yaml は学校数が多く500件超の参照になる)。既定の100件制限は
      // 外部の未信頼YAML向けのリソース枯渇対策であり、本リポジトリでレビュー済みの自前データには
      // 過剰に厳しいため、上限を引き上げる(無効化はしない)。
      survey = YAML.parse(await readFile(target, "utf8"), { maxAliasCount: 2000 });
    } catch (error) {
      hasFailure = true;
      console.error(`✗ ${label}`);
      console.error(`  - YAMLのパースに失敗しました: ${error instanceof Error ? error.message : error}`);
      continue;
    }

    const violations = validateMunicipalitySurvey(survey);
    if (violations.length > 0) {
      hasFailure = true;
      console.error(`✗ ${label}`);
      for (const violation of violations) console.error(`  - ${violation}`);
    } else {
      console.log(`✓ ${label}`);
    }
  }

  if (hasFailure) process.exitCode = 1;
}

// テスト(vitest)からこのファイルを import した際に CLI 実行(main）が
// 副作用として走らないよう、直接実行されたときのみ起動するガード。
const isDirectlyExecuted = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (isDirectlyExecuted) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
