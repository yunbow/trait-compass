import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto as unknown as Crypto);

import {
  buildClientKey,
  createFixedWindowRateLimiter,
  isOverLimit,
  readClientIp,
  resolveWindowStart,
} from "@/lib/rate-limit/fixed-window";

describe("固定ウィンドウ・レートリミッタのファクトリ", () => {
  beforeEach(() => vi.clearAllMocks());

  it("固定ウィンドウ境界を解決する", () => {
    expect(resolveWindowStart(601_000, 600)).toBe(resolveWindowStart(605_000, 600));
    expect(resolveWindowStart(599_000, 600)).not.toBe(resolveWindowStart(600_000, 600));
    expect(resolveWindowStart(601_000, 600) % 600).toBe(0);
  });

  it("上限ちょうどは許可し、超過時のみ拒否する", () => {
    expect(isOverLimit(10, 10)).toBe(false);
    expect(isOverLimit(11, 10)).toBe(true);
  });

  it("Cloudflare の接続元 IP だけを読む", () => {
    expect(readClientIp(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }))).toBe("203.0.113.10");
    expect(readClientIp(new Request("https://example.test"))).toBeNull();
    expect(readClientIp(new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.10" } }))).toBeNull();
  });

  it("IP を平文保存しないウィンドウ別 SHA-256 キーを作る", async () => {
    const key = await buildClientKey("203.0.113.10", 600, "salt");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(await buildClientKey("203.0.113.10", 600, "salt")).toBe(key);
    expect(await buildClientKey("203.0.113.10", 1200, "salt")).not.toBe(key);
    expect(key).not.toContain("203.0.113.10");
  });

  it("IP が無い場合は D1 に触れずフェイルオープンする", async () => {
    const limiter = createFixedWindowRateLimiter({ tableName: "ai_rate_limits", windowSeconds: 600, maxRequests: 10 });
    await expect(limiter.consume(new Request("https://example.test"))).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("count == maxRequests は許可する(境界値)", async () => {
    const db = {
      prepare: () => ({ bind: () => ({}) }),
      batch: vi.fn().mockResolvedValue([{}, {}, { results: [{ count: 10 }] }]),
    };
    getDbMock.mockReturnValue(db);
    const limiter = createFixedWindowRateLimiter({ tableName: "ai_rate_limits", windowSeconds: 600, maxRequests: 10 });
    const result = await limiter.consume(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }), 601_000);
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("count == maxRequests + 1 は拒否する(境界値)", async () => {
    const statements: { sql: string; values: unknown[] }[] = [];
    const db = {
      prepare: (sql: string) => ({ bind: (...values: unknown[]) => {
        statements.push({ sql, values });
        return {};
      } }),
      batch: vi.fn().mockResolvedValue([{}, {}, { results: [{ count: 11 }] }]),
    };
    getDbMock.mockReturnValue(db);
    const limiter = createFixedWindowRateLimiter({ tableName: "ai_rate_limits", windowSeconds: 600, maxRequests: 10 });
    const result = await limiter.consume(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }), 601_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(statements.every(({ sql }) => sql.includes("ai_rate_limits"))).toBe(true);
    expect(statements.flatMap(({ values }) => values)).not.toContain("203.0.113.10");
  });

  it("テーブル名は config で分離される(report_rate_limits)", async () => {
    const statements: { sql: string }[] = [];
    const db = {
      prepare: (sql: string) => ({ bind: () => {
        statements.push({ sql });
        return {};
      } }),
      batch: vi.fn().mockResolvedValue([{}, {}, { results: [{ count: 1 }] }]),
    };
    getDbMock.mockReturnValue(db);
    const limiter = createFixedWindowRateLimiter({ tableName: "report_rate_limits", windowSeconds: 600, maxRequests: 5 });
    await limiter.consume(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }), 601_000);
    expect(statements.every(({ sql }) => sql.includes("report_rate_limits"))).toBe(true);
    expect(statements.some(({ sql }) => sql.includes("ai_rate_limits"))).toBe(false);
  });

  it("D1 例外時はフェイルオープンする", async () => {
    getDbMock.mockImplementation(() => { throw new Error("unavailable"); });
    const limiter = createFixedWindowRateLimiter({ tableName: "ai_rate_limits", windowSeconds: 600, maxRequests: 10 });
    await expect(limiter.consume(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }))).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  describe("failClosed: true(パスワード認証ゲート等、フェイルオープンさせたくない用途)", () => {
    it("IP が無い場合は D1 に触れずフェイルクローズする", async () => {
      const limiter = createFixedWindowRateLimiter({
        tableName: "beta_gate_rate_limits",
        windowSeconds: 600,
        maxRequests: 5,
        failClosed: true,
      });
      const result = await limiter.consume(new Request("https://example.test"));
      expect(result.allowed).toBe(false);
      expect(getDbMock).not.toHaveBeenCalled();
    });

    it("D1 例外時はフェイルクローズする", async () => {
      getDbMock.mockImplementation(() => { throw new Error("unavailable"); });
      const limiter = createFixedWindowRateLimiter({
        tableName: "beta_gate_rate_limits",
        windowSeconds: 600,
        maxRequests: 5,
        failClosed: true,
      });
      const result = await limiter.consume(
        new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }),
      );
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("上限以内であれば通常どおり許可する(failClosedはD1障害時のみ作用する)", async () => {
      const db = {
        prepare: () => ({ bind: () => ({}) }),
        batch: vi.fn().mockResolvedValue([{}, {}, { results: [{ count: 1 }] }]),
      };
      getDbMock.mockReturnValue(db);
      const limiter = createFixedWindowRateLimiter({
        tableName: "beta_gate_rate_limits",
        windowSeconds: 600,
        maxRequests: 5,
        failClosed: true,
      });
      const result = await limiter.consume(
        new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }),
        601_000,
      );
      expect(result.allowed).toBe(true);
    });
  });
});
