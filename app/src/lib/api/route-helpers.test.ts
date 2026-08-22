import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// report-and-track-route-preflight (Phase 2-2, パターンG拡張): facility-report/content-report/
// track の3ルートで逐語一致していた「同一オリジン+サイズ上限 → JSON.parse → schema.safeParse」の
// 12行を `parseSimpleJsonBody` に、ask/recommend/prepare/facility-report/content-report の5ルートで
// 構造100%一致していた getDb() の try/catch を `getDbOrErrorResponse` に統合する。
//
// この時点では `parseSimpleJsonBody`/`getDbOrErrorResponse` は未実装のため、このテストは
// red(コンパイルエラーもしくは失敗)である。docs/logic-consolidation/report-and-track-route-preflight.md
// 参照。

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

import { getDbOrErrorResponse, parseSimpleJsonBody } from "@/lib/api/route-helpers";

const SimpleSchema = z
  .object({
    facilityId: z.string(),
    website: z.string().optional(),
  })
  .strict();

function makeRequest(rawBody: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/whatever", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody,
  });
}

beforeEach(() => {
  getDbMock.mockReset();
});

describe("parseSimpleJsonBody", () => {
  it("同一オリジン・サイズ上限内・妥当な JSON・schema 一致であれば ok:true でパース済みデータを返す", async () => {
    const result = await parseSimpleJsonBody(makeRequest(JSON.stringify({ facilityId: "fac-001" })), SimpleSchema);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ facilityId: "fac-001" });
    }
  });

  it("Origin ヘッダーが自オリジンと異なる場合は 403 invalid request origin を返す", async () => {
    const result = await parseSimpleJsonBody(
      makeRequest(JSON.stringify({ facilityId: "fac-001" }), { origin: "https://evil.example.com" }),
      SimpleSchema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const json = await result.response.json();
      expect(json).toEqual({ error: "invalid request origin" });
    }
  });

  it("既定の10KB上限を超える場合は 413 request body too large を返す", async () => {
    const oversized = JSON.stringify({ facilityId: "fac-001", website: "あ".repeat(6000) });
    expect(new TextEncoder().encode(oversized).length).toBeGreaterThan(10 * 1024);

    const result = await parseSimpleJsonBody(makeRequest(oversized), SimpleSchema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
      const json = await result.response.json();
      expect(json).toEqual({ error: "request body too large" });
    }
  });

  it("options.maxBodyBytes を渡すとその上限が優先される", async () => {
    const body = JSON.stringify({ facilityId: "fac-001" });
    expect(new TextEncoder().encode(body).length).toBeLessThan(10 * 1024);

    const result = await parseSimpleJsonBody(makeRequest(body), SimpleSchema, { maxBodyBytes: 8 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
    }
  });

  it("不正な JSON body は 400 invalid JSON body を返す", async () => {
    const result = await parseSimpleJsonBody(makeRequest("not json"), SimpleSchema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const json = await result.response.json();
      expect(json).toEqual({ error: "invalid JSON body" });
    }
  });

  it("schema に一致しない body は 400 invalid request body を返す", async () => {
    const result = await parseSimpleJsonBody(makeRequest(JSON.stringify({ facilityId: 123 })), SimpleSchema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const json = await result.response.json();
      expect(json).toEqual({ error: "invalid request body" });
    }
  });

  it("strict schema なので未知のプロパティを含む body は 400 を返す", async () => {
    const result = await parseSimpleJsonBody(
      makeRequest(JSON.stringify({ facilityId: "fac-001", unknownField: "x" })),
      SimpleSchema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe("getDbOrErrorResponse", () => {
  it("getDb() が成功すれば ok:true で db を返す", () => {
    const fakeDb = { prepare: vi.fn() };
    getDbMock.mockReturnValue(fakeDb);

    const result = getDbOrErrorResponse("取得に失敗しました。");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.db).toBe(fakeDb);
    }
  });

  it("getDb() が例外を投げた場合は 502 UPSTREAM_ERROR を、渡したメッセージで返す", () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding not configured: super secret detail");
    });

    const result = getDbOrErrorResponse("施設情報の取得に失敗しました。しばらくしてから再度お試しください。");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(502);
    }
  });

  it("NFR-36: 例外の詳細をレスポンス本文に含めない", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding not configured: super secret detail");
    });

    const result = getDbOrErrorResponse("取得に失敗しました。");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = await result.response.text();
      expect(text).not.toContain("super secret detail");
    }
  });

  it("呼び出し元ごとに異なるメッセージ文言をそのまま応答本文に反映する(既存挙動を変えない)", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("boom");
    });

    const result = getDbOrErrorResponse("掲載情報の取得に失敗しました。しばらくしてから再度お試しください。");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const json = await result.response.json();
      expect(json.error.message).toBe("掲載情報の取得に失敗しました。しばらくしてから再度お試しください。");
      expect(json.error.code).toBe("UPSTREAM_ERROR");
    }
  });
});
