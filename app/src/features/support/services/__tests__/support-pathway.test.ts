import { describe, expect, it, vi } from "vitest";

import { fetchSupportPathway } from "@/features/support/services/support-pathway";

// school-info.test.ts / facility-search.test.ts の D1 モックパターンに倣う。
// fetchSupportPathway は「pathway 本体 → steps 一覧」の2クエリを直列に発行するため、
// prepare() が呼ばれた順(0: support_pathways, 1: support_pathway_steps)に応じて
// 結果を切り替えるフェイク D1Database を用意する。
interface FakeStatement {
  bind: (...args: unknown[]) => FakeStatement;
  all: () => Promise<{ results: unknown[] }>;
  first: () => Promise<unknown>;
}

function createFakeDb(responses: { pathway?: unknown; steps?: unknown[] }) {
  const prepareCalls: string[] = [];
  const bindCalls: unknown[][] = [];
  let call = 0;

  const db = {
    prepare: vi.fn((sql: string) => {
      prepareCalls.push(sql);
      const currentCall = call;
      call += 1;
      const statement: FakeStatement = {
        bind: vi.fn((...args: unknown[]) => {
          bindCalls.push(args);
          return statement;
        }),
        first: vi.fn(async () => (currentCall === 0 ? (responses.pathway ?? null) : null)),
        all: vi.fn(async () => ({ results: currentCall === 1 ? (responses.steps ?? []) : [] })),
      };
      return statement;
    }),
  };

  return { db, prepareCalls, bindCalls };
}

function makePathwayRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pathway-001",
    municipality: "台東区",
    lifestage: "preschool" as const,
    purpose_id: "child-development-support",
    purpose_label: "児童発達支援・療育を利用したい",
    status: "confirmed" as const,
    sources_json: JSON.stringify([{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }]),
    ...overrides,
  };
}

function makeStepRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    step_order: 1,
    title: "窓口に電話で相談する",
    actor: "台東区子ども家庭支援センター",
    contact: "03-1234-5678",
    is_conditional: 0,
    note: null,
    ...overrides,
  };
}

describe("fetchSupportPathway", () => {
  it("pathway・steps が両方ヒットした場合、camelCase の SupportPathwayData に変換して返す", async () => {
    const { db } = createFakeDb({
      pathway: makePathwayRow(),
      steps: [
        makeStepRow({ step_order: 1, title: "窓口に電話で相談する" }),
        makeStepRow({
          step_order: 2,
          title: "面談を予約する",
          actor: "発達支援センター",
          contact: null,
          is_conditional: 1,
          note: "混雑時は数週間待つ場合があります",
        }),
      ],
    });

    const result = await fetchSupportPathway(db as unknown as Parameters<typeof fetchSupportPathway>[0], {
      municipality: "台東区",
      lifestage: "preschool",
      purposeId: "child-development-support",
    });

    expect(result).toEqual({
      id: "pathway-001",
      municipality: "台東区",
      lifestage: "preschool",
      purposeId: "child-development-support",
      purposeLabel: "児童発達支援・療育を利用したい",
      status: "confirmed",
      steps: [
        { order: 1, title: "窓口に電話で相談する", actor: "台東区子ども家庭支援センター", contact: "03-1234-5678", isConditional: false, note: null },
        { order: 2, title: "面談を予約する", actor: "発達支援センター", contact: null, isConditional: true, note: "混雑時は数週間待つ場合があります" },
      ],
      sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
    });
  });

  it("is_conditional が整数の 1/0 の場合、それぞれ true/false の boolean に変換する", async () => {
    const { db } = createFakeDb({
      pathway: makePathwayRow(),
      steps: [makeStepRow({ step_order: 1, is_conditional: 1 }), makeStepRow({ step_order: 2, is_conditional: 0 })],
    });

    const result = await fetchSupportPathway(db as unknown as Parameters<typeof fetchSupportPathway>[0], {
      municipality: "台東区",
      lifestage: "preschool",
      purposeId: "child-development-support",
    });

    expect(result?.steps[0].isConditional).toBe(true);
    expect(result?.steps[1].isConditional).toBe(false);
  });

  it("support_pathways にヒットする行が無い場合、null を返す", async () => {
    const { db } = createFakeDb({ pathway: null });

    const result = await fetchSupportPathway(db as unknown as Parameters<typeof fetchSupportPathway>[0], {
      municipality: "檜原村",
      lifestage: "preschool",
      purposeId: "child-development-support",
    });

    expect(result).toBeNull();
  });

  it("葛飾区で台東区由来の目的 consult-development を選び一致行が無い場合、例外を投げずに null を返す", async () => {
    const { db } = createFakeDb({ pathway: null });

    const result = await fetchSupportPathway(db as unknown as Parameters<typeof fetchSupportPathway>[0], {
      municipality: "葛飾区",
      lifestage: "preschool",
      purposeId: "consult-development",
    });

    expect(result).toBeNull();
  });

  it("support_pathways にヒットする行が無い場合、support_pathway_steps へのクエリは実行しない", async () => {
    const { db } = createFakeDb({ pathway: null });

    await fetchSupportPathway(db as unknown as Parameters<typeof fetchSupportPathway>[0], {
      municipality: "檜原村",
      lifestage: "preschool",
      purposeId: "child-development-support",
    });

    // prepare は pathway 用の1回のみ呼ばれる(steps クエリは発行しない)。
    expect((db.prepare as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("sources_json が不正な JSON 文字列の場合、例外を投げずに空配列にフォールバックする", async () => {
    const { db } = createFakeDb({
      pathway: makePathwayRow({ sources_json: "{not valid json" }),
      steps: [makeStepRow()],
    });

    const result = await fetchSupportPathway(db as unknown as Parameters<typeof fetchSupportPathway>[0], {
      municipality: "台東区",
      lifestage: "preschool",
      purposeId: "child-development-support",
    });

    expect(result?.sources).toEqual([]);
  });

  it("bind() の呼び出し引数に municipality・lifestage・purposeId が正しく渡っている(1本目: pathway 検索)", async () => {
    const { db, bindCalls } = createFakeDb({ pathway: makePathwayRow(), steps: [] });

    await fetchSupportPathway(db as unknown as Parameters<typeof fetchSupportPathway>[0], {
      municipality: "台東区",
      lifestage: "elementary-junior-high",
      purposeId: "child-development-support",
    });

    expect(bindCalls[0]).toEqual(["13106", "elementary-junior-high", "child-development-support"]);
  });

  it("bind() の呼び出し引数に pathway.id が正しく渡っている(2本目: steps 検索)", async () => {
    const { db, bindCalls } = createFakeDb({
      pathway: makePathwayRow({ id: "pathway-xyz" }),
      steps: [],
    });

    await fetchSupportPathway(db as unknown as Parameters<typeof fetchSupportPathway>[0], {
      municipality: "台東区",
      lifestage: "elementary-junior-high",
      purposeId: "child-development-support",
    });

    expect(bindCalls[1]).toEqual(["pathway-xyz"]);
  });
});
