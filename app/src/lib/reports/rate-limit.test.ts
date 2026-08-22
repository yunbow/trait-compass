import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto as unknown as Crypto);

import {
  REPORT_RATE_LIMIT_MAX_REQUESTS,
  buildReportClientKey,
  consumeReportRateLimit,
  isReportOverLimit,
  readReportClientIp,
  resolveReportWindowStart,
} from "@/lib/reports/rate-limit";

describe("掲載情報の誤り報告 送信レート制限(TICKET-0064)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("固定ウィンドウ境界を解決する", () => {
    expect(resolveReportWindowStart(601_000)).toBe(resolveReportWindowStart(605_000));
    expect(resolveReportWindowStart(599_000)).not.toBe(resolveReportWindowStart(600_000));
    expect(resolveReportWindowStart(601_000) % 600).toBe(0);
  });

  it("上限ちょうどは許可し、超過時のみ拒否する", () => {
    expect(isReportOverLimit(REPORT_RATE_LIMIT_MAX_REQUESTS)).toBe(false);
    expect(isReportOverLimit(REPORT_RATE_LIMIT_MAX_REQUESTS + 1)).toBe(true);
  });

  it("AI版より厳しい上限(5 req/600秒)である", () => {
    expect(REPORT_RATE_LIMIT_MAX_REQUESTS).toBe(5);
  });

  it("Cloudflare の接続元 IP だけを読む", () => {
    expect(readReportClientIp(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }))).toBe("203.0.113.10");
    expect(readReportClientIp(new Request("https://example.test"))).toBeNull();
    expect(readReportClientIp(new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.10" } }))).toBeNull();
  });

  it("IP を平文保存しないウィンドウ別 SHA-256 キーを作る", async () => {
    const key = await buildReportClientKey("203.0.113.10", 600, "salt");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(await buildReportClientKey("203.0.113.10", 600, "salt")).toBe(key);
    expect(await buildReportClientKey("203.0.113.10", 1200, "salt")).not.toBe(key);
    expect(key).not.toContain("203.0.113.10");
  });

  it("IP が無い場合は D1 に触れずフェイルオープンする", async () => {
    await expect(consumeReportRateLimit(new Request("https://example.test"))).resolves.toEqual({ allowed: true });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("D1 の3文バッチでカウンタを消費し、上限超過を拒否する", async () => {
    const statements: { sql: string; values: unknown[] }[] = [];
    const db = {
      prepare: (sql: string) => ({ bind: (...values: unknown[]) => {
        statements.push({ sql, values });
        return {};
      } }),
      batch: vi.fn().mockResolvedValue([{}, {}, { results: [{ count: REPORT_RATE_LIMIT_MAX_REQUESTS + 1 }] }]),
    };
    getDbMock.mockReturnValue(db);
    const result = await consumeReportRateLimit(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }), 601_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(statements.map(({ sql }) => sql)).toEqual(expect.arrayContaining([
      expect.stringContaining("report_rate_limits"),
      expect.stringContaining("ON CONFLICT"),
      expect.stringContaining("SELECT"),
    ]));
    expect(statements.flatMap(({ values }) => values)).not.toContain("203.0.113.10");
  });

  it("上限以内は許可する", async () => {
    const db = {
      prepare: () => ({ bind: () => ({}) }),
      batch: vi.fn().mockResolvedValue([{}, {}, { results: [{ count: REPORT_RATE_LIMIT_MAX_REQUESTS }] }]),
    };
    getDbMock.mockReturnValue(db);
    const result = await consumeReportRateLimit(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }), 601_000);
    expect(result.allowed).toBe(true);
  });

  it("D1 例外時はフェイルオープンする", async () => {
    getDbMock.mockImplementation(() => { throw new Error("unavailable"); });
    await expect(consumeReportRateLimit(new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.10" } }))).resolves.toEqual({ allowed: true });
  });
});
