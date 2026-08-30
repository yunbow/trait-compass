// data/manual/municipalities/*.yaml のスキーマ定義。
//
// 用途: scripts/data/validate-manual.mjs(未実装)から、YAMLをパースした後この
// スキーマで検証する。アプリの db/schema.sql とは独立した「調査データの正」であり、
// DB投入用の facilities 形式への変換は scripts/data/build-processed.mjs 側で行う。

import { z } from "zod";

/** 一次情報で確認済みか、未確認(電話照会等が必要)かを区別する。推測値は入れない。 */
export const ConfirmationStatusSchema = z.enum(["confirmed", "unconfirmed", "phone_required"]);
export type ConfirmationStatus = z.infer<typeof ConfirmationStatusSchema>;

/** facilities.age_range(app/db/schema.sql)に対応する対象年齢の粗い区分。 */
export const ProgramAgeRangeSchema = z.enum(["child", "adult", "both"]);
export type ProgramAgeRange = z.infer<typeof ProgramAgeRangeSchema>;

/**
 * facilities.lifestage_min/max(migration 0016)に対応する対象ライフステージ値。
 * 語彙は app/src/features/support/services/lifestage-mapping.ts の LIFESTAGE_VALUES と
 * 同じ(data/manual/schema は app/src に依存しない設計のため、ここで値を再定義して同期させる。
 * 並び順・値の一致は batch/scripts/__tests__/ingest-manual-survey.test.ts のパリティテストで
 * 担保する)。
 */
export const ProgramLifestageSchema = z.enum([
  "preschool",
  "elementary-junior-high",
  "high-school",
  "university-vocational",
  "working-adult",
]);
export type ProgramLifestage = z.infer<typeof ProgramLifestageSchema>;

/**
 * 許諾・ライセンス状態(2026-08-10 事務局新方針対応)。
 * - ccby_replaced: CC BY等の代替公式データへ差し替え完了(値・sourcesとも)。投入・公開可
 * - ccby_available: 代替CC BYデータの存在は確認済みだが差し替え未実施。現在の値は
 *   自治体サイト転記のままのため、投入・公開は不可(RESTRICTED扱い)
 * - permission_pending: 自治体へ許諾申請中または未申請。既定でD1投入除外・公開除外
 * - permission_granted: 自治体から許諾取得済み(noteに許諾日・許諾元を必須記録)。投入・公開可
 * - permission_denied: 許諾拒否。投入・公開不可(恒久)。代替データへの差し替えのみ解消手段
 * - tokyo_restricted: 東京都保有データ。事務局方針により申請せずダミー化/除外(恒久)
 * - not_applicable: 該当データがこのファイルに存在しない
 */
export const LicenseStatusSchema = z.enum([
  "ccby_replaced",
  "ccby_available",
  "permission_pending",
  "permission_granted",
  "permission_denied",
  "tokyo_restricted",
  "not_applicable",
]);
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

/** D1投入(--remote)・公開スナップショットに含めてよいステータス。 */
export const PUBLISHABLE_LICENSE_STATUSES = [
  "ccby_replaced",
  "permission_granted",
  "not_applicable",
] as const satisfies readonly LicenseStatus[];

/**
 * 調査の完了度。既定は"full_survey"(通常の完全調査)。
 * "license_research_only"は、著作権リスク調査(licenseAudit)のみを実施し、学校・相談窓口等の
 * 実データ収集(elementarySchools/programs/specialNeedsSchools/highSchoolPathways等)を
 * 行っていない骨組みファイルであることを示す。東京23区・大型都市の許諾申請必要量を早期に
 * 把握する目的で導入した(2026-08-10)。このステータスのファイルは、validate-manual.mjsの
 * licenseAudit整合性チェック(配列が空ならnot_applicableでなければならない、という検証)を
 * スキップする対象となり、ingest-manual-survey.mjsはD1投入自体をスキップする。
 */
export const SurveyStatusSchema = z.enum(["full_survey", "license_research_only"]);
export type SurveyStatus = z.infer<typeof SurveyStatusSchema>;

