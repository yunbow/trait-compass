#!/usr/bin/env node
/**
 * data/manual/municipalities/*.yaml を D1 に投入する汎用スクリプト。
 *
 * TypeScript の MunicipalitySurveySchema は Node が .ts を直接 import できないため、
 * ここでは依存を増やさない必須フィールドの実行時チェックを行う。完全なスキーマ検証は
 * TypeScript 側の data/manual/schema/municipality.schema.ts を正とする。
 */
import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";
import { geocodeAddressesThrottled } from "../ingest/geocoding.mjs";
import { PUBLISHABLE_LICENSE_STATUSES, validateMunicipalitySurvey } from "./validate-manual.mjs";

// npm scripts resolve `wrangler` through node_modules/.bin. Resolve that same
// project-local executable explicitly because this script can also run via node.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const wranglerPath = join(projectRoot, "node_modules", ".bin", "wrangler");

export const CATEGORY_TYPES = {
  school_consultation: "相談窓口",
  counseling: "相談窓口",
  day_service_directory: "福祉ガイド",
  medical_expense_subsidy: "支援制度",
  housing_support: "支援制度",
  high_school_pathway: "福祉ガイド",
  ict_environment: "福祉ガイド",
  special_needs_school_zoning: "福祉ガイド",
  other: "福祉ガイド",
};

const value = (input) => {
  if (input === undefined || input === null) return "NULL";
  if (typeof input === "number") return String(input);
  return `'${String(input).replaceAll("'", "''")}'`;
};
const json = (input) => JSON.stringify(input ?? []);
export const idFor = (...parts) => `${parts[0]}-${createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 16)}`;
const bool = (input) => (input ? 1 : 0);

export function assertSurvey(survey) {
  const required = ["municipalityCode", "municipalityName", "surveyDate"];
  if (!survey || typeof survey !== "object" || required.some((key) => !survey[key])) {
    throw new Error(`YAML に必須フィールド ${required.join(", ")} がありません。`);
  }
  if (!/^\d{5}$/.test(survey.municipalityCode)) {
    throw new Error(`municipalityCode は5桁の数字である必要があります: ${survey.municipalityCode}`);
  }
  for (const key of ["elementarySchools", "juniorHighSchools", "programs", "classOrganization", "highSchoolPathways", "specialNeedsSchools", "supportPathways", "resultsGuideNotes"]) {
    if (survey[key] !== undefined && !Array.isArray(survey[key])) throw new Error(`${key} は配列である必要があります。`);
  }
}

export function isPhoneNumber(contact) {
  return /^[\d\s()+－ー-]+$/.test(contact) && /\d/.test(contact);
}

export async function geocodeSurvey(survey, options = {}) {
  const elementarySchools = survey.elementarySchools ?? [];
  const juniorHighSchools = survey.juniorHighSchools ?? [];
  const programs = survey.programs ?? [];
  const targets = [
    ...elementarySchools.flatMap((school, index) => school.address && school.lat == null && school.lng == null ? [{ id: `elementary-${index}`, address: school.address }] : []),
    ...juniorHighSchools.flatMap((school, index) => school.address && school.lat == null && school.lng == null ? [{ id: `junior_high-${index}`, address: school.address }] : []),
    ...programs.flatMap((program, index) => program.address && program.lat == null && program.lng == null ? [{ id: `program-${index}`, address: program.address }] : []),
  ];
  if (targets.length === 0) return { ...survey, elementarySchools, juniorHighSchools, programs };

  const outcomes = await geocodeAddressesThrottled(targets, options);
  const latLngById = new Map(outcomes.map(({ id, latLng }) => [id, latLng]));
  const applyOutcomes = (entries, level) => entries.map((entry, index) => {
    const latLng = latLngById.get(`${level}-${index}`);
    return latLng ? { ...entry, lat: latLng.lat, lng: latLng.lng } : entry;
  });
  return {
    ...survey,
    elementarySchools: applyOutcomes(elementarySchools, "elementary"),
    juniorHighSchools: applyOutcomes(juniorHighSchools, "junior_high"),
    programs: applyOutcomes(programs, "program"),
  };
}

