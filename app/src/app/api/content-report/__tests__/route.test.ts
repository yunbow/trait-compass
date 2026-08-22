import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

const { consumeReportRateLimitMock } = vi.hoisted(() => ({ consumeReportRateLimitMock: vi.fn() }));
vi.mock("@/lib/reports/rate-limit", () => ({ consumeReportRateLimit: consumeReportRateLimitMock }));

const { fetchSupportPathwayByIdMock } = vi.hoisted(() => ({ fetchSupportPathwayByIdMock: vi.fn() }));
vi.mock("@/features/support/services/support-pathway", () => ({ fetchSupportPathwayById: fetchSupportPathwayByIdMock }));

const { fetchSchoolByIdMock } = vi.hoisted(() => ({ fetchSchoolByIdMock: vi.fn() }));
vi.mock("@/features/support/services/school-info", () => ({ fetchSchoolById: fetchSchoolByIdMock }));

const { fetchResultsGuideNoteMock } = vi.hoisted(() => ({ fetchResultsGuideNoteMock: vi.fn() }));
vi.mock("@/features/support/services/results-guide-notes", () => ({ fetchResultsGuideNote: fetchResultsGuideNoteMock }));

const { getResultsTabGuideMock } = vi.hoisted(() => ({ getResultsTabGuideMock: vi.fn() }));
vi.mock("@/features/support/services/results-tab-guides", () => ({ getResultsTabGuide: getResultsTabGuideMock }));

import { POST } from "@/app/api/content-report/route";

function makeRequest(body: unknown, rawBody?: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/content-report", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody ?? JSON.stringify(body),
  });
}

function makeFakeDb() {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, bind, run };
}

const FAKE_PATHWAY = {
  id: "path-001",
  municipality: "台東区",
  lifestage: "elementary-junior-high" as const,
  purposeId: "purpose-1",
  purposeLabel: "発達相談の始め方",
  status: "confirmed" as const,
  steps: [{ order: 1, title: "電話する", actor: "保護者", contact: "03-0000-0000", isConditional: false, note: null }],
  sources: [{ label: "台東区公式サイト", url: "https://example.com", confirmedOn: "2026-07-01" }],
};

const FAKE_SCHOOL = {
  id: "school-001",
  municipality: "台東区",
  name: "台東区立第一小学校",
  level: "elementary" as const,
  areaHint: undefined,
  address: "東京都台東区XX",
  url: "https://example.com/school",
  phone: "03-1111-2222",
  lat: undefined,
  lng: undefined,
  districtNote: "学区は台東区全域",
  sources: [{ label: "台東区教育委員会", url: "https://example.com", confirmedOn: "2026-07-01" }],
  fixedClasses: [],
  resourceRoom: undefined,
};

const FAKE_GUIDE_NOTE = {
  id: "note-001",
  body: ["台東区独自の補足です。"],
  sources: [{ label: "台東区公式サイト", url: "https://example.com", confirmedOn: "2026-07-01" }],
};

const FAKE_GENERIC_GUIDE = {
  heading: "学校で受けられる支援を知る",
  keyPoints: [{ label: "まず相談", value: "担任" }],
  body: ["本文です。"],
  sources: [{ label: "東京都教育委員会", url: "https://example.com", confirmedOn: "2026-07-01" }],
};

