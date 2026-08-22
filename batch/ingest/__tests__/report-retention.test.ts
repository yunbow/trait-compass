import { describe, expect, it, vi } from "vitest";

import {
  NEW_REPORT_ABSOLUTE_RETENTION_DAYS,
  purgeExpiredReports,
  REPORT_RETENTION_DAYS,
} from "../report-retention";

describe("REPORT_RETENTION_DAYS", () => {
  it("90日である", () => {
    expect(REPORT_RETENTION_DAYS).toBe(90);
  });
});

describe("NEW_REPORT_ABSOLUTE_RETENTION_DAYS", () => {
  it("365日である", () => {
    expect(NEW_REPORT_ABSOLUTE_RETENTION_DAYS).toBe(365);
  });
});

describe("purgeExpiredReports", () => {
  function createFakeDb(changes: {
    facilityTriaged: number;
    contentTriaged: number;
    facilityNew: number;
    contentNew: number;
  }) {
    const calls: { sql: string; bound: unknown[] }[] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bound: unknown[]) => {
          calls.push({ sql, bound });
          const isFacility = sql.includes("facility_reports");
          const isTriaged = sql.includes("status != 'new'");
          const count = isFacility
            ? isTriaged
              ? changes.facilityTriaged
              : changes.facilityNew
            : isTriaged
              ? changes.contentTriaged
              : changes.contentNew;
          return {
            run: vi.fn(async () => ({ meta: { changes: count } })),
          };
        }),
      })),
    };
    return { db, calls };
  }

  const ZERO_CHANGES = { facilityTriaged: 0, contentTriaged: 0, facilityNew: 0, contentNew: 0 };

  it("status != 'new' かつ status_updated_at がカットオフより前の行を削除する(90日)", async () => {
    const { db, calls } = createFakeDb({ ...ZERO_CHANGES, facilityTriaged: 2, contentTriaged: 1 });
    const nowMs = new Date("2026-08-07T00:00:00.000Z").getTime();

    const result = await purgeExpiredReports(db as unknown as D1Database, nowMs);

    expect(result).toEqual({ facilityReports: 2, contentReports: 1 });

    const facilityCall = calls.find(
      ({ sql }) => sql.includes("facility_reports") && sql.includes("status != 'new'"),
    );
    expect(facilityCall?.sql).toContain("status_updated_at IS NOT NULL");
    expect(facilityCall?.sql).toContain("status_updated_at < ?");
    // 90日前 = 2026-05-09T00:00:00.000Z
    expect(facilityCall?.bound[0]).toBe("2026-05-09T00:00:00.000Z");

    const contentCall = calls.find(
      ({ sql }) => sql.includes("content_reports") && sql.includes("status != 'new'"),
    );
    expect(contentCall?.bound[0]).toBe("2026-05-09T00:00:00.000Z");
  });

  it("status = 'new' かつ created_at がカットオフより前の行を削除する(365日)", async () => {
    const { db, calls } = createFakeDb({ ...ZERO_CHANGES, facilityNew: 3, contentNew: 4 });
    const nowMs = new Date("2026-08-07T00:00:00.000Z").getTime();

    const result = await purgeExpiredReports(db as unknown as D1Database, nowMs);

    expect(result).toEqual({ facilityReports: 3, contentReports: 4 });

    const facilityCall = calls.find(
      ({ sql }) => sql.includes("facility_reports") && sql.includes("status = 'new'"),
    );
    expect(facilityCall?.sql).toContain("created_at < ?");
    // 365日前 = 2025-08-07T00:00:00.000Z
    expect(facilityCall?.bound[0]).toBe("2025-08-07T00:00:00.000Z");

    const contentCall = calls.find(
      ({ sql }) => sql.includes("content_reports") && sql.includes("status = 'new'"),
    );
    expect(contentCall?.bound[0]).toBe("2025-08-07T00:00:00.000Z");
  });

  it("トリアージ済みの削除件数と未対応(1年超)の削除件数を合算して返す", async () => {
    const { db } = createFakeDb({
      facilityTriaged: 2,
      contentTriaged: 1,
      facilityNew: 3,
      contentNew: 4,
    });

    const result = await purgeExpiredReports(db as unknown as D1Database);

    expect(result).toEqual({ facilityReports: 5, contentReports: 5 });
  });

  it("削除0件でも例外を投げない", async () => {
    const { db } = createFakeDb(ZERO_CHANGES);

    await expect(purgeExpiredReports(db as unknown as D1Database)).resolves.toEqual({
      facilityReports: 0,
      contentReports: 0,
    });
  });
});