/**
 * ファイル単位の許諾監査ブロック。4キーはリスク種別(スキーマのセクションと1対1ではない):
 * - schoolClassData: fixedClasses / resourceRoom / classOrganization(特別支援学級の学級数・設置状況・学級編制判定)
 * - consultationWindowData: programs(special_needs_school_zoning カテゴリを除く)/
 *   supportPathways / resultsGuideNotes / schoolBoundaryFlexibility / hazardMap(窓口の名称・住所・電話番号等)
 * - zoningData: specialNeedsSchools[].zoningNote および
 *   programs[category=special_needs_school_zoning](都立特別支援学校の通学区域=都データ)
 * - highSchoolData: highSchoolPathwaysのうちmetro.ed.jp(東京都立学校公式サイト)ドメイン由来のエントリ(都データ)。
 *   ファイル単位でhighSchoolPathways配列全体をゲーティングする
 */
export const LicenseAuditSchema = z.object({
  auditedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "auditedOn must be YYYY-MM-DD"),
  schoolClassData: LicenseStatusSchema,
  consultationWindowData: LicenseStatusSchema,
  zoningData: LicenseStatusSchema,
  /** highSchoolPathways[]のうちmetro.ed.jp(東京都立学校公式)ドメイン由来のエントリ(都データ)。 */
  highSchoolData: LicenseStatusSchema,
  note: z.string().optional(),
});
export type LicenseAudit = z.infer<typeof LicenseAuditSchema>;

