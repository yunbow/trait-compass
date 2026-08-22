import type { D1Database } from "@cloudflare/workers-types";

import type { SchoolInfoSectionProps, LicenseAuditStatus } from "@/features/support/components/SchoolInfoSection";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import type { SourceRef } from "../../../../../data/manual/schema/municipality.schema";
import { municipalityToCode } from "@/features/support/constants/municipality-codes";
import { computeManualExpiresAt, isManualDataExpired } from "@/lib/manual-data-expiration";

type School = SchoolInfoSectionProps["schools"]["elementary"][number];
type HighSchoolPathway = SchoolInfoSectionProps["highSchoolPathways"][number];
type ClassOrganization = SchoolInfoSectionProps["classOrganizations"][number];
export type MunicipalityLicenseAuditStatus = LicenseAuditStatus;

/**
 * `fetchSchoolById` が返す、単一学校の全項目つきデータ。掲載情報の訂正・更新報告
 * (`/api/content-report`)・AskAiPanel の学校向け質問(`/api/ask`)がクライアント由来の値を
 * 信用せず送信時点のスナップショットを独立に組み立てるための再取得専用の形(`id` を必須にする
 * ほかは `fetchSchoolInfo` の一覧クエリと同じ項目集合)。`municipality` は一覧クエリ
 * (`fetchSchoolInfo`)側では呼び出し元が既に municipality を指定して絞り込んでいるため
 * `School` 型に含めていないが、`fetchSchoolById` は municipality 未指定で id のみから
 * 単一学校を再取得するため、掲載情報の訂正・更新報告(content-report)が
 * `target_snapshot_json`・`municipality` カラムを埋めるのに必要な分だけ追加する。
 */
export type SchoolWithDetails = Omit<School, "id"> & { id: string; municipality: string };

interface SchoolRow {
  id: string;
  municipality: string;
  level: "elementary" | "junior_high";
  name: string;
  area_hint: string | null;
  address: string | null;
  url: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  district_note: string | null;
  sources_json: string;
  fixed_classes_json: string | null;
  has_resource_room: number | null;
  is_hub_school: number | null;
  hub_school_name: string | null;
  group_name: string | null;
  operation_mode: "itinerant_teacher" | "student_travels_to_hub" | null;
}

const emptySchoolInfo = (): Omit<SchoolInfoSectionProps, "municipality"> => ({
  schools: { elementary: [], juniorHigh: [] },
  highSchoolPathways: [],
  classOrganizations: [],
  limitations: [],
  surveyDate: null,
  licenseAudit: null,
  expiration: null,
});

/**
 * `municipality_survey_meta.license_audit_json` を防御的にパースする。
 * 4キー(schoolClassData/consultationWindowData/zoningData/highSchoolData)いずれかが
 * 欠けている、または JSON として不正な場合は `null` を返す(バナー非表示にフォールバック)。
 */
function parseLicenseAudit(json: string | null): MunicipalityLicenseAuditStatus | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const { schoolClassData, consultationWindowData, zoningData, highSchoolData } = parsed as Record<string, unknown>;
    if (![schoolClassData, consultationWindowData, zoningData, highSchoolData].every((value) => typeof value === "string")) return null;
    return { schoolClassData, consultationWindowData, zoningData, highSchoolData } as MunicipalityLicenseAuditStatus;
  } catch {
    return null;
  }
}

/**
 * D1 の JSON カラム由来の値を `SourceRef[]` へ防御的に変換する。
 *
 * `school_fixed_classes.sources_json`(TEXT)は `json_group_array(json_object('sources',
 * fc.sources_json, ...))` で外側の `fixed_classes_json` に埋め込む際、SQLite の
 * `json_object()` に文字列値をそのまま渡すと二重エンコードされた文字列になりうる(`json()`
 * 関数で明示的にアンラップしない限り、ネストしたJSONではなく「JSON文字列を値に持つJSON文字列」
 * になりうる)。一方、`schools.sources_json`・`high_school_pathways.sources_json`・
 * `class_organizations.sources_json` は単独カラムの通常の JSON 文字列。
 * この関数は「既に配列(SQLite側の挙動次第でネスト解決されている場合)」「文字列(通常の
 * JSON文字列、または二重エンコードされた文字列)」のどちらが来ても正しく `SourceRef[]` に
 * 変換できるよう、両方のケースを吸収する防御的パーサー。パース失敗時は例外を投げず空配列に
 * フォールバックする(results-guide-notes.ts/support-pathway.ts と同じ方針)。
 */
function parseSourceRefs(value: unknown): SourceRef[] {
  if (Array.isArray(value)) return value as SourceRef[];
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as SourceRef[]) : [];
  } catch {
    return [];
  }
}

