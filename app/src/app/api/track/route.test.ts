import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: (...args: unknown[]) => getDbMock(...args),
}));

import { POST } from "@/app/api/track/route";

function makeRequest(body: unknown, init?: { rawBody?: string; headers?: Record<string, string> }): NextRequest {
  return new NextRequest("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.rawBody ?? JSON.stringify(body),
  });
}

function makeFakeDb() {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, bind, run };
}

describe("POST /api/track", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("正常な screen を UPSERT し 200 を返す", async () => {
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest({ screen: "top" }));

    expect(response.status).toBe(200);
    expect(fakeDb.prepare).toHaveBeenCalledTimes(1);
    expect(fakeDb.prepare.mock.calls[0][0]).toMatch(/INSERT INTO usage_counts/);
    expect(fakeDb.bind).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "top");
    expect(fakeDb.run).toHaveBeenCalledTimes(1);
  });

  it.each(["top", "survey", "result", "support-results"])("screen=%s を受け付ける", async (screen) => {
    const fakeDb = makeFakeDb();
    getDbMock.mockReturnValue(fakeDb);

    const response = await POST(makeRequest({ screen }));

    expect(response.status).toBe(200);
  });

  it("未知の screen 値は 400 を返し D1 へアクセスしない", async () => {
    const response = await POST(makeRequest({ screen: "unknown-screen" }));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("screen 欠損は 400 を返す", async () => {
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("未知のプロパティ(strict 違反)を含む body は 400 を返す", async () => {
    const response = await POST(
      makeRequest({ screen: "top", score: 42, freeText: "hello", municipality: "世田谷区" }),
    );

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("スコア・自由記述・年齢・地域・共有URL内容を含む body は 400 で拒否される", async () => {
    const response = await POST(
      makeRequest({
        screen: "result",
        score: { adhd: 12, asd: 8 },
        age: "child",
        municipality: "新宿区",
        shareHash: "#r=abcdef",
      }),
    );

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("不正な JSON body は 400 を返す", async () => {
    const response = await POST(makeRequest(undefined, { rawBody: "not json" }));

    expect(response.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("Originヘッダーが自オリジンと異なる場合は403を返す(G-3)", async () => {
    const response = await POST(makeRequest({ screen: "top" }, { headers: { origin: "https://evil.example.com" } }));

    expect(response.status).toBe(403);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("リクエストボディが10KBを超える場合は413を返す(G-3)", async () => {
    const oversizedRawBody = JSON.stringify({ screen: "top", padding: "あ".repeat(6000) });
    expect(new TextEncoder().encode(oversizedRawBody).length).toBeGreaterThan(10 * 1024);

    const response = await POST(makeRequest(undefined, { rawBody: oversizedRawBody }));

    expect(response.status).toBe(413);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("D1 アクセスが失敗した場合は 500 を返す(呼び出し元には fire-and-forget で伝播しない前提)", async () => {
    const run = vi.fn().mockRejectedValue(new Error("D1 unavailable"));
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    getDbMock.mockReturnValue({ prepare, bind, run });

    const response = await POST(makeRequest({ screen: "top" }));

    expect(response.status).toBe(500);
  });
});