/** 出典。URLが無い一次情報(電話確認等)も想定し url は任意とする。 */
export const SourceRefSchema = z.object({
  label: z.string().min(1),
  url: z.string().url().optional(),
  /** 出典データのライセンス表記(例: "CC BY 4.0")。ccby_replaced への昇格時に必須運用。 */
  license: z.string().min(1).optional(),
  /** 出典データの基準年。確認日とは別に、統計・一覧の時点を記録する。 */
  asOfYear: z.string().regex(/^\d{4}$/).optional(),
  /** 確認日(YYYY-MM-DD)。YAML側で日付型に暗黙変換されないよう文字列として扱う。 */
  confirmedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "confirmedOn must be YYYY-MM-DD"),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

const withSources = z.object({ sources: z.array(SourceRefSchema).min(1) });

// 江戸川区・葛飾区の一次資料検証で判明した障害種別の詳細化。
export const DisabilityTypeSchema = z.enum([
  "intellectual",
  "autism_emotional",
  "hearing",
  "language",
  "visual",
  "health_impairment",
  "physical",
  "other",
]);

/** 固定級(特別支援学級)。1校が複数の障害種別の固定級を持つことがあるため配列で持つ。 */
export const FixedClassSchema = z
  .object({
    disabilityType: DisabilityTypeSchema,
    className: z.string().optional(),
    classCount: z.number().int().positive().optional(),
    capacity: z.number().int().positive().optional(),
    status: ConfirmationStatusSchema.default("confirmed"),
    /** 例: 「2027年4月開設予定」「2026年4月開設済み」 */
    note: z.string().optional(),
  })
  .merge(withSources.partial());

/** 特別支援教室(通級相当)。拠点校方式のため、拠点校自身か巡回対象校かを区別する。 */
export const ResourceRoomSchema = z.object({
  hasResourceRoom: z.boolean(),
  isHubSchool: z.boolean().default(false),
  hubSchoolName: z.string().optional(),
  groupName: z.string().optional(),
  operationMode: z.enum(["itinerant_teacher", "student_travels_to_hub"]).optional(),
});

export const SchoolSchema = z
  .object({
    name: z.string().min(1),
    level: z.enum(["elementary", "junior_high"]),
    areaHint: z.string().optional(),
    /** 住所。地図表示(将来の facilities.address 相当)の前提となる正式な所在地。 */
    address: z.string().optional(),
    /** 学校自体の公式ホームページURL(任意)。`sources[].url` は個々の事実(固定級・通級指導教室の有無等)の
     *  根拠資料へのリンクであり、これとは別物。学校の公式サイトそのものを指す。 */
    url: z.string().url().optional(),
    /** 学校の電話番号(任意)。 */
    phone: z.string().optional(),
    /**
     * 緯度・経度の手動上書き。通常は入力しない(住所から自動ジオコーディングする設計、
     * workers/ingest/geocoding.ts と同じ方針)。ジオコーディングが失敗する・住所が
     * 特定できない等の理由で、一次資料から緯度経度を直接確認できた場合にのみ、
     * その出典とともに手入力する。
     */
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    fixedClasses: z.array(FixedClassSchema).default([]),
    resourceRoom: ResourceRoomSchema.optional(),
    districtNote: z.string().optional(),
  })
  .merge(withSources);

/**
 * 通院可能なクリニック。アプリ本体(db/schema.sql)は is_medical=1 の施設を検索結果から
 * 常に除外するため(FR-025)、ここに記録しても processed/facilities.json には出力しない想定。
 * あくまで調査データとしての保持(私的な転居判断に使う)。
 */
export const ClinicSchema = z
  .object({
    name: z.string().min(1),
    department: z.string().optional(),
    address: z.string().optional(),
    accessNote: z.string().optional(),
    targetAgeNote: z.string().optional(),
    acceptingNewPatients: ConfirmationStatusSchema.default("unconfirmed"),
    /** 隣接自治体・都心の参考枠(自治体内ではない)場合 true。 */
    isReferenceOnly: z.boolean().default(false),
  })
  .merge(withSources);

export const ProgramCategorySchema = z.enum([
  "school_consultation", // 就学相談・転学相談
  "counseling", // 教育相談室・こころの相談室等
  "day_service_directory", // 児童発達支援・放課後等デイサービス一覧
  "medical_expense_subsidy",
  "housing_support",
  "high_school_pathway",
  "ict_environment",
  "special_needs_school_zoning", // 都立特別支援学校の通学区域
  "other",
]);

export const ProgramSchema = z
  .object({
    name: z.string().min(1),
    category: ProgramCategorySchema,
    description: z.string().optional(),
    contact: z.string().optional(),
    /** 窓口の所在地(任意)。地図表示(facilities.address 相当)の前提となる正式な所在地。 */
    address: z.string().optional(),
    /**
     * 緯度・経度の手動上書き。通常は入力しない(住所から自動ジオコーディングする設計、
     * SchoolSchema.lat/lng と同じ方針)。ジオコーディングが失敗する・住所が特定できない等の
     * 理由で、一次資料から緯度経度を直接確認できた場合にのみ、その出典とともに手入力する。
     */
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    // 2026-08是正(外部コードレビュー指摘 項目3): 既定値を "confirmed" から "unconfirmed" へ
    // 変更した。batch/scripts/ingest-manual-survey.mjs の buildSql も
    // `program.status ?? "unconfirmed"` に揃えてあり(このスクリプトは Node が .ts を直接
    // import できないためこの zod スキーマとは独立に既定値を持つ。値のパリティは人手で保つ
    // 必要がある)、未確認のプログラムを「確認済み」表示してしまう安全側でない挙動を止め、
    // 他の ConfirmationStatusSchema 利用箇所(ClinicSchema.acceptingNewPatients 等)と
    // 同じ「未指定=未確認」という既定値に揃える。FixedClassSchema.status(129行目)・
    // PathwaySchema.status(357行目)は、ingest側(ingest-manual-survey.mjs)がそれぞれ
    // 独自に `?? "confirmed"` を既定値として使い続けており、今回の変更対象外
    // (両者を変えると ingest 側の実際の投入値とスキーマの想定値がずれるため、
    // スコープを ProgramSchema.status のみに限定する)。
    status: ConfirmationStatusSchema.default("unconfirmed"),
    /**
     * 対象年齢の粗い区分(facilities.age_range)。2026-08是正(外部コードレビュー指摘:
     * スキーマ・投入処理の土台のみ)、任意項目。未指定時は ingest-manual-survey.mjs が
     * 従来どおり 'both' を既定値として投入するため、既存YAMLはすべて未設定のままで挙動は
     * 変わらない。一次資料で対象年齢が確認できたプログラムにのみ、新規・更新時に設定すること
     * (事実の捏造禁止の方針上、確認できていない値を推測で埋めない)。
     */
    ageRange: ProgramAgeRangeSchema.optional(),
    /**
     * 対象ライフステージの範囲(facilities.lifestage_min/max、migration 0016)。
     * lifestageMin/Max は両方指定または両方未指定のいずれかであること(片方だけの指定は
     * validate-manual.mjs でエラーとする)。ageRange と同じく任意項目・推測禁止。
     */
    lifestageMin: ProgramLifestageSchema.optional(),
    lifestageMax: ProgramLifestageSchema.optional(),
    /** 確認日(YYYY-MM-DD、任意)。status の確認状態がいつ時点のものかを示す。 */
    confirmedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "confirmedOn must be YYYY-MM-DD").optional(),
  })
  .merge(withSources);