/** `fixed_classes_json`(json_group_array)1件分の生の形。`sources` は文字列/配列/nullのいずれか。 */
interface RawFixedClass {
  disabilityType: string;
  className: string | null;
  classCount: number | null;
  capacity: number | null;
  status: string;
  note: string | null;
  sources: unknown;
}

function parseFixedClasses(fixedClassesJson: string | null): School["fixedClasses"] {
  if (!fixedClassesJson) return [];
  let rawList: RawFixedClass[] = [];
  try {
    rawList = JSON.parse(fixedClassesJson) as RawFixedClass[];
  } catch {
    return [];
  }
  return rawList.map((raw) => ({
    disabilityType: raw.disabilityType,
    className: raw.className ?? undefined,
    classCount: raw.classCount ?? undefined,
    capacity: raw.capacity ?? undefined,
    status: raw.status,
    note: raw.note ?? undefined,
    sources: parseSourceRefs(raw.sources),
  })) as School["fixedClasses"];
}

function toSchool(row: SchoolRow): School {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    areaHint: row.area_hint ?? undefined,
    address: row.address ?? undefined,
    url: row.url ?? undefined,
    phone: row.phone ?? undefined,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    districtNote: row.district_note ?? undefined,
    sources: parseSourceRefs(row.sources_json),
    fixedClasses: parseFixedClasses(row.fixed_classes_json),
    resourceRoom: row.has_resource_room === null ? undefined : {
      hasResourceRoom: row.has_resource_room === 1,
      isHubSchool: row.is_hub_school === 1,
      hubSchoolName: row.hub_school_name ?? undefined,
      groupName: row.group_name ?? undefined,
      operationMode: row.operation_mode ?? undefined,
    },
  } as School;
}

const SCHOOL_ROW_SELECT = `
  SELECT s.id, s.municipality, s.level, s.name, s.area_hint, s.address, s.url, s.phone, s.lat, s.lng, s.district_note,
    s.sources_json,
    COALESCE((
      SELECT json_group_array(json_object(
        'disabilityType', fc.disability_type, 'className', fc.class_name,
        'classCount', fc.class_count, 'capacity', fc.capacity, 'status', fc.status, 'note', fc.note,
        'sources', fc.sources_json
      )) FROM school_fixed_classes fc WHERE fc.school_id = s.id
    ), '[]') AS fixed_classes_json,
    rr.has_resource_room, rr.is_hub_school, rr.hub_school_name, rr.group_name, rr.operation_mode
  FROM schools s
  LEFT JOIN school_resource_rooms rr ON rr.school_id = s.id
`;

/**
 * lifestage に応じて学校情報を絞り込む純関数(表示層のフィルタ、SQL側は変更しない)。
 * lifestage が null/未指定の場合は全件そのまま返す(既存の直リンク等との後方互換)。
 * - preschool / university-vocational / working-adult: 学校情報の対象外のため全て空にする
 * - elementary-junior-high: 小学校・中学校とその学級編制情報のみ残し、高校進学先は空にする
 * - high-school: 高校進学先のみ残し、小学校・中学校・学級編制情報は空にする
 * limitations・surveyDate は調査全体のメタ情報のためいずれの場合も維持する。
 */
export function filterSchoolInfoByLifestage(
  info: Omit<SchoolInfoSectionProps, "municipality">,
  lifestage: Lifestage | null,
): Omit<SchoolInfoSectionProps, "municipality"> {
  if (lifestage === null) return info;

  const empty = { schools: { elementary: [], juniorHigh: [] }, highSchoolPathways: [], classOrganizations: [] };

  switch (lifestage) {
    case "elementary-junior-high":
      return { ...info, highSchoolPathways: [] };
    case "high-school":
      return { ...info, schools: { elementary: [], juniorHigh: [] }, classOrganizations: [] };
    case "preschool":
    case "university-vocational":
    case "working-adult":
      return { ...info, ...empty };
  }
}