function insert(table, columns, row) {
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${row.map(value).join(", ")});`;
}

export function buildSql(survey, options = {}) {
  const municipality = survey.municipalityName;
  const municipalityCode = survey.municipalityCode;
  const datasetId = `ds-${survey.municipalityCode}-manual-survey-programs`;
  // D1リモートは明示的な BEGIN TRANSACTION/SAVEPOINT を許可しない
  // (`state.storage.transaction()` を使うようエラーで案内される。--fileの内容は
  // wrangler d1 execute が1バッチとして送るため、明示トランザクション文は不要)。
  const lines = ["PRAGMA foreign_keys = ON;"];
  const includeRestricted = options.includeRestricted ?? false;
  const audit = survey.licenseAudit;
  const isIncluded = (key) => includeRestricted || !audit || PUBLISHABLE_LICENSE_STATUSES.includes(audit[key]);
  const includeSchoolClassData = isIncluded("schoolClassData");
  const includeConsultationWindowData = isIncluded("consultationWindowData");
  const includeZoningData = isIncluded("zoningData");
  const includeHighSchoolData = isIncluded("highSchoolData");
  const excluded = [];
  const reportExclusion = (section, status, count) => {
    if (count > 0) excluded.push(`${municipalityCode} ${section} (${status}): 約${count}行を除外`);
  };

  // 子テーブルから削除し、自治体単位で再取込可能にする。
  lines.push(
    `DELETE FROM school_fixed_classes WHERE school_id IN (SELECT id FROM schools WHERE municipality_code = ${value(municipalityCode)});`,
    `DELETE FROM school_resource_rooms WHERE school_id IN (SELECT id FROM schools WHERE municipality_code = ${value(municipalityCode)});`,
    `DELETE FROM schools WHERE municipality_code = ${value(municipalityCode)};`,
    `DELETE FROM high_school_pathways WHERE municipality_code = ${value(municipalityCode)};`,
    `DELETE FROM class_organizations WHERE municipality_code = ${value(municipalityCode)};`,
    `DELETE FROM special_needs_schools WHERE municipality_code = ${value(municipalityCode)};`,
    `DELETE FROM support_pathway_steps WHERE pathway_id IN (SELECT id FROM support_pathways WHERE municipality_code = ${value(municipalityCode)});`,
    `DELETE FROM support_pathways WHERE municipality_code = ${value(municipalityCode)};`,
    `DELETE FROM results_guide_notes WHERE municipality_code = ${value(municipalityCode)};`,
    `DELETE FROM municipality_survey_meta WHERE municipality_code = ${value(municipalityCode)};`,
    // 2026-08是正(外部コードレビュー指摘 P0-4): facility_tags(facility_id に外部キー制約あり)を
    // 削除しないまま facilities を削除していたため、この自治体のプログラムに facility_tags が
    // 1件でも投入されていると PRAGMA foreign_keys = ON(このファイル冒頭)により再投入自体が
    // 外部キー制約違反で失敗していた。ingest-open-data.mjs の DELETE→INSERT パターンと同じく、
    // facilities より先に facility_tags を削除する。
    `DELETE FROM facility_tags WHERE facility_id IN (SELECT id FROM facilities WHERE dataset_id = ${value(datasetId)});`,
    `DELETE FROM facilities WHERE dataset_id = ${value(datasetId)};`,
    `DELETE FROM datasets WHERE id = ${value(datasetId)};`,
  );

  for (const [level, schools] of [["elementary", survey.elementarySchools ?? []], ["junior_high", survey.juniorHighSchools ?? []]]) {
    for (const school of schools) {
      if (!school.name) throw new Error(`${level} の学校名がありません。`);
      const schoolId = idFor(survey.municipalityCode, level, school.name);
      lines.push(insert("schools", ["id", "municipality", "municipality_code", "level", "name", "area_hint", "address", "url", "phone", "lat", "lng", "district_note", "sources_json"], [schoolId, municipality, municipalityCode, level, school.name, school.areaHint, school.address, school.url, school.phone, school.lat, school.lng, school.districtNote, json(school.sources)]));
      if (includeSchoolClassData) for (const [index, fixedClass] of (school.fixedClasses ?? []).entries()) {
        lines.push(insert("school_fixed_classes", ["id", "school_id", "disability_type", "class_name", "class_count", "capacity", "status", "note", "sources_json"], [idFor(schoolId, "fixed-class", String(index)), schoolId, fixedClass.disabilityType, fixedClass.className, fixedClass.classCount, fixedClass.capacity, fixedClass.status ?? "confirmed", fixedClass.note, fixedClass.sources ? json(fixedClass.sources) : null]));
      }
      if (includeSchoolClassData && school.resourceRoom) {
        const room = school.resourceRoom;
        lines.push(insert("school_resource_rooms", ["school_id", "has_resource_room", "is_hub_school", "hub_school_name", "group_name", "operation_mode"], [schoolId, bool(room.hasResourceRoom), bool(room.isHubSchool), room.hubSchoolName, room.groupName, room.operationMode]));
      }
    }
  }

  if (includeHighSchoolData) for (const [index, pathway] of (survey.highSchoolPathways ?? []).entries()) {
    lines.push(insert("high_school_pathways", ["id", "municipality", "municipality_code", "name", "pathway_type", "prefecture", "address", "url", "phone", "nearest_station", "estimated_commute_minutes", "commute_rating", "commute_note", "sources_json"], [idFor(survey.municipalityCode, "pathway", pathway.name, String(index)), municipality, municipalityCode, pathway.name, pathway.pathwayType, pathway.prefecture, pathway.address, pathway.url, pathway.phone, pathway.nearestStation, pathway.estimatedCommuteMinutes, pathway.commuteRating, pathway.commuteNote, json(pathway.sources)]));
  }
  if (includeSchoolClassData) for (const [index, organization] of (survey.classOrganization ?? []).entries()) {
    lines.push(insert("class_organizations", ["id", "municipality", "municipality_code", "level", "judgement", "rationale", "sources_json"], [idFor(survey.municipalityCode, "organization", organization.level, String(index)), municipality, municipalityCode, organization.level, organization.judgement, organization.rationale, organization.sources ? json(organization.sources) : null]));
  }
  for (const [index, school] of (survey.specialNeedsSchools ?? []).entries()) {
    lines.push(insert("special_needs_schools", ["id", "municipality", "municipality_code", "name", "disability_types_json", "levels_json", "address", "is_in_municipality", "zoning_note", "sources_json"], [idFor(survey.municipalityCode, "special-needs", school.name, String(index)), municipality, municipalityCode, school.name, json(school.disabilityTypes), json(school.levels), school.address, bool(school.isInMunicipality ?? true), includeZoningData ? school.zoningNote : null, json(school.sources)]));
  }

  // 想定ルート(supportPathways)。1エントリの lifestages が複数ライフステージにまたがる場合は、
  // municipality/lifestage/purpose_id で一意に引けるようライフステージごとに1行へ展開する。
  if (includeConsultationWindowData) for (const pathway of survey.supportPathways ?? []) {
    for (const lifestage of pathway.lifestages) {
      const pathwayId = idFor(survey.municipalityCode, "support-pathway", lifestage, pathway.purposeId);
      lines.push(insert("support_pathways", ["id", "municipality", "municipality_code", "lifestage", "purpose_id", "purpose_label", "status", "sources_json"], [pathwayId, municipality, municipalityCode, lifestage, pathway.purposeId, pathway.purposeLabel, pathway.status ?? "confirmed", json(pathway.sources)]));
      for (const [stepIndex, step] of pathway.steps.entries()) {
        const stepId = idFor(pathwayId, "step", String(stepIndex));
        lines.push(insert("support_pathway_steps", ["id", "pathway_id", "step_order", "title", "actor", "contact", "is_conditional", "note", "sources_json"], [stepId, pathwayId, step.order, step.title, step.actor, step.contact, bool(step.isConditional), step.note, step.sources ? json(step.sources) : null]));
      }
    }
  }

  // 支援検索結果画面「1分でわかるガイド」の自治体固有補足(resultsGuideNotes)。
  if (includeConsultationWindowData) for (const note of survey.resultsGuideNotes ?? []) {
    const noteId = idFor(survey.municipalityCode, "results-guide-note", note.tab);
    lines.push(insert("results_guide_notes", ["id", "municipality", "municipality_code", "tab", "body_json", "sources_json"], [noteId, municipality, municipalityCode, note.tab, json(note.body), json(note.sources)]));
  }

  // license_audit_json はゲーティング対象の実データではなく「除外理由」を伝えるための
  // メタ情報のため、includeX フラグに関わらず常に investigate 側(audit)の値をそのまま入れる
  // (内部の調査経緯を含み得る note は除外し、4ステータス値のみ保持する)。
  const licenseAuditJson = audit
    ? json({
        schoolClassData: audit.schoolClassData,
        consultationWindowData: audit.consultationWindowData,
        zoningData: audit.zoningData,
        highSchoolData: audit.highSchoolData,
      })
    : null;
  lines.push(`INSERT INTO municipality_survey_meta (municipality_code, municipality, survey_date, population, households, representative_stations_json, hazard_map_json, school_boundary_flexibility_json, limitations_json, license_audit_json) VALUES (${[survey.municipalityCode, municipality, survey.surveyDate, survey.population, survey.households, json(survey.representativeStations), includeConsultationWindowData && survey.hazardMap ? json(survey.hazardMap) : null, includeConsultationWindowData && survey.schoolBoundaryFlexibility ? json(survey.schoolBoundaryFlexibility) : null, json(survey.limitations), licenseAuditJson].map(value).join(", ")}) ON CONFLICT(municipality_code) DO UPDATE SET municipality = excluded.municipality, survey_date = excluded.survey_date, population = excluded.population, households = excluded.households, representative_stations_json = excluded.representative_stations_json, hazard_map_json = excluded.hazard_map_json, school_boundary_flexibility_json = excluded.school_boundary_flexibility_json, limitations_json = excluded.limitations_json, license_audit_json = excluded.license_audit_json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');`);

  const fetchedAt = `${survey.surveyDate}T00:00:00.000Z`;
  lines.push(insert("datasets", ["id", "ckan_package_id", "title", "source_org", "license", "risk_level", "source_url", "fetched_at", "is_alive", "frozen"], [datasetId, null, `${municipality} 手動調査データ(相談・制度)`, municipality, "manual-fact-verified", "low", null, fetchedAt, 1, 0]));
  for (const program of survey.programs ?? []) {
    const isZoningProgram = program.category === "special_needs_school_zoning";
    if ((isZoningProgram && !includeZoningData) || (!isZoningProgram && !includeConsultationWindowData)) continue;
    const contact = program.contact ?? null;
    const phone = contact && isPhoneNumber(contact) ? contact : null;
    const contactMethods = contact && !phone ? contact : null;
    // 2026-08是正(外部コードレビュー指摘 P0-4): 配列indexをIDに含めていたため、YAML内の
    // programs の並べ替え・前方エントリのコメントアウト/削除だけで、内容が変わっていない
    // プログラムのIDが変わってしまい、facility_tags の手動キュレーション(consultation-desk-
    // tags.sql 等)が指すIDが静かに失効していた。名称・分類・住所というプログラムの内容自体で
    // ハッシュすることで、並べ替えに対して安定させる(name+category+address が完全に同じ
    // プログラムが2件ある場合のみ衝突するが、それは実質的に重複データであり、他の投入経路
    // (idFor(datasetId, name, address) を使う ingest-open-data.mjs 等)と同じ設計判断)。
    const programId = idFor(survey.municipalityCode, "program", program.category, program.name, program.address ?? "");
    lines.push(insert("facilities", ["id", "dataset_id", "name", "category_type", "municipality", "municipality_code", "address", "phone", "age_range", "is_medical", "description", "contact_methods", "raw_json", "lat", "lng"], [programId, datasetId, program.name, CATEGORY_TYPES[program.category] ?? CATEGORY_TYPES.other, municipality, municipalityCode, program.address ?? null, phone, "both", 0, program.description, contactMethods, json(program), program.lat ?? null, program.lng ?? null]));
  }

  if (!includeSchoolClassData) {
    const schools = [...(survey.elementarySchools ?? []), ...(survey.juniorHighSchools ?? [])];
    reportExclusion("schoolClassData", audit?.schoolClassData, schools.reduce((count, school) => count + (school.fixedClasses?.length ?? 0) + (school.resourceRoom ? 1 : 0), 0) + (survey.classOrganization?.length ?? 0));
  }
  if (!includeConsultationWindowData) {
    const programCount = (survey.programs ?? []).filter((program) => program.category !== "special_needs_school_zoning").length;
    const pathwayCount = (survey.supportPathways ?? []).reduce((count, pathway) => count + (pathway.lifestages?.length ?? 0) + (pathway.steps?.length ?? 0), 0);
    reportExclusion("consultationWindowData", audit?.consultationWindowData, programCount + pathwayCount + (survey.resultsGuideNotes?.length ?? 0) + (survey.schoolBoundaryFlexibility ? 1 : 0) + (survey.hazardMap ? 1 : 0));
  }
  if (!includeZoningData) {
    const zoningNotes = (survey.specialNeedsSchools ?? []).filter((school) => school.zoningNote !== undefined).length;
    const zoningPrograms = (survey.programs ?? []).filter((program) => program.category === "special_needs_school_zoning").length;
    reportExclusion("zoningData", audit?.zoningData, zoningNotes + zoningPrograms);
  }
  if (!includeHighSchoolData) {
    reportExclusion("highSchoolData", audit?.highSchoolData, survey.highSchoolPathways?.length ?? 0);
  }
  for (const message of excluded) console.log(`RESTRICTED除外: ${message}`);

  return lines.join("\n");
}