// 江戸川区・葛飾区の一次資料検証で判明した学級編制の判定根拠。
export const ClassOrganizationJudgementSchema = z.enum([
  "separate",
  "combined",
  "mixed",
  "unconfirmed",
  "not_applicable",
]);
export const ClassOrganizationSchema = z
  .object({
    level: z.enum(["elementary", "junior_high"]),
    judgement: ClassOrganizationJudgementSchema,
    rationale: z.string().min(1),
  })
  .merge(withSources.partial());

// 江戸川区・葛飾区の一次資料検証で判明した高校進学時の通学条件。
export const HighSchoolPathwayTypeSchema = z.enum([
  "challenge_school",
  "encourage_school",
  "correspondence_support_school",
  "palette_school",
  "community_active_school",
  "creative_school",
  "other",
]);
export const CommuteRatingSchema = z.enum(["excellent", "good", "marginal"]);
export const HighSchoolPathwaySchema = z
  .object({
    name: z.string().min(1),
    pathwayType: HighSchoolPathwayTypeSchema,
    prefecture: z.string().optional(),
    address: z.string().optional(),
    /** 学校の公式ホームページURL(任意)。sources[].url とは別物(個々の事実の根拠資料リンクではなく、
     *  学校公式サイトそのもの)。 */
    url: z.string().url().optional(),
    /** 学校の電話番号(任意)。 */
    phone: z.string().optional(),
    nearestStation: z.string().optional(),
    estimatedCommuteMinutes: z.number().int().positive().optional(),
    commuteRating: CommuteRatingSchema.optional(),
    commuteNote: z.string().optional(),
  })
  .merge(withSources);

// 江戸川区・葛飾区の一次資料検証で判明した指定校変更・区域外就学の条件。
export const SchoolBoundaryFlexibilitySchema = z
  .object({
    allowsChangeForFixedClassEnrollment: z.boolean().optional(),
    approvalCriteria: z.array(z.string()).default([]),
    note: z.string().optional(),
  })
  .merge(withSources.partial());

// 江戸川区・葛飾区の一次資料検証で判明したハザードマップの定量比較項目。
export const HazardMapSchema = z
  .object({
    floodRiskAreaPercent: z.number().min(0).max(100).optional(),
    maxFloodDepthMeters: z.number().positive().optional(),
    tsunamiRiskAreaPercent: z.number().min(0).max(100).optional(),
    maxTsunamiDepthMeters: z.number().positive().optional(),
    earthquakeProbability30yPercent: z.number().min(0).max(100).optional(),
    evacuationPolicyNote: z.string().optional(),
  })
  .merge(withSources.partial());

// 江戸川区・葛飾区の一次資料検証で判明した特別支援学校の通学区域情報。
export const SpecialNeedsSchoolLevelSchema = z.enum(["elementary", "junior_high", "high", "vocational"]);
export const SpecialNeedsSchoolSchema = z
  .object({
    name: z.string().min(1),
    disabilityTypes: z.array(DisabilityTypeSchema).min(1),
    levels: z.array(SpecialNeedsSchoolLevelSchema).default([]),
    address: z.string().optional(),
    isInMunicipality: z.boolean().default(true),
    zoningNote: z.string().optional(),
  })
  .merge(withSources);

/** ライフステージ。app/src/features/support/services/lifestage-mapping.ts の LIFESTAGE_VALUES と一致させる。 */
export const LifestageSchema = z.enum([
  "preschool",
  "elementary-junior-high",
  "high-school",
  "university-vocational",
  "working-adult",
]);

