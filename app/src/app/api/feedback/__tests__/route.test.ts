import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

const { consumeFeedbackRateLimitMock } = vi.hoisted(() => ({ consumeFeedbackRateLimitMock: vi.fn() }));
vi.mock("@/lib/feedback/rate-limit", () => ({ consumeFeedbackRateLimit: consumeFeedbackRateLimitMock }));

import { POST } from "@/app/api/feedback/route";

function makeRequest(body: unknown, rawBody?: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/feedback", {
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/feedback", () => {
  it("正常系(rating): D1へUPSERTして200を返す", async () => {
    consumeFeedbackRateLimitMock.mockResolvedValue({ allowed: true });
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest({ kind: "rating", source: "support-results", rating: "clear" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fakeDb.prepare).toHaveBeenCalledTimes(1);
    expect(fakeDb.prepare.mock.calls[0][0]).toMatch(/INSERT INTO feedback_rating_counts/);
    expect(fakeDb.prepare.mock.calls[0][0]).toMatch(/ON CONFLICT\(date, source, rating\) DO UPDATE SET count = count \+ 1/);
    const boundArgs = fakeDb.bind.mock.calls[0];
    expect(boundArgs).toContain("support-results");
    expect(boundArgs).toContain("clear");
    expect(fakeDb.run).toHaveBeenCalledTimes(1);
  });

  it("正常系(unclear-reason): D1へUPSERTして200を返す", async () => {
    consumeFeedbackRateLimitMock.mockResolvedValue({ allowed: true });
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest({ kind: "unclear-reason", source: "support-results", reason: "info-gap" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fakeDb.prepare.mock.calls[0][0]).toMatch(/INSERT INTO feedback_unclear_reason_counts/);
    const boundArgs = fakeDb.bind.mock.calls[0];
    expect(boundArgs).toContain("info-gap");
  });

  it("正常系(comment, publishConsent=true): D1へINSERTし、publishedは常に0で固定する", async () => {
    consumeFeedbackRateLimitMock.mockResolvedValue({ allowed: true });
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(
      makeRequest({ kind: "comment", source: "result-prepare", commentText: "助かりました", publishConsent: true }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fakeDb.prepare.mock.calls[0][0]).toMatch(/INSERT INTO feedback_comments/);
    const boundArgs = fakeDb.bind.mock.calls[0];
    expect(boundArgs).toContain("助かりました");
    expect(boundArgs).toContain(1);
    expect(boundArgs).not.toContain(true);
  });

  it("正常系(comment, publishConsent=false): publish_consentが0で保存される", async () => {
    consumeFeedbackRateLimitMock.mockResolvedValue({ allowed: true });
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    await POST(
      makeRequest({ kind: "comment", source: "result-prepare", commentText: "分かりにくかったです", publishConsent: false }),
    );

    const boundArgs = fakeDb.bind.mock.calls[0] as unknown[];
    // id, created_date, source, comment_text, publish_consent(=0) の5引数。
    expect(boundArgs[4]).toBe(0);
  });

  it("ハニーポット(comment + website非空)は200を返すがD1書き込みは一切行わない", async () => {
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(
      makeRequest({
        kind: "comment",
        source: "support-results",
        commentText: "test",
        publishConsent: false,
        website: "http://spam.example",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(consumeFeedbackRateLimitMock).not.toHaveBeenCalled();
    expect(fakeDb.prepare).not.toHaveBeenCalled();
  });

  it("不正な JSON body は 400 を返し、外部依存を呼び出さない", async () => {
    const response = await POST(makeRequest(undefined, "not json"));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
    expect(consumeFeedbackRateLimitMock).not.toHaveBeenCalled();
  });

  it("zod検証エラー(未知のrating)は400を返す", async () => {
    const response = await POST(makeRequest({ kind: "rating", source: "support-results", rating: "unknown" }));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it(".strict()違反(未知のプロパティ)は400を返す", async () => {
    const response = await POST(
      makeRequest({ kind: "rating", source: "support-results", rating: "clear", extra: "nope" }),
    );

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("kindに応じないフィールド混在(rating+commentText)は400を返す", async () => {
    const response = await POST(
      makeRequest({ kind: "rating", source: "support-results", rating: "clear", commentText: "x" }),
    );

    expect(response.status).toBe(400);
  });

  it("レート制限超過時は429を返し、D1書き込みは行わない", async () => {
    consumeFeedbackRateLimitMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest({ kind: "rating", source: "support-results", rating: "clear" }));

    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.retryAfterSeconds).toBe(42);
    expect(fakeDb.prepare).not.toHaveBeenCalled();
  });

  it("D1 例外時は500を返し、例外詳細をレスポンスに含めない", async () => {
    consumeFeedbackRateLimitMock.mockResolvedValue({ allowed: true });
    const run = vi.fn().mockRejectedValue(new Error("D1 unavailable: secret detail"));
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    getDbMock.mockReturnValue({ prepare, bind, run });

    const response = await POST(makeRequest({ kind: "rating", source: "support-results", rating: "clear" }));

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret detail");
  });

  it("getDb()自体が失敗した場合は502を返す", async () => {
    consumeFeedbackRateLimitMock.mockResolvedValue({ allowed: true });
    getDbMock.mockImplementation(() => {
      throw new Error("binding not configured");
    });

    const response = await POST(makeRequest({ kind: "rating", source: "support-results", rating: "clear" }));

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("binding not configured");
  });

  it("Originヘッダーが自オリジンと異なる場合は403を返す", async () => {
    const response = await POST(
      makeRequest({ kind: "rating", source: "support-results", rating: "clear" }, undefined, {
        origin: "https://evil.example.com",
      }),
    );

    expect(response.status).toBe(403);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("リクエストボディが10KBを超える場合は413を返す", async () => {
    const oversizedRawBody = JSON.stringify({
      kind: "comment",
      source: "support-results",
      commentText: "あ".repeat(500),
      publishConsent: false,
      website: "x".repeat(9000),
    });
    expect(new TextEncoder().encode(oversizedRawBody).length).toBeGreaterThan(10 * 1024);

    const response = await POST(makeRequest(undefined, oversizedRawBody));

    expect(response.status).toBe(413);
    expect(getDbMock).not.toHaveBeenCalled();
  });
});
