import { describe, expect, it, vi } from "vitest";

import { buildReportDigestMessage, countNewReports } from "../report-digest";

describe("buildReportDigestMessage", () => {
  it("facility_reports・content_reports とも0件なら null を返す(通知しない)", () => {
    expect(buildReportDigestMessage({ facilityReports: 0, contentReports: 0 })).toBeNull();
  });

  it("いずれか1件以上なら件数のみを含むメッセージを返す(自由記述・施設名は含まない)", () => {
    const message = buildReportDigestMessage({ facilityReports: 2, contentReports: 0 });
    expect(message).not.toBeNull();
    expect(message).toContain("施設情報: 2件");
    expect(message).toContain("想定ルート/学校情報/結果の見方ガイド: 0件");
  });

  it("両方1件以上でも件数のみを含む", () => {
    const message = buildReportDigestMessage({ facilityReports: 1, contentReports: 3 });
    expect(message).toContain("施設情報: 1件");
    expect(message).toContain("想定ルート/学校情報/結果の見方ガイド: 3件");
  });
});

describe("countNewReports", () => {
  function createFakeDb(rows: { facility: number | null; content: number | null }) {
    const preparedSql: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql);
        return {
          bind: vi.fn(),
          first: vi.fn(async () => {
            if (sql.includes("facility_reports")) return { count: rows.facility };
            if (sql.includes("content_reports")) return { count: rows.content };
            throw new Error(`unexpected sql: ${sql}`);
          }),
        };
      }),
    };
    return { db, preparedSql };
  }

  it("facility_reports・content_reports それぞれ status='new' の件数を取得する", async () => {
    const { db, preparedSql } = createFakeDb({ facility: 2, content: 5 });

    const result = await countNewReports(db as unknown as D1Database);

    expect(result).toEqual({ facilityReports: 2, contentReports: 5 });
    expect(preparedSql.some((sql) => sql.includes("facility_reports") && sql.includes("status = 'new'"))).toBe(true);
    expect(preparedSql.some((sql) => sql.includes("content_reports") && sql.includes("status = 'new'"))).toBe(true);
  });

  it("count が null の場合は0として扱う", async () => {
    const { db } = createFakeDb({ facility: null, content: null });

    const result = await countNewReports(db as unknown as D1Database);

    expect(result).toEqual({ facilityReports: 0, contentReports: 0 });
  });
});
