import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto as unknown as Crypto);

import { POST } from "@/app/api/beta-gate/route";
import { verifyBetaGateSessionToken } from "@/lib/beta-gate/session-token";

function extractCookieValue(setCookieHeader: string | null, name: string): string | undefined {
  if (setCookieHeader === null) return undefined;
  const match = new RegExp(`${name}=([^;]+)`).exec(setCookieHeader);
  return match?.[1];
}

function makeRequest(options: {
  password?: string;
  origin?: string;
  cfConnectingIp?: string;
}): NextRequest {
  const formData = new FormData();
  if (options.password !== undefined) {
    formData.append("password", options.password);
  }

  const headers: Record<string, string> = {};
  if (options.origin !== undefined) headers.origin = options.origin;
  if (options.cfConnectingIp !== undefined) headers["cf-connecting-ip"] = options.cfConnectingIp;

  return new NextRequest("http://localhost/api/beta-gate", { method: "POST", body: formData, headers });
}

describe("POST /api/beta-gate", () => {
  let originalPassword: string | undefined;

  beforeEach(() => {
    originalPassword = process.env.CLOSED_BETA_PASSWORD;
    process.env.CLOSED_BETA_PASSWORD = "correct-password";
    vi.clearAllMocks();
    // 既定は上限内の低いカウント(レート制限のfailClosed化で cf-connecting-ip 付き
    // リクエストはD1を経由するようになったため、素通しするデフォルトを用意する)。
    getDbMock.mockReturnValue({
      prepare: () => ({ bind: () => ({}) }),
      batch: vi.fn().mockResolvedValue([{}, {}, { results: [{ count: 1 }] }]),
    });
  });

  afterEach(() => {
    if (originalPassword === undefined) {
      delete process.env.CLOSED_BETA_PASSWORD;
    } else {
      process.env.CLOSED_BETA_PASSWORD = originalPassword;
    }
  });

  it("正しいパスワードなら署名付きCookieを設定してトップページへリダイレクトする", async () => {
    const response = await POST(makeRequest({ password: "correct-password", cfConnectingIp: "203.0.113.10" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/");
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("HttpOnly");
    const token = extractCookieValue(setCookie, "nd-beta-unlocked");
    expect(token).toMatch(/^\d+\.[0-9a-f]+$/);
    await expect(verifyBetaGateSessionToken(token, "correct-password")).resolves.toBe(true);
    await expect(verifyBetaGateSessionToken(token, "wrong-password")).resolves.toBe(false);
  });

  it("誤ったパスワードならエラー付きでベータゲートへリダイレクトする", async () => {
    const response = await POST(makeRequest({ password: "wrong-password", cfConnectingIp: "203.0.113.10" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/beta-gate?error=1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("password フィールドが無い場合もエラー付きでベータゲートへリダイレクトする", async () => {
    const response = await POST(makeRequest({ cfConnectingIp: "203.0.113.10" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/beta-gate?error=1");
  });

  it("環境変数が未設定なら任意のパスワードを送っても解除しない", async () => {
    delete process.env.CLOSED_BETA_PASSWORD;

    const response = await POST(makeRequest({ password: "any-password", cfConnectingIp: "203.0.113.10" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/beta-gate?error=1");
  });

  it("クロスオリジンのリクエストはパスワードを見ずに拒否する", async () => {
    const response = await POST(makeRequest({ password: "correct-password", origin: "https://evil.example" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/beta-gate?error=1");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("レート制限超過時はパスワードを見ずに拒否する", async () => {
    getDbMock.mockReturnValue({
      prepare: () => ({ bind: () => ({}) }),
      batch: vi.fn().mockResolvedValue([{}, {}, { results: [{ count: 6 }] }]),
    });

    const response = await POST(
      makeRequest({ password: "correct-password", cfConnectingIp: "203.0.113.10" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/beta-gate?error=1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("D1障害時はフェイルクローズし、正しいパスワードでも解除しない(セキュリティレビュー指摘)", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("unavailable");
    });

    const response = await POST(
      makeRequest({ password: "correct-password", cfConnectingIp: "203.0.113.10" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/beta-gate?error=1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("レート制限内かつ cf-connecting-ip 付きなら通常どおり判定する", async () => {
    getDbMock.mockReturnValue({
      prepare: () => ({ bind: () => ({}) }),
      batch: vi.fn().mockResolvedValue([{}, {}, { results: [{ count: 1 }] }]),
    });

    const response = await POST(
      makeRequest({ password: "correct-password", cfConnectingIp: "203.0.113.10" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/");
    const token = extractCookieValue(response.headers.get("set-cookie"), "nd-beta-unlocked");
    await expect(verifyBetaGateSessionToken(token, "correct-password")).resolves.toBe(true);
  });
});
