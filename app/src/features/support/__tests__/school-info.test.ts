import { describe, expect, it, vi } from "vitest";

import type { SchoolInfoSectionProps } from "@/features/support/components/SchoolInfoSection";
import {
  fetchSchoolById,
  fetchSchoolInfo,
  filterSchoolInfoByLifestage,
  hideExpiredSchoolInfo,
} from "@/features/support/services/school-info";
import { LIFESTAGE_VALUES } from "@/features/support/services/lifestage-mapping";

// facility-search.test.ts の D1 モックパターン(prepare呼び出し順に応じて結果を切り替える
// フェイクD1Database)に倣う。fetchSchoolInfo は Promise.all で4本のクエリを並行発行するため、
// prepare() が呼ばれた順(0:schools, 1:high_school_pathways, 2:class_organizations,
// 3:municipality_survey_meta)にモック結果を対応させる。
interface FakeStatement {
  bind: (...args: unknown[]) => FakeStatement;
  all: () => Promise<{ results: unknown[] }>;
  first: () => Promise<unknown>;
}

function createFakeDb(responses: {
  schools?: unknown[];
  pathways?: unknown[];
  organizations?: unknown[];
  meta?: unknown;
}) {
  const prepareCalls: string[] = [];
  const bindCalls: unknown[][] = [];
  let call = 0;

  const db = {
    prepare: vi.fn((sql: string) => {
      prepareCalls.push(sql);
      const currentCall = call;
      call += 1;
      const statement: FakeStatement = {
        bind: vi.fn((...args: unknown[]) => {
          bindCalls.push(args);
          return statement;
        }),
        all: vi.fn(async () => {
          const table = [responses.schools, responses.pathways, responses.organizations][currentCall];
          return { results: table ?? [] };
        }),
        first: vi.fn(async () => responses.meta ?? null),
      };
      return statement;
    }),
  };

  return { db, prepareCalls, bindCalls };
}

function makeSchoolRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "school-001",
    level: "elementary" as const,
    name: "上野小学校",
    area_hint: "東上野",
    address: null,
    url: null,
    phone: null,
    lat: null,
    lng: null,
    district_note: null,
    fixed_classes_json: "[]",
    has_resource_room: null,
    is_hub_school: null,
    hub_school_name: null,
    group_name: null,
    operation_mode: null,
    ...overrides,
  };
}

function makePathwayRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "チャレンジスクールA",
    pathway_type: "challenge_school" as const,
    prefecture: "東京都",
    address: null,
    url: null,
    phone: null,
    nearest_station: null,
    estimated_commute_minutes: 20,
    commute_rating: "excellent" as const,
    commute_note: null,
    ...overrides,
  };
}

