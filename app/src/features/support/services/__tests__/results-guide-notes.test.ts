import { describe, expect, it, vi } from "vitest";

import { fetchResultsGuideNote } from "@/features/support/services/results-guide-notes";

// support-pathway.test.ts の D1 モックパターンに倣う。
// fetchResultsGuideNote は results_guide_notes への1クエリのみを発行する。
interface FakeStatement {
  bind: (...args: unknown[]) => FakeStatement;
  first: () => Promise<unknown>;
}

function createFakeDb(response: { row?: unknown }) {
  const bindCalls: unknown[][] = [];

  const db = {
    prepare: vi.fn((_sql: string) => {
      const statement: FakeStatement = {
        bind: vi.fn((...args: unknown[]) => {
          bindCalls.push(args);
          return statement;
        }),
        first: vi.fn(async () => response.row ?? null),
      };
      return statement;
    }),
  };

  return { db, bindCalls };
}

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    body_json: JSON.stringify(["台東区では障害児通所支援の利用者負担の無償化が段階的に進められています。"]),
    sources_json: JSON.stringify([{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }]),
    ...overrides,
  };
}

describe("fetchResultsGuideNote", () => {
  it("該当行がある場合、body・sourcesをcamelCase構造で正しく返す", async () => {
    const { db } = createFakeDb({ row: makeRow() });

    const result = await fetchResultsGuideNote(db as unknown as Parameters<typeof fetchResultsGuideNote>[0], {
      municipality: "台東区",
      tab: "福祉ガイド",
    });

    expect(result).toEqual({
      body: ["台東区では障害児通所支援の利用者負担の無償化が段階的に進められています。"],
      sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
    });
  });

  it("該当行が無い場合、nullを返す", async () => {
    const { db } = createFakeDb({ row: null });

    const result = await fetchResultsGuideNote(db as unknown as Parameters<typeof fetchResultsGuideNote>[0], {
      municipality: "新宿区",
      tab: "福祉ガイド",
    });

    expect(result).toBeNull();
  });

  it("body_json が不正な JSON 文字列の場合、例外を投げずに空配列にフォールバックする", async () => {
    const { db } = createFakeDb({ row: makeRow({ body_json: "{not valid json" }) });

    const result = await fetchResultsGuideNote(db as unknown as Parameters<typeof fetchResultsGuideNote>[0], {
      municipality: "台東区",
      tab: "福祉ガイド",
    });

    expect(result?.body).toEqual([]);
    expect(result?.sources).toEqual([{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }]);
  });

  it("sources_json が不正な JSON 文字列の場合、例外を投げずに空配列にフォールバックする", async () => {
    const { db } = createFakeDb({ row: makeRow({ sources_json: "{not valid json" }) });

    const result = await fetchResultsGuideNote(db as unknown as Parameters<typeof fetchResultsGuideNote>[0], {
      municipality: "台東区",
      tab: "福祉ガイド",
    });

    expect(result?.sources).toEqual([]);
    expect(result?.body).toEqual(["台東区では障害児通所支援の利用者負担の無償化が段階的に進められています。"]);
  });

  it("bind() の呼び出し引数に municipality・tab が正しく渡っている", async () => {
    const { db, bindCalls } = createFakeDb({ row: makeRow() });

    await fetchResultsGuideNote(db as unknown as Parameters<typeof fetchResultsGuideNote>[0], {
      municipality: "台東区",
      tab: "相談窓口",
    });

    expect(bindCalls[0]).toEqual(["13106", "相談窓口"]);
  });
});