/** 目的別の想定ルート1本を構成するステップ。 */
export const PathwayStepSchema = z
  .object({
    order: z.number().int().positive(),
    /** 表示文言。例: 「松が谷福祉会館こども療育室へ発達相談」 */
    title: z.string().min(1),
    /** 窓口名。特定の窓口を指さないステップでは省略可。 */
    actor: z.string().min(1).optional(),
    /** 問い合わせ先の電話番号・URL等(任意)。 */
    contact: z.string().optional(),
    /** 「必要に応じて」等、全員が通るとは限らない任意ステップかどうか。 */
    isConditional: z.boolean().default(false),
    /** 手続き上の補足(任意)。 */
    note: z.string().optional(),
    /** ステップ単位の出典。ルート全体の出典と異なる場合に指定する(任意)。 */
    sources: z.array(SourceRefSchema).optional(),
  })
  .strict();

/** 目的別の想定ルート1本。複数ライフステージで同じルートを共有できるよう対象は配列で持つ。 */
export const SupportPathwaySchema = z
  .object({
    /** 「ライフステージ × 目的」の組み合わせを一意に指す ID。 */
    id: z.string().min(1),
    /** 対象ライフステージ。大学生・専門学校生と社会人等で同じルートを共有できるよう配列で持つ。 */
    lifestages: z.array(LifestageSchema).min(1),
    /** UI上の目的選択肢と対応する ID。 */
    purposeId: z.string().min(1),
    /** 目的選択肢の表示ラベル。 */
    purposeLabel: z.string().min(1),
    /** 手続き・相談等の順序付きステップ。 */
    steps: z.array(PathwayStepSchema).min(1),
    /** 一次情報で確認済みか、未確認かを示す状態。 */
    status: ConfirmationStatusSchema.default("confirmed"),
  })
  .merge(withSources);

/** 支援検索結果画面「1分でわかるガイド」の自治体固有補足。汎用本文(results-tab-guides.ts)を
 *  自治体単位で補う。対象タブは3つのみ(未対応タブでは常にガイド自体を描画しない)。 */
export const ResultsGuideNoteSchema = z
  .object({
    tab: z.enum(["相談窓口", "学校情報", "福祉ガイド"]),
    body: z.array(z.string().min(1)).min(1),
  })
  .merge(withSources);
export type ResultsGuideNote = z.infer<typeof ResultsGuideNoteSchema>;

export const MunicipalitySurveySchema = z.object({
  /** JIS X 0402 全国地方公共団体コード(5桁)。例: 台東区=13106。 */
  municipalityCode: z.string().regex(/^\d{5}$/),
  municipalityName: z.string().min(1),
  prefecture: z.literal("東京都"),
  surveyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 許諾・ライセンス監査状態(必須)。docs/decisions/manual-data-license-management.md 参照。 */
  licenseAudit: LicenseAuditSchema,
  /** 調査の完了度。省略時は"full_survey"(既存の全22ファイルは省略のままでよい、後方互換)。 */
  surveyStatus: SurveyStatusSchema.default("full_survey"),
  population: z.number().int().positive().optional(),
  households: z.number().int().positive().optional(),
  representativeStations: z.array(z.string()).default([]),
  elementarySchools: z.array(SchoolSchema).default([]),
  juniorHighSchools: z.array(SchoolSchema).default([]),
  clinics: z.array(ClinicSchema).default([]),
  programs: z.array(ProgramSchema).default([]),
  classOrganization: z.array(ClassOrganizationSchema).default([]),
  highSchoolPathways: z.array(HighSchoolPathwaySchema).default([]),
  schoolBoundaryFlexibility: SchoolBoundaryFlexibilitySchema.optional(),
  hazardMap: HazardMapSchema.optional(),
  specialNeedsSchools: z.array(SpecialNeedsSchoolSchema).default([]),
  /** 「方法・限界」章の箇条書き相当。未確認事項の一覧。 */
  limitations: z.array(z.string()).default([]),
  /** ライフステージと目的別の想定ルート。 */
  supportPathways: z.array(SupportPathwaySchema).default([]),
  /** 支援検索結果画面「1分でわかるガイド」の自治体固有補足。 */
  resultsGuideNotes: z.array(ResultsGuideNoteSchema).default([]),
});

export type SupportPathway = z.infer<typeof SupportPathwaySchema>;
export type MunicipalitySurvey = z.infer<typeof MunicipalitySurveySchema>;
