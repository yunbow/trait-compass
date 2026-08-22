import { describe, expect, it, vi } from "vitest";

import { buildFeedbackDigestMessage, countPendingFeedbackComments } from "../feedback-digest";

describe("buildFeedbackDigestMessage", () => {
  it("未レビュー件数が0件なら null を返す(通知しない)", () => {
    expect(buildFeedbackDigestMessage(0)).toBeNull();
  });

  it("1件以上なら件数のみを含むメッセージを返す(コメント本文は含まない)", () => {
    const message = buildFeedbackDigestMessage(3);
    expect(message).not.toBeNull();
    expect(message).toContain("3件");
    expect(message).toContain("wrangler d1 execute");
  });
});

describe("countPendingFeedbackComments", () => {
  function createFakeDb(count: number | null) {
    const preparedSql: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql);
        return {
          bind: vi.fn(),
          first: vi.fn(async () => ({ count })),
        };
      }),
    };
    return { db, preparedSql };
  }

  it("publish_consent=1 AND published=0 AND dismissed=0 の件数を取得する", async () => {
    const { db, preparedSql } = createFakeDb(4);

    const result = await countPendingFeedbackComments(db as unknown as D1Database);

    expect(result).toBe(4);
    expect(
      preparedSql.some(
        (sql) =>
          sql.includes("feedback_comments") &&
          sql.includes("publish_consent = 1") &&
          sql.includes("published = 0") &&
          sql.includes("dismissed = 0"),
      ),
    ).toBe(true);
  });

  it("count が null の場合は0として扱う", async () => {
    const { db } = createFakeDb(null);

    const result = await countPendingFeedbackComments(db as unknown as D1Database);

    expect(result).toBe(0);
  });
});
