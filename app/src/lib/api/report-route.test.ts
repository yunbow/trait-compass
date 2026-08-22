import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// report-and-track-route-preflight (Phase 2-2): facility-report/content-report の2ルートで
// 完全一致していた「parseSimpleJsonBody → ハニーポット → consumeReportRateLimit → getDb」の
// 前処理を `preflightReportSubmission` に統合する。track/ask/recommend/prepare はこのモジュールの
// 対象外(track は parseSimpleJsonBody のみ、ask/recommend/prepare は getDbOrErrorResponse のみを
// route-helpers.ts から直接使う設計のため)。
//
// この時点では `@/lib/api/report-route` は未実装のため、このテストは red(コンパイルエラーもしくは
// 失敗)である。docs/logic-consolidation/report-and-track-route-preflight.md 参照。

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

const { consumeReportRateLimitMock } = vi.hoisted(() => ({ consumeReportRateLimitMock: vi.fn() }));
vi.mock("@/lib/reports/rate-limit", () => ({ consumeReportRateLimit: consumeReportRateLimitMock }));

import { preflightReportSubmission, reportInsertFailureResponse } from "@/lib/api/report-route";

const TestSchema = z
  .object({
    facilityId: z.string(),
    category: z.enum(["phone", "closure"]),
    website: z.string().optional(),
  })
  .strict();

const VALID_BODY = { facilityId: "fac-001", category: "phone" as const };
const DB_ERROR_MESSAGE = "施設情報の取得に失敗しました。しばらくしてから再度お試しください。";

function makeRequest(rawBody: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/facility-report", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody,
  });
}

function makeFakeDb() {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, bind, run };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("preflightReportSubmission", () => {
  it("正常系: パース成功・ハニーポット非該当・レート制限内・getDb成功であれば proceed:true で data と db を返す", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const result = await preflightReportSubmission(makeRequest(JSON.stringify(VALID_BODY)), TestSchema, {
      dbErrorMessage: DB_ERROR_MESSAGE,
    });

    expect(result.proceed).toBe(true);
    if (result.proceed) {
      expect(result.data).toEqual(VALID_BODY);
      expect(result.db).toBe(fakeDb);
    }
  });

  it("Origin ヘッダーが自オリジンと異なる場合は 403 を返し、レート制限・getDb を呼ばない", async () => {
    const result = await preflightReportSubmission(
      makeRequest(JSON.stringify(VALID_BODY), { origin: "https://evil.example.com" }),
      TestSchema,
      { dbErrorMessage: DB_ERROR_MESSAGE },
    );

    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.response.status).toBe(403);
    }
    expect(consumeReportRateLimitMock).not.toHaveBeenCalled();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("リクエストボディが10KBを超える場合は413を返す", async () => {
    const oversizedBody = JSON.stringify({ ...VALID_BODY, website: "あ".repeat(6000) });
    expect(new TextEncoder().encode(oversizedBody).length).toBeGreaterThan(10 * 1024);

    const result = await preflightReportSubmission(makeRequest(oversizedBody), TestSchema, {
      dbErrorMessage: DB_ERROR_MESSAGE,
    });

    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.response.status).toBe(413);
    }
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("不正な JSON body は 400 を返す", async () => {
    const result = await preflightReportSubmission(makeRequest("not json"), TestSchema, {
      dbErrorMessage: DB_ERROR_MESSAGE,
    });

    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.response.status).toBe(400);
    }
  });

  it("schema 不一致(未知の category)は 400 を返す", async () => {
    const result = await preflightReportSubmission(
      makeRequest(JSON.stringify({ facilityId: "fac-001", category: "unknown" })),
      TestSchema,
      { dbErrorMessage: DB_ERROR_MESSAGE },
    );

    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.response.status).toBe(400);
    }
  });

  it("ハニーポット(website非空)は偽の200 {ok:true}を返し、レート制限を消費しない(現行の順序: honeypot が rate limit より前)", async () => {
    const result = await preflightReportSubmission(
      makeRequest(JSON.stringify({ ...VALID_BODY, website: "http://spam.example" })),
      TestSchema,
      { dbErrorMessage: DB_ERROR_MESSAGE },
    );

    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.response.status).toBe(200);
      const json = await result.response.json();
      expect(json).toEqual({ ok: true });
    }
    expect(consumeReportRateLimitMock).not.toHaveBeenCalled();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("レート制限超過時は429を返し、retryAfterSecondsを含み、getDbを呼ばない", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });

    const result = await preflightReportSubmission(makeRequest(JSON.stringify(VALID_BODY)), TestSchema, {
      dbErrorMessage: DB_ERROR_MESSAGE,
    });

    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.response.status).toBe(429);
      const json = await result.response.json();
      expect(json).toEqual({ error: "rate limited", retryAfterSeconds: 42 });
    }
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("getDb() が失敗した場合は502を返し、options.dbErrorMessageの文言を使う(例外詳細は含めない)", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    getDbMock.mockImplementation(() => {
      throw new Error("binding not configured: secret detail");
    });

    const result = await preflightReportSubmission(makeRequest(JSON.stringify(VALID_BODY)), TestSchema, {
      dbErrorMessage: DB_ERROR_MESSAGE,
    });

    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      expect(result.response.status).toBe(502);
      const text = await result.response.text();
      expect(text).not.toContain("secret detail");
      expect(text).toContain(DB_ERROR_MESSAGE);
    }
  });

  it("content-report 用の別の dbErrorMessage を渡した場合、その文言で502を返す", async () => {
    consumeReportRateLimitMock.mockResolvedValue({ allowed: true });
    getDbMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const contentReportMessage = "掲載情報の取得に失敗しました。しばらくしてから再度お試しください。";

    const result = await preflightReportSubmission(makeRequest(JSON.stringify(VALID_BODY)), TestSchema, {
      dbErrorMessage: contentReportMessage,
    });

    expect(result.proceed).toBe(false);
    if (!result.proceed) {
      const json = await result.response.json();
      expect(json.error.message).toBe(contentReportMessage);
    }
  });
});

describe("reportInsertFailureResponse", () => {
  it("INSERT 失敗時の共通応答として、例外詳細を含まない500を返す", async () => {
    const response = reportInsertFailureResponse();

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
    expect(json.error.message).toBe("送信できませんでした。しばらくしてから再度お試しください。");
  });
});
