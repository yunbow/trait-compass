import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

const { consumeReportRateLimitMock } = vi.hoisted(() => ({ consumeReportRateLimitMock: vi.fn() }));
vi.mock("@/lib/reports/rate-limit", () => ({ consumeReportRateLimit: consumeReportRateLimitMock }));

const { fetchFacilityByIdMock } = vi.hoisted(() => ({ fetchFacilityByIdMock: vi.fn() }));
vi.mock("@/features/support/services/facility-search", () => ({ fetchFacilityById: fetchFacilityByIdMock }));

import { POST } from "@/app/api/facility-report/route";

function makeRequest(body: unknown, rawBody?: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/facility-report", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody ?? JSON.stringify(body),
  });
}

const FAKE_FACILITY = {
  id: "fac-001",
  datasetId: "ds-a",
  name: "世田谷区 発達障がい相談支援センター",
  categoryType: "相談窓口",
  municipality: "世田谷区",
  address: "東京都世田谷区XX",
  phone: "03-1234-5678",
  url: "https://example.com",
  ageRange: "both",
  description: "発達に関する相談窓口です。",
  datasetTitle: "ダミーデータセット",
  sourceOrg: "東京都福祉局",
  license: "cc-by-4.0",
  riskLevel: "low",
  sourceUrl: "https://example.com/dataset",
  facilitySubtype: null,
  lat: null,
  lng: null,
  fetchedAt: "2026-01-01T00:00:00.000Z",
  frozen: false,
  noDiagnosisOk: false,
  contactMethods: null,
};

const VALID_BODY = { facilityId: "fac-001", category: "phone" as const };

function makeFakeDb() {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, bind, run };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/facility-report", () => {
  it("正常系: 施設が見つかり、レート制限内であれば D1 へ INSERT して200を返す", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    fetchFacilityByIdMock.mockResolvedValue(FAKE_FACILITY);
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ ok: true });
    expect(fakeDb.prepare).toHaveBeenCalledTimes(1);
    expect(fakeDb.prepare.mock.calls[0][0]).toMatch(/INSERT INTO facility_reports/);
    const boundArgs = fakeDb.bind.mock.calls[0];
    expect(boundArgs).toContain("fac-001");
    expect(boundArgs).toContain("phone");
    expect(fakeDb.run).toHaveBeenCalledTimes(1);
  });

  it("スナップショットはD1から取得した値のみから組み立てる(クライアント提供値は使わない)", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    fetchFacilityByIdMock.mockResolvedValue(FAKE_FACILITY);
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    await POST(makeRequest(VALID_BODY));

    const boundArgs = fakeDb.bind.mock.calls[0] as unknown[];
    const snapshotJson = boundArgs.find((arg) => typeof arg === "string" && arg.startsWith("{"));
    expect(snapshotJson).toBeDefined();
    const snapshot = JSON.parse(snapshotJson as string);
    expect(snapshot).toEqual({
      name: FAKE_FACILITY.name,
      municipality: FAKE_FACILITY.municipality,
      categoryType: FAKE_FACILITY.categoryType,
      address: FAKE_FACILITY.address,
      phone: FAKE_FACILITY.phone,
      url: FAKE_FACILITY.url,
      description: FAKE_FACILITY.description,
      contactMethods: FAKE_FACILITY.contactMethods,
      datasetId: FAKE_FACILITY.datasetId,
      datasetTitle: FAKE_FACILITY.datasetTitle,
      fetchedAt: FAKE_FACILITY.fetchedAt,
    });
  });

  it("不正な JSON body は 400 を返し、外部依存を呼び出さない", async () => {
    const response = await POST(makeRequest(undefined, "not json"));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
    expect(fetchFacilityByIdMock).not.toHaveBeenCalled();
  });

  it("zod検証エラー(未知のcategory)は 400 を返す", async () => {
    const response = await POST(makeRequest({ facilityId: "fac-001", category: "unknown-category" }));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("closureカテゴリでclosureStatus欠損は400を返す", async () => {
    const response = await POST(makeRequest({ facilityId: "fac-001", category: "closure" }));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("存在しないfacilityIdは404を返す", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    fetchFacilityByIdMock.mockResolvedValue(null);
    getDbMock.mockReturnValue(makeFakeDb());

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(404);
  });

  it("レート制限超過時は429を返し、D1書き込みは行わない", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.retryAfterSeconds).toBe(42);
    expect(fetchFacilityByIdMock).not.toHaveBeenCalled();
    expect(fakeDb.prepare).not.toHaveBeenCalled();
  });

  it("ハニーポット(website非空)は200を返すがD1書き込みは一切行わない", async () => {
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest({ ...VALID_BODY, website: "http://spam.example" }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ ok: true });
    expect(consumeReportRateLimitMock).not.toHaveBeenCalled();
    expect(fetchFacilityByIdMock).not.toHaveBeenCalled();
    expect(fakeDb.prepare).not.toHaveBeenCalled();
  });

  it("D1 例外時は500を返し、例外詳細をレスポンスに含めない", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    fetchFacilityByIdMock.mockResolvedValue(FAKE_FACILITY);
    const run = vi.fn().mockRejectedValue(new Error("D1 unavailable: secret detail"));
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    getDbMock.mockReturnValue({ prepare, bind, run });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret detail");
  });

  it("getDb()自体が失敗した場合は502を返す", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    getDbMock.mockImplementation(() => {
      throw new Error("binding not configured");
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("binding not configured");
  });

  it("Originヘッダーが自オリジンと異なる場合は403を返す(G-3)", async () => {
    const response = await POST(makeRequest(VALID_BODY, undefined, { origin: "https://evil.example.com" }));

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json).toEqual({ error: "invalid request origin" });
    expect(getDbMock).not.toHaveBeenCalled();
    expect(fetchFacilityByIdMock).not.toHaveBeenCalled();
  });

  it("リクエストボディが10KBを超える場合は413を返す(G-3)", async () => {
    const oversizedRawBody = JSON.stringify({ ...VALID_BODY, detailText: "あ".repeat(6000) });
    expect(new TextEncoder().encode(oversizedRawBody).length).toBeGreaterThan(10 * 1024);

    const response = await POST(makeRequest(undefined, oversizedRawBody));

    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json).toEqual({ error: "request body too large" });
    expect(getDbMock).not.toHaveBeenCalled();
    expect(fetchFacilityByIdMock).not.toHaveBeenCalled();
  });
});
