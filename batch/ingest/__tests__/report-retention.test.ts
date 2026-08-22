import { describe, expect, it, vi } from "vitest";

import { purgeExpiredReports, REPORT_RETENTION_DAYS } from "../report-retention";

describe("REPORT_RETENTION_DAYS", () => {
  it("90日である", () => {
    expect(REPORT_RETENTION_DAYS).toBe(90);
  });
});

describe("purgeExpiredReports", () => {
  function createFakeDb(changes: { facility: number; content: number }) {
    const calls: { sql: string; bound: unknown[] }[] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bound: unknown[]) => {
          calls.push({ sql, bound });
          return {
            run: vi.fn(async () => ({
              meta: { changes: sql.includes("facility_reports") ? changes.facility : changes.content },
            })),
          };
        }),
      })),
    };
    return { db, calls };
  }

  it("status != 'new' かつ status_updated_at がカットオフより前の行だけを削除する", async () => {
    const { db, calls } = createFakeDb({ facility: 2, content: 1 });
    const nowMs = new Date("2026-08-07T00:00:00.000Z").getTime();

    const result = await purgeExpiredReports(db as unknown as D1Database, nowMs);

    expect(result).toEqual({ facilityReports: 2, contentReports: 1 });
    expect(calls).toHaveLength(2);

    const facilityCall = calls.find(({ sql }) => sql.includes("facility_reports"));
    expect(facilityCall?.sql).toContain("status != 'new'");
    expect(facilityCall?.sql).toContain("status_updated_at IS NOT NULL");
    expect(facilityCall?.sql).toContain("status_updated_at < ?");
    // 90日前 = 2026-05-09T00:00:00.000Z
    expect(facilityCall?.bound[0]).toBe("2026-05-09T00:00:00.000Z");

    const contentCall = calls.find(({ sql }) => sql.includes("content_reports"));
    expect(contentCall?.bound[0]).toBe("2026-05-09T00:00:00.000Z");
  });

  it("status='new'(未対応)の行は対象外にするWHERE句を発行する(SQL自体で保証)", async () => {
    const { db, calls } = createFakeDb({ facility: 0, content: 0 });

    await purgeExpiredReports(db as unknown as D1Database);

    expect(calls.every(({ sql }) => sql.includes("status != 'new'"))).toBe(true);
  });

  it("削除0件でも例外を投げない", async () => {
    const { db } = createFakeDb({ facility: 0, content: 0 });

    await expect(purgeExpiredReports(db as unknown as D1Database)).resolves.toEqual({
      facilityReports: 0,
      contentReports: 0,
    });
  });
});