const PATHWAY_BODY = { targetType: "pathway" as const, targetId: "path-001", category: "contact" as const };
const SCHOOL_BODY = { targetType: "school" as const, targetId: "school-001", category: "phone" as const };
const GUIDE_BODY = {
  targetType: "guide" as const,
  municipality: "台東区" as const,
  tab: "学校情報" as const,
  lifestage: "elementary-junior-high" as const,
  category: "content" as const,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/content-report", () => {
  describe("正常系", () => {
    it("pathway: D1 から再取得し INSERT して200を返す", async () => {
      consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
      fetchSupportPathwayByIdMock.mockResolvedValue(FAKE_PATHWAY);
      const fakeDb = makeFakeDb();
      getDbMock.mockReturnValue(fakeDb);

      const response = await POST(makeRequest(PATHWAY_BODY));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(fakeDb.prepare.mock.calls[0][0]).toMatch(/INSERT INTO content_reports/);
      const boundArgs = fakeDb.bind.mock.calls[0];
      expect(boundArgs).toContain("pathway");
      expect(boundArgs).toContain("path-001");
      expect(boundArgs).toContain("発達相談の始め方");
      expect(boundArgs).toContain("台東区");
      expect(boundArgs).toContain("contact");
      expect(fakeDb.run).toHaveBeenCalledTimes(1);
    });

    it("pathway: スナップショットはD1再取得値のみから組み立てる", async () => {
      consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
      fetchSupportPathwayByIdMock.mockResolvedValue(FAKE_PATHWAY);
      const fakeDb = makeFakeDb();
      getDbMock.mockReturnValue(fakeDb);

      await POST(makeRequest(PATHWAY_BODY));

      const boundArgs = fakeDb.bind.mock.calls[0] as unknown[];
      const snapshotJson = boundArgs.find((arg) => typeof arg === "string" && arg.startsWith("{"));
      const snapshot = JSON.parse(snapshotJson as string);
      expect(snapshot).toEqual({
        municipality: FAKE_PATHWAY.municipality,
        lifestage: FAKE_PATHWAY.lifestage,
        purposeId: FAKE_PATHWAY.purposeId,
        purposeLabel: FAKE_PATHWAY.purposeLabel,
        status: FAKE_PATHWAY.status,
        steps: FAKE_PATHWAY.steps,
        sources: FAKE_PATHWAY.sources,
      });
    });

    it("school: D1 から再取得し INSERT して200を返す", async () => {
      consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
      fetchSchoolByIdMock.mockResolvedValue(FAKE_SCHOOL);
      const fakeDb = makeFakeDb();
      getDbMock.mockReturnValue(fakeDb);

      const response = await POST(makeRequest(SCHOOL_BODY));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      const boundArgs = fakeDb.bind.mock.calls[0];
      expect(boundArgs).toContain("school");
      expect(boundArgs).toContain("school-001");
      expect(boundArgs).toContain("台東区立第一小学校");
      expect(boundArgs).toContain("台東区");
      expect(boundArgs).toContain("phone");
      // school は lifestage/tab を持たない。
      expect(fakeDb.prepare.mock.calls[0][0]).toMatch(/INSERT INTO content_reports/);
    });

    it("school: スナップショットはD1再取得値のみから組み立てる", async () => {
      consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
      fetchSchoolByIdMock.mockResolvedValue(FAKE_SCHOOL);
      const fakeDb = makeFakeDb();
      getDbMock.mockReturnValue(fakeDb);

      await POST(makeRequest(SCHOOL_BODY));

      const boundArgs = fakeDb.bind.mock.calls[0] as unknown[];
      const snapshotJson = boundArgs.find((arg) => typeof arg === "string" && arg.startsWith("{"));
      const snapshot = JSON.parse(snapshotJson as string);
      expect(snapshot).toEqual({
        name: FAKE_SCHOOL.name,
        municipality: FAKE_SCHOOL.municipality,
        level: FAKE_SCHOOL.level,
        address: FAKE_SCHOOL.address,
        phone: FAKE_SCHOOL.phone,
        url: FAKE_SCHOOL.url,
        districtNote: FAKE_SCHOOL.districtNote,
        fixedClasses: FAKE_SCHOOL.fixedClasses,
        resourceRoom: null,
        sources: FAKE_SCHOOL.sources,
      });
    });

    it("guide: results_guide_notes の行がある場合は guide_note として保存する", async () => {
      consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
      fetchResultsGuideNoteMock.mockResolvedValue(FAKE_GUIDE_NOTE);
      getResultsTabGuideMock.mockReturnValue(FAKE_GENERIC_GUIDE);
      const fakeDb = makeFakeDb();
      getDbMock.mockReturnValue(fakeDb);

      const response = await POST(makeRequest(GUIDE_BODY));

      expect(response.status).toBe(200);
      const boundArgs = fakeDb.bind.mock.calls[0];
      expect(boundArgs).toContain("guide_note");
      expect(boundArgs).toContain("note-001");
      expect(boundArgs).toContain("学校情報");
      expect(boundArgs).toContain("elementary-junior-high");
      expect(boundArgs).toContain("台東区");
    });

    it("guide: results_guide_notes の行が無く汎用ガイドのみの場合は guide_generic として保存する", async () => {
      consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
      fetchResultsGuideNoteMock.mockResolvedValue(null);
      getResultsTabGuideMock.mockReturnValue(FAKE_GENERIC_GUIDE);
      const fakeDb = makeFakeDb();
      getDbMock.mockReturnValue(fakeDb);

      const response = await POST(makeRequest(GUIDE_BODY));

      expect(response.status).toBe(200);
      const boundArgs = fakeDb.bind.mock.calls[0];
      expect(boundArgs).toContain("guide_generic");
      expect(boundArgs).toContain(null);
      expect(boundArgs).toContain("学校で受けられる支援を知る");

      const snapshotJson = (boundArgs as unknown[]).find((arg) => typeof arg === "string" && arg.startsWith("{"));
      const snapshot = JSON.parse(snapshotJson as string);
      expect(snapshot).toEqual({
        municipality: "台東区",
        tab: "学校情報",
        lifestage: "elementary-junior-high",
        heading: FAKE_GENERIC_GUIDE.heading,
        keyPoints: FAKE_GENERIC_GUIDE.keyPoints,
        body: FAKE_GENERIC_GUIDE.body,
        sources: FAKE_GENERIC_GUIDE.sources,
      });
    });
  });

  it("不正な JSON body は 400 を返し、外部依存を呼び出さない", async () => {
    const response = await POST(makeRequest(undefined, "not json"));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
    expect(fetchSupportPathwayByIdMock).not.toHaveBeenCalled();
  });

  it("zod検証エラー(未知のcategory)は 400 を返す", async () => {
    const response = await POST(makeRequest({ ...PATHWAY_BODY, category: "phone" }));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  describe("404: 対象が見つからない", () => {
    it("pathway が見つからない場合は404", async () => {
      consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
      fetchSupportPathwayByIdMock.mockResolvedValue(null);
      getDbMock.mockReturnValue(makeFakeDb());

      const response = await POST(makeRequest(PATHWAY_BODY));

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe("pathway not found");
    });

    it("school が見つからない場合は404", async () => {
      consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
      fetchSchoolByIdMock.mockResolvedValue(null);
      getDbMock.mockReturnValue(makeFakeDb());

      const response = await POST(makeRequest(SCHOOL_BODY));

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe("school not found");
    });

    it("guide が note・汎用ガイドともに見つからない場合は404", async () => {
      consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
      fetchResultsGuideNoteMock.mockResolvedValue(null);
      getResultsTabGuideMock.mockReturnValue(null);
      getDbMock.mockReturnValue(makeFakeDb());

      const response = await POST(makeRequest(GUIDE_BODY));

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe("guide not found");
    });
  });

  it("レート制限超過時は429を返し、D1書き込みは行わない", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest(PATHWAY_BODY));

    expect(response.status).toBe(429);
    expect((await response.json()).retryAfterSeconds).toBe(42);
    expect(fetchSupportPathwayByIdMock).not.toHaveBeenCalled();
    expect(fakeDb.prepare).not.toHaveBeenCalled();
  });

  it("ハニーポット(website非空)は200を返すがD1書き込みは一切行わない", async () => {
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest({ ...PATHWAY_BODY, website: "http://spam.example" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(consumeReportRateLimitMock).not.toHaveBeenCalled();
    expect(fetchSupportPathwayByIdMock).not.toHaveBeenCalled();
    expect(fakeDb.prepare).not.toHaveBeenCalled();
  });

  it("D1 例外時は500を返し、例外詳細をレスポンスに含めない", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    fetchSupportPathwayByIdMock.mockResolvedValue(FAKE_PATHWAY);
    const run = vi.fn().mockRejectedValue(new Error("D1 unavailable: secret detail"));
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    getDbMock.mockReturnValue({ prepare, bind, run });

    const response = await POST(makeRequest(PATHWAY_BODY));

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret detail");
  });

  it("getDb()自体が失敗した場合は502を返す", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    getDbMock.mockImplementation(() => {
      throw new Error("binding not configured");
    });

    const response = await POST(makeRequest(PATHWAY_BODY));

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("binding not configured");
  });

  it("Originヘッダーが自オリジンと異なる場合は403を返す(G-3)", async () => {
    const response = await POST(makeRequest(PATHWAY_BODY, undefined, { origin: "https://evil.example.com" }));

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json).toEqual({ error: "invalid request origin" });
    expect(getDbMock).not.toHaveBeenCalled();
    expect(fetchSupportPathwayByIdMock).not.toHaveBeenCalled();
  });

  it("リクエストボディが10KBを超える場合は413を返す(G-3)", async () => {
    const oversizedRawBody = JSON.stringify({ ...PATHWAY_BODY, detailText: "あ".repeat(6000) });
    expect(new TextEncoder().encode(oversizedRawBody).length).toBeGreaterThan(10 * 1024);

    const response = await POST(makeRequest(undefined, oversizedRawBody));

    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json).toEqual({ error: "request body too large" });
    expect(getDbMock).not.toHaveBeenCalled();
    expect(fetchSupportPathwayByIdMock).not.toHaveBeenCalled();
  });
});