describe("fetchSchoolInfo", () => {
  it("schools/school_fixed_classes/school_resource_rooms の結合結果を正しいSchool型配列に変換する(小学校・中学校で振り分け)", async () => {
    const { db } = createFakeDb({
      schools: [
        makeSchoolRow({ id: "school-elem", level: "elementary", name: "上野小学校" }),
        makeSchoolRow({ id: "school-jh", level: "junior_high", name: "御徒町台東中学校" }),
      ],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.schools.elementary).toHaveLength(1);
    expect(result.schools.elementary[0].name).toBe("上野小学校");
    expect(result.schools.juniorHigh).toHaveLength(1);
    expect(result.schools.juniorHigh[0].name).toBe("御徒町台東中学校");
  });

  it("fixed_classes_json(JSON文字列)をfixedClasses配列にパースする", async () => {
    const fixedClasses = [
      { disabilityType: "intellectual", className: "たけのこ学級", classCount: 2, capacity: 16, status: "confirmed", note: null },
    ];
    const { db } = createFakeDb({
      schools: [makeSchoolRow({ fixed_classes_json: JSON.stringify(fixedClasses) })],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.schools.elementary[0].fixedClasses).toEqual([
      { disabilityType: "intellectual", className: "たけのこ学級", classCount: 2, capacity: 16, status: "confirmed", note: undefined, sources: [] },
    ]);
  });

  it("url が設定されている場合、School.url へ同じ値をそのまま渡す(学校公式サイト)", async () => {
    const { db } = createFakeDb({
      schools: [makeSchoolRow({ url: "https://example-elementary.tokyo.jp" })],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.schools.elementary[0].url).toBe("https://example-elementary.tokyo.jp");
  });

  it("url が null の場合、School.url は undefined になる", async () => {
    const { db } = createFakeDb({
      schools: [makeSchoolRow({ url: null })],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.schools.elementary[0].url).toBeUndefined();
  });

  it("phone が設定されている場合、School.phone へ同じ値をそのまま渡す", async () => {
    const { db } = createFakeDb({
      schools: [makeSchoolRow({ phone: "03-1234-5678" })],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.schools.elementary[0].phone).toBe("03-1234-5678");
  });

  it("phone が null の場合、School.phone は undefined になる", async () => {
    const { db } = createFakeDb({
      schools: [makeSchoolRow({ phone: null })],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.schools.elementary[0].phone).toBeUndefined();
  });

  it("has_resource_room が null の場合、resourceRoom は undefined になる(特別支援教室情報なし)", async () => {
    const { db } = createFakeDb({
      schools: [makeSchoolRow({ has_resource_room: null })],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.schools.elementary[0].resourceRoom).toBeUndefined();
  });

  it("has_resource_room が設定されている場合、resourceRoomをbooleanを含む形へ変換する(1→true/0→false)", async () => {
    const { db } = createFakeDb({
      schools: [
        makeSchoolRow({
          has_resource_room: 1,
          is_hub_school: 0,
          hub_school_name: "平成小学校",
          group_name: "すずかけ教室",
          operation_mode: "itinerant_teacher",
        }),
      ],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.schools.elementary[0].resourceRoom).toEqual({
      hasResourceRoom: true,
      isHubSchool: false,
      hubSchoolName: "平成小学校",
      groupName: "すずかけ教室",
      operationMode: "itinerant_teacher",
    });
  });

  it("high_school_pathways の結果を highSchoolPathways へ変換する", async () => {
    const { db } = createFakeDb({
      pathways: [
        {
          name: "チャレンジスクールA",
          pathway_type: "challenge_school",
          prefecture: "東京都",
          address: null,
          url: null,
          phone: null,
          nearest_station: null,
          estimated_commute_minutes: 20,
          commute_rating: "excellent",
          commute_note: null,
        },
      ],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.highSchoolPathways).toEqual([
      {
        name: "チャレンジスクールA",
        pathwayType: "challenge_school",
        prefecture: "東京都",
        address: undefined,
        url: undefined,
        phone: undefined,
        nearestStation: undefined,
        estimatedCommuteMinutes: 20,
        commuteRating: "excellent",
        commuteNote: undefined,
        sources: [],
      },
    ]);
  });

  it("high_school_pathways の url/phone が設定されている場合、HighSchoolPathway.url/phone へ同じ値をそのまま渡す", async () => {
    const { db } = createFakeDb({
      pathways: [
        makePathwayRow({ url: "https://example-highschool.tokyo.jp", phone: "03-9999-8888" }),
      ],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.highSchoolPathways[0].url).toBe("https://example-highschool.tokyo.jp");
    expect(result.highSchoolPathways[0].phone).toBe("03-9999-8888");
  });

  it("high_school_pathways の url/phone が null の場合、HighSchoolPathway.url/phone はどちらも undefined になる", async () => {
    const { db } = createFakeDb({
      pathways: [makePathwayRow()],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.highSchoolPathways[0].url).toBeUndefined();
    expect(result.highSchoolPathways[0].phone).toBeUndefined();
  });

  it("class_organizations の結果を classOrganizations へそのまま渡す", async () => {
    const { db } = createFakeDb({
      organizations: [{ level: "elementary", judgement: "separate", rationale: "テスト根拠" }],
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.classOrganizations).toEqual([{ level: "elementary", judgement: "separate", rationale: "テスト根拠", sources: [] }]);
  });

  it("municipality_survey_meta から surveyDate と limitations を取得する", async () => {
    const { db } = createFakeDb({
      meta: { survey_date: "2026-07-13", limitations_json: JSON.stringify(["未確認事項あり"]) },
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.surveyDate).toBe("2026-07-13");
    expect(result.limitations).toEqual(["未確認事項あり"]);
  });

  it("limitations_json が不正なJSONの場合は空配列にフォールバックする(捏造・クラッシュ防止)", async () => {
    const { db } = createFakeDb({
      meta: { survey_date: "2026-07-13", limitations_json: "{not valid json" },
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.limitations).toEqual([]);
  });

  it("データが無い自治体では、すべて空配列・surveyDate=nullの空データを返す", async () => {
    const { db } = createFakeDb({ schools: [], pathways: [], organizations: [], meta: null });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "檜原村");

    expect(result).toEqual({
      schools: { elementary: [], juniorHigh: [] },
      highSchoolPathways: [],
      classOrganizations: [],
      limitations: [],
      surveyDate: null,
      licenseAudit: null,
      expiration: null,
    });
  });

  it("municipality_survey_meta が存在する場合、survey_date + 365日の有効期限を算出する(2026-08是正)", async () => {
    const { db } = createFakeDb({
      schools: [],
      pathways: [],
      organizations: [],
      meta: { survey_date: "2026-07-13", limitations_json: null, license_audit_json: null },
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.expiration).toEqual({ expiresAt: "2027-07-13T00:00:00.000Z", isExpired: false });
  });

  it("survey_date が365日超過している場合、expiration.isExpired=trueになる(AC-1)", async () => {
    const { db } = createFakeDb({
      schools: [],
      pathways: [],
      organizations: [],
      meta: { survey_date: "2020-01-01", limitations_json: null, license_audit_json: null },
    });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.expiration?.isExpired).toBe(true);
  });

  it("license_audit_jsonが4キーとも揃っていれば、licenseAuditへそのまま反映する", async () => {
    const audit = { schoolClassData: "permission_pending", consultationWindowData: "ccby_available", zoningData: "tokyo_restricted", highSchoolData: "not_applicable" };
    const { db } = createFakeDb({ schools: [], pathways: [], organizations: [], meta: { survey_date: "2026-08-10", limitations_json: null, license_audit_json: JSON.stringify(audit) } });

    const result = await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    expect(result.licenseAudit).toEqual(audit);
  });

  it("license_audit_jsonが不正なJSON、または4キーの一部が欠けている場合はlicenseAudit=nullにフォールバックする", async () => {
    const { db: dbBroken } = createFakeDb({ schools: [], pathways: [], organizations: [], meta: { survey_date: "2026-08-10", limitations_json: null, license_audit_json: "{not json" } });
    const brokenResult = await fetchSchoolInfo(dbBroken as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");
    expect(brokenResult.licenseAudit).toBeNull();

    const { db: dbPartial } = createFakeDb({ schools: [], pathways: [], organizations: [], meta: { survey_date: "2026-08-10", limitations_json: null, license_audit_json: JSON.stringify({ schoolClassData: "permission_pending" }) } });
    const partialResult = await fetchSchoolInfo(dbPartial as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");
    expect(partialResult.licenseAudit).toBeNull();
  });

  it("区市町村名をbind()経由でのみ渡し、SQL文字列へ直接埋め込まない", async () => {
    const { db, prepareCalls, bindCalls } = createFakeDb({ schools: [] });

    await fetchSchoolInfo(db as unknown as Parameters<typeof fetchSchoolInfo>[0], "台東区");

    for (const sql of prepareCalls) {
      expect(sql).not.toContain("台東区");
      expect(sql).toContain("?");
    }
    expect(bindCalls.every((args) => args[0] === "13106")).toBe(true);
  });
});

// `fetchSchoolById` は id のみから単一行を再取得する(`.first()`)ため、fetchSchoolInfo 用の
// `createFakeDb`(複数クエリを Promise.all で発行する前提)は使わず、単純な1クエリ分の
// フェイクを別途用意する。
function createSingleRowFakeDb(row: unknown | null) {
  const first = vi.fn().mockResolvedValue(row);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare }, prepare, bind, first };
}

describe("fetchSchoolById", () => {
  it("municipality(掲載情報の訂正・更新報告が必要とするフィールド)を含む学校データを返す", async () => {
    const { db } = createSingleRowFakeDb({
      id: "school-001",
      municipality: "台東区",
      level: "elementary",
      name: "上野小学校",
      area_hint: null,
      address: "東京都台東区上野1-1-1",
      url: null,
      phone: null,
      lat: null,
      lng: null,
      district_note: null,
      sources_json: "[]",
      fixed_classes_json: "[]",
      has_resource_room: null,
      is_hub_school: null,
      hub_school_name: null,
      group_name: null,
      operation_mode: null,
    });

    const result = await fetchSchoolById(db as unknown as Parameters<typeof fetchSchoolById>[0], "school-001");

    expect(result?.id).toBe("school-001");
    expect(result?.municipality).toBe("台東区");
    expect(result?.name).toBe("上野小学校");
    expect(result?.address).toBe("東京都台東区上野1-1-1");
  });

  it("該当する学校が無い場合はnullを返す", async () => {
    const { db } = createSingleRowFakeDb(null);

    const result = await fetchSchoolById(db as unknown as Parameters<typeof fetchSchoolById>[0], "unknown-id");

    expect(result).toBeNull();
  });

  it("学校IDをbind()経由でのみ渡し、SQL文字列へ直接埋め込まない", async () => {
    const { db, prepare, bind } = createSingleRowFakeDb(null);

    await fetchSchoolById(db as unknown as Parameters<typeof fetchSchoolById>[0], "school-001");

    expect(prepare.mock.calls[0][0]).not.toContain("school-001");
    expect(bind).toHaveBeenCalledWith("school-001");
  });
});

describe("filterSchoolInfoByLifestage", () => {
  // schools/highSchoolPathways/classOrganizations が全て非空、かつ limitations/surveyDate も
  // 非空という「絞り込み対象」と「常に維持されるメタ情報」を同時に検証できるフィクスチャ。
  const fixture: Omit<SchoolInfoSectionProps, "municipality"> = {
    schools: {
      elementary: [{ name: "上野小学校", level: "elementary", fixedClasses: [] }],
      juniorHigh: [{ name: "御徒町台東中学校", level: "junior_high", fixedClasses: [] }],
    },
    highSchoolPathways: [{ name: "チャレンジスクールA", pathwayType: "challenge_school" }],
    classOrganizations: [{ level: "elementary", judgement: "separate", rationale: "テスト根拠" }],
    limitations: ["未確認事項あり"],
    surveyDate: "2026-07-13",
  };

  const emptySchools = { elementary: [], juniorHigh: [] };

  it("lifestage が null の場合、入力をそのまま返す(直リンク等との後方互換)", () => {
    expect(filterSchoolInfoByLifestage(fixture, null)).toEqual(fixture);
  });

  it('lifestage="preschool" の場合、学校・高校進学先・学級編制情報を全て空にする', () => {
    const result = filterSchoolInfoByLifestage(fixture, "preschool");

    expect(result.schools).toEqual(emptySchools);
    expect(result.highSchoolPathways).toEqual([]);
    expect(result.classOrganizations).toEqual([]);
  });

  it('lifestage="elementary-junior-high" の場合、学校・学級編制情報は維持し、高校進学先のみ空にする', () => {
    const result = filterSchoolInfoByLifestage(fixture, "elementary-junior-high");

    expect(result.schools).toEqual(fixture.schools);
    expect(result.classOrganizations).toEqual(fixture.classOrganizations);
    expect(result.highSchoolPathways).toEqual([]);
  });

  it('lifestage="high-school" の場合、高校進学先は維持し、学校(小・中)・学級編制情報は空にする', () => {
    const result = filterSchoolInfoByLifestage(fixture, "high-school");

    expect(result.highSchoolPathways).toEqual(fixture.highSchoolPathways);
    expect(result.schools).toEqual(emptySchools);
    expect(result.classOrganizations).toEqual([]);
  });

  it('lifestage="university-vocational" の場合、学校・高校進学先・学級編制情報を全て空にする', () => {
    const result = filterSchoolInfoByLifestage(fixture, "university-vocational");

    expect(result.schools).toEqual(emptySchools);
    expect(result.highSchoolPathways).toEqual([]);
    expect(result.classOrganizations).toEqual([]);
  });

  it('lifestage="working-adult" の場合、学校・高校進学先・学級編制情報を全て空にする', () => {
    const result = filterSchoolInfoByLifestage(fixture, "working-adult");

    expect(result.schools).toEqual(emptySchools);
    expect(result.highSchoolPathways).toEqual([]);
    expect(result.classOrganizations).toEqual([]);
  });

  it.each([null, ...LIFESTAGE_VALUES])(
    "limitations と surveyDate は調査全体のメタ情報のため、どのlifestageでも変更されない(%s)",
    (lifestage) => {
      const result = filterSchoolInfoByLifestage(fixture, lifestage);

      expect(result.limitations).toEqual(fixture.limitations);
      expect(result.surveyDate).toBe(fixture.surveyDate);
    },
  );
});

describe("hideExpiredSchoolInfo", () => {
  // fixture は filterSchoolInfoByLifestage と同じ「全項目が非空」の形を使い、
  // 期限内=素通し/期限切れ=一覧空+メタ情報維持を同時に検証できるようにする。
  const baseFixture: Omit<SchoolInfoSectionProps, "municipality"> = {
    schools: {
      elementary: [{ name: "上野小学校", level: "elementary", fixedClasses: [] }],
      juniorHigh: [{ name: "御徒町台東中学校", level: "junior_high", fixedClasses: [] }],
    },
    highSchoolPathways: [{ name: "チャレンジスクールA", pathwayType: "challenge_school" }],
    classOrganizations: [{ level: "elementary", judgement: "separate", rationale: "テスト根拠" }],
    limitations: ["未確認事項あり"],
    surveyDate: "2026-07-13",
    licenseAudit: { schoolClassData: "permission_granted", consultationWindowData: "permission_granted", zoningData: "not_applicable", highSchoolData: "not_applicable" },
  };

  it("expiration が null(調査対象外自治体)の場合はそのまま返す", () => {
    const info = { ...baseFixture, expiration: null };

    expect(hideExpiredSchoolInfo(info)).toEqual(info);
  });

  it("expiration.isExpired が false(期限内)の場合はそのまま返す", () => {
    const info = { ...baseFixture, expiration: { expiresAt: "2027-07-13T00:00:00.000Z", isExpired: false } };

    expect(hideExpiredSchoolInfo(info)).toEqual(info);
  });

  it("expiration.isExpired が true(期限切れ)の場合、schools/highSchoolPathways/classOrganizations/limitations を空にする", () => {
    const info = { ...baseFixture, expiration: { expiresAt: "2020-07-13T00:00:00.000Z", isExpired: true } };

    const result = hideExpiredSchoolInfo(info);

    expect(result.schools).toEqual({ elementary: [], juniorHigh: [] });
    expect(result.highSchoolPathways).toEqual([]);
    expect(result.classOrganizations).toEqual([]);
    expect(result.limitations).toEqual([]);
  });

  it("期限切れでも surveyDate・licenseAudit・expiration は維持する(バナー表示に必要)", () => {
    const info = { ...baseFixture, expiration: { expiresAt: "2020-07-13T00:00:00.000Z", isExpired: true } };

    const result = hideExpiredSchoolInfo(info);

    expect(result.surveyDate).toBe(info.surveyDate);
    expect(result.licenseAudit).toEqual(info.licenseAudit);
    expect(result.expiration).toEqual(info.expiration);
  });
});