/** 手動調査テーブルから、学校情報画面に必要な表示用データを取得する。 */
export async function fetchSchoolInfo(
  db: D1Database,
  municipality: string,
): Promise<Omit<SchoolInfoSectionProps, "municipality">> {
  const empty = emptySchoolInfo();
  const code = municipalityToCode(municipality) ?? "";
  const [schoolResult, pathwayResult, organizationResult, metaResult] = await Promise.all([
    db.prepare(`${SCHOOL_ROW_SELECT} WHERE s.municipality_code = ? ORDER BY s.level, s.name`).bind(code).all<SchoolRow>(),
    db.prepare(`SELECT name, pathway_type, prefecture, address, url, phone, nearest_station, estimated_commute_minutes, commute_rating, commute_note, sources_json FROM high_school_pathways WHERE municipality_code = ? ORDER BY name`).bind(code).all<{
      name: string; pathway_type: HighSchoolPathway["pathwayType"]; prefecture: string | null; address: string | null; url: string | null; phone: string | null; nearest_station: string | null; estimated_commute_minutes: number | null; commute_rating: HighSchoolPathway["commuteRating"] | null; commute_note: string | null; sources_json: string | null;
    }>(),
    db.prepare(`SELECT level, judgement, rationale, sources_json FROM class_organizations WHERE municipality_code = ? ORDER BY level`).bind(code).all<{
      level: ClassOrganization["level"]; judgement: ClassOrganization["judgement"]; rationale: string; sources_json: string | null;
    }>(),
    db.prepare(`SELECT survey_date, limitations_json, license_audit_json FROM municipality_survey_meta WHERE municipality_code = ?`).bind(code).first<{
      survey_date: string; limitations_json: string | null; license_audit_json: string | null;
    }>(),
  ]);

  for (const row of schoolResult.results ?? []) {
    const school = toSchool(row);
    if (row.level === "elementary") empty.schools.elementary.push(school);
    else empty.schools.juniorHigh.push(school);
  }
  empty.highSchoolPathways = (pathwayResult.results ?? []).map((row) => ({
    name: row.name, pathwayType: row.pathway_type, prefecture: row.prefecture ?? undefined,
    address: row.address ?? undefined, url: row.url ?? undefined, phone: row.phone ?? undefined, nearestStation: row.nearest_station ?? undefined,
    estimatedCommuteMinutes: row.estimated_commute_minutes ?? undefined,
    commuteRating: row.commute_rating ?? undefined, commuteNote: row.commute_note ?? undefined,
    sources: parseSourceRefs(row.sources_json),
  }));
  empty.classOrganizations = (organizationResult.results ?? []).map((row) => ({
    level: row.level,
    judgement: row.judgement,
    rationale: row.rationale,
    sources: row.sources_json === null ? undefined : parseSourceRefs(row.sources_json),
  }));
  empty.surveyDate = metaResult?.survey_date ?? null;
  if (metaResult?.limitations_json) {
    try { empty.limitations = JSON.parse(metaResult.limitations_json); } catch { empty.limitations = []; }
  }
  empty.licenseAudit = parseLicenseAudit(metaResult?.license_audit_json ?? null);
  // 手動調査データの有効期限365日(src/lib/manual-data-expiration.ts、2026-08是正)。
  // survey_date は datasets.fetched_at と同じ変換パターン(`${surveyDate}T00:00:00.000Z`、
  // batch/scripts/ingest-manual-survey.mjs 参照)で ISO 8601 化してから判定する。
  // municipality_survey_meta 行自体が無い(調査対象外の自治体)場合は expiration も null のまま。
  if (metaResult?.survey_date) {
    const fetchedAt = `${metaResult.survey_date}T00:00:00.000Z`;
    empty.expiration = { expiresAt: computeManualExpiresAt(fetchedAt), isExpired: isManualDataExpired(fetchedAt) };
  }
  return empty;
}

/**
 * 手動調査データの有効期限切れ(`expiration.isExpired`)を検知した際、学校・高校進学先・
 * 学級編制情報・データの限界を空にする表示層の純関数(2026-08是正、TICKET-未採番)。
 * `surveyDate`・`licenseAudit`・`expiration` はバナー表示に必要なため維持する
 * (`filterSchoolInfoByLifestage` と同じ「表示層の純関数フィルタ」パターン)。
 * `expiration.isExpired` は `fetchSchoolInfo` が取得時点の現在時刻で計算済みのため、この
 * 関数自体は日時計算を行わない(`now` は他の純関数群とのシグネチャ一貫性のための予約引数)。
 */
export function hideExpiredSchoolInfo(
  info: Omit<SchoolInfoSectionProps, "municipality">,
  _now: Date = new Date(),
): Omit<SchoolInfoSectionProps, "municipality"> {
  if (!info.expiration?.isExpired) return info;

  return {
    ...info,
    schools: { elementary: [], juniorHigh: [] },
    highSchoolPathways: [],
    classOrganizations: [],
    limitations: [],
  };
}

/**
 * 学校情報を id(schools.id)から直接再取得する。
 * 掲載情報の訂正・更新報告(`/api/content-report`)・AskAiPanel の学校向け質問(`/api/ask`)が
 * クライアント由来の値を信用せず、送信時点のスナップショットをサーバー側で独立に組み立てるために
 * 使う(facility-report の `fetchFacilityById`・support-pathway.ts の `fetchSupportPathwayById`
 * と同じ設計判断)。該当データが無い場合は `null` を返す。
 */
export async function fetchSchoolById(db: D1Database, schoolId: string): Promise<SchoolWithDetails | null> {
  const row = await db.prepare(`${SCHOOL_ROW_SELECT} WHERE s.id = ?`).bind(schoolId).first<SchoolRow>();
  if (!row) return null;
  return { ...toSchool(row), municipality: row.municipality } as SchoolWithDetails;
}