export function parseCliArgs(args) {
  const [inputPath, ...flags] = args;
  const allowedFlags = ["--local", "--remote", "--geocode", "--include-restricted"];
  if (!inputPath || flags.some((flag) => !allowedFlags.includes(flag)) || (flags.includes("--local") && flags.includes("--remote"))) {
    throw new Error("使い方: node scripts/data/ingest-manual-survey.mjs <YAMLファイル> [--local|--remote] [--geocode] [--include-restricted (--localのみ)]");
  }
  if (flags.includes("--remote") && flags.includes("--include-restricted")) {
    throw new Error("--remoteでは--include-restrictedを使用できません。");
  }
  return { inputPath, flags, target: flags.includes("--remote") ? "--remote" : "--local" };
}

export async function main(args = process.argv.slice(2)) {
  const { inputPath, flags, target } = parseCliArgs(args);
  // maxAliasCount: validate-manual.mjs と同じ理由(学校数の多い自治体はsourcesのアンカー/エイリアス
  // 参照が既定の100件制限を超えるため引き上げる。対象は本リポジトリでレビュー済みの自前データのみ)。
  const survey = YAML.parse(await readFile(resolve(inputPath), "utf8"), { maxAliasCount: 2000 });
  assertSurvey(survey);
  const violations = validateMunicipalitySurvey(survey);
  if (violations.length > 0) {
    console.error(`✗ ${inputPath}`);
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
    return;
  }
  if (survey.surveyStatus === "license_research_only") {
    console.log(`スキップ: ${survey.municipalityCode} はライセンス調査のみのため投入対象外です(surveyStatus=license_research_only)。`);
    return;
  }
  let effectiveSurvey = survey;
  if (flags.includes("--geocode")) {
    const schools = [survey.elementarySchools ?? [], survey.juniorHighSchools ?? []].flat();
    const targetCount = schools.filter((school) => school.address && school.lat == null && school.lng == null).length;
    const programs = survey.programs ?? [];
    const programTargetCount = programs.filter((program) => program.address && program.lat == null && program.lng == null).length;
    effectiveSurvey = await geocodeSurvey(survey);
    const geocodedSchools = [effectiveSurvey.elementarySchools ?? [], effectiveSurvey.juniorHighSchools ?? []].flat();
    const filled = schools.filter((school, index) => school.address && school.lat == null && school.lng == null && geocodedSchools[index].lat != null && geocodedSchools[index].lng != null).length;
    console.log(`ジオコーディング: ${filled}/${targetCount} 件の学校に座標を付与しました。`);
    const geocodedPrograms = effectiveSurvey.programs ?? [];
    const programsFilled = programs.filter((program, index) => program.address && program.lat == null && program.lng == null && geocodedPrograms[index].lat != null && geocodedPrograms[index].lng != null).length;
    console.log(`ジオコーディング: ${programsFilled}/${programTargetCount} 件の窓口(programs)に座標を付与しました。`);
  }
  const tempFile = join(tmpdir(), `trait-compass-manual-survey-${process.pid}-${Date.now()}.sql`);
  await writeFile(tempFile, buildSql(effectiveSurvey, { includeRestricted: flags.includes("--include-restricted") }), "utf8");
  try {
    const result = spawnSync(wranglerPath, ["d1", "execute", "trait-compass", target, `--file=${tempFile}`], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  } finally {
    await unlink(tempFile).catch(() => {});
  }
}

// テスト(vitest)からこのファイルを import した際に CLI 実行(main）が
// 副作用として走らないよう、直接実行されたときのみ起動するガード。
const isDirectlyExecuted = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (isDirectlyExecuted) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
