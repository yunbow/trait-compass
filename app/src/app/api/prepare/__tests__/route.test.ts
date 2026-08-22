import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// route.ts は getDb を通じて外部依存を呼び出す。recommend/explain route のテストと同じ方針で、
// 実際の D1 アクセスを避けるためにモジュールごと差し替える。summary はテンプレート生成のため
// 外部依存(LLM)を一切持たない。
const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

// route.ts を差し替え後にインポートする(vi.mock はホイストされるため通常の import で問題ない)。
import { POST } from "@/app/api/prepare/route";

function buildRequest(body: unknown, init?: { rawBody?: string; origin?: string }): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.origin) headers.origin = init.origin;
  return new NextRequest("http://localhost/api/prepare", {
    method: "POST",
    headers,
    body: init?.rawBody ?? JSON.stringify(body),
  });
}

interface FakeStatement {
  bind: (...args: unknown[]) => FakeStatement;
  all: () => Promise<{ results: unknown[] }>;
}

/** `responses[n]` が n 回目(0始まり)の `prepare().bind().all()` の結果になるフェイク D1。 */
function createQueueDb(responses: unknown[][]) {
  let index = 0;
  const db = {
    prepare: vi.fn(() => {
      const statement: FakeStatement = {
        bind: vi.fn(() => statement),
        all: vi.fn(async () => {
          const results = responses[index] ?? [];
          index += 1;
          return { results };
        }),
      };
      return statement;
    }),
  };
  return db;
}

/** `createQueueDb` と同様だが、SQL文字列・bind()引数も記録する(lifestage絞り込みのSQL確認用)。 */
function createQueueDbWithCalls(responses: unknown[][]) {
  const prepareCalls: string[] = [];
  const bindCalls: unknown[][] = [];
  let index = 0;
  const db = {
    prepare: vi.fn((sql: string) => {
      prepareCalls.push(sql);
      const statement: FakeStatement = {
        bind: vi.fn((...args: unknown[]) => {
          bindCalls.push(args);
          return statement;
        }),
        all: vi.fn(async () => {
          const results = responses[index] ?? [];
          index += 1;
          return { results };
        }),
      };
      return statement;
    }),
  };
  return { db, prepareCalls, bindCalls };
}

function makeFacilityJoinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "fac-001",
    dataset_id: "ds-a",
    name: "世田谷区 発達障がい相談支援センター",
    category_type: "相談窓口",
    municipality: "世田谷区",
    address: "東京都世田谷区XX",
    phone: "03-1234-5678",
    url: "https://example.com",
    age_range: "both",
    description: "発達に関する相談窓口です。",
    dataset_title: "ダミーデータセット",
    source_org: "東京都福祉局",
    license: "cc-by-4.0",
    risk_level: "low",
    source_url: "https://example.com/dataset",
    lat: null,
    lng: null,
    fetched_at: "2026-01-01T00:00:00.000Z",
    frozen: 0,
    ...overrides,
  };
}

const VALID_BODY = { topCategories: ["executive-function"], tags: ["不注意・段取り"], age: "adult", municipality: "世田谷区" };

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/prepare", () => {
  it("zod 検証: municipality が62リスト外の場合は400を返し、外部依存を一切呼び出さない", async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, municipality: "存在しない市" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("zod 検証: tags に SUPPORT_TAGS 外の値が含まれる場合は400を返す", async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, tags: ["存在しないタグ"] }));
    expect(res.status).toBe(400);
  });

  it("zod 検証: age が child/adult 以外の場合は400を返す", async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, age: "senior" }));
    expect(res.status).toBe(400);
  });

  it("Origin ヘッダーが自オリジンと異なる場合は403を返す(CSRF対策)", async () => {
    const res = await POST(buildRequest(VALID_BODY, { origin: "https://evil.example.com" }));
    expect(res.status).toBe(403);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("不正なJSONボディの場合は400を返す", async () => {
    const res = await POST(buildRequest(undefined, { rawBody: "{not-json" }));
    expect(res.status).toBe(400);
  });

  it("D1(getDb)が利用できない場合は502を返す", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding not configured");
    });

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("UPSTREAM_ERROR");
  });

  it("正常系: D1由来の窓口候補+テンプレート生成の要約・チェックリスト等を返す(AC-1、外部の生成AIを使わない)", async () => {
    getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow()], []]));

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toBe("本人として相談したいです。\n「不注意・段取り」に関する困りごとがあります。");
    expect(json.checklist.length).toBeGreaterThan(0);
    expect(json.flow.length).toBeGreaterThan(0);
    expect(json.questions.length).toBeGreaterThan(0);
    expect(json.facilities).toHaveLength(1);
    expect(json.facilities[0].name).toBe("世田谷区 発達障がい相談支援センター");
    expect(json.facilities[0].phone).toBe("03-1234-5678");
  });

  it("relationship 未指定時は既定値 self として本人視点の要約になる(TICKET-0047、回帰なし)", async () => {
    getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow()], []]));

    const res = await POST(buildRequest(VALID_BODY));

    const json = await res.json();
    expect(json.summary).toContain("本人として相談したいです。");
  });

  it("relationship=guardian を指定すると保護者視点(子ども)の要約になる(TICKET-0047 AC-3)", async () => {
    getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow()], []]));

    const res = await POST(buildRequest({ ...VALID_BODY, relationship: "guardian" }));

    const json = await res.json();
    expect(json.summary).toContain("子どもについて相談したいです。");
  });

  it("zod 検証: relationship に self/guardian 以外の値を渡すと400を返す", async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, relationship: "other" }));
    expect(res.status).toBe(400);
  });

  it("zod 検証: lifestage は省略可能(未指定でも200を返す、既存/古いクライアントとの後方互換性)", async () => {
    getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow()], []]));

    const res = await POST(buildRequest(VALID_BODY));
    expect(res.status).toBe(200);
  });

  it("zod 検証: lifestage に LIFESTAGE_VALUES 外の値を渡すと400を返す", async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, lifestage: "senior" }));
    expect(res.status).toBe(400);
  });

  it("lifestage を指定すると、searchFacilities 用の絞り込みSQL(BETWEEN句)と要約の年齢表現の両方に反映される", async () => {
    const { db, prepareCalls, bindCalls } = createQueueDbWithCalls([[makeFacilityJoinRow()], []]);
    getDbMock.mockReturnValue(db);

    const res = await POST(buildRequest({ ...VALID_BODY, lifestage: "high-school" }));

    expect(prepareCalls[0]).toContain("BETWEEN f.lifestage_min AND f.lifestage_max");
    expect(bindCalls[0]).toContain(2); // LIFESTAGE_ORDINAL["high-school"]
    const json = await res.json();
    expect(json.summary).toContain("高校生の本人として相談したいです。");
  });

  it("lifestage を省略した場合、searchFacilities 用のSQLにBETWEEN句を含まず、要約にも年齢を含めない(後方互換性)", async () => {
    const { db, prepareCalls } = createQueueDbWithCalls([[makeFacilityJoinRow()], []]);
    getDbMock.mockReturnValue(db);

    const res = await POST(buildRequest(VALID_BODY));

    expect(prepareCalls[0]).not.toContain("lifestage_min");
    const json = await res.json();
    expect(json.summary).toBe("本人として相談したいです。\n「不注意・段取り」に関する困りごとがあります。");
  });

  it("回帰テスト: 窓口候補の phone は常に D1 の値のまま変わらない(fact-guard 方針)", async () => {
    getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow({ phone: "03-1234-5678" })], []]));

    const res = await POST(buildRequest(VALID_BODY));

    const json = await res.json();
    expect(json.facilities[0].phone).toBe("03-1234-5678");
  });

  it("窓口候補が0件でも200を返す(相談メモ自体は生成する)", async () => {
    getDbMock.mockReturnValue(createQueueDb([[], []]));

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.facilities).toHaveLength(0);
  });

  it("tags が空配列でも動作する(「全般」扱い)", async () => {
    getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow()], []]));

    const res = await POST(buildRequest({ ...VALID_BODY, tags: [] }));

    expect(res.status).toBe(200);
  });

  // Phase 3: 相談メモ追加項目(選択式7フィールド、prepare/constants/prepare-options.ts 参照)。
  const EXTRA_FIELDS_BODY = {
    situations: ["家庭で", "学校・園で"],
    duration: "recent",
    lifeStatus: "working",
    consultPurpose: "find-consultation-desk",
    contactMethod: "phone",
    accommodations: ["電話が苦手"],
    priorSupport: ["相談窓口に相談したことがある"],
  };

  it("新7フィールドのうち要約に反映されるもの(困っている場面・相談したい内容・希望する連絡方法・配慮事項)が要約テキストに含まれる", async () => {
    getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow()], []]));

    const res = await POST(buildRequest({ ...VALID_BODY, ...EXTRA_FIELDS_BODY }));

    const json = await res.json();
    expect(json.summary).toContain("家庭で、学校・園で、");
    expect(json.summary).toContain("相談窓口を知りたいです。");
    expect(json.summary).toContain("可能であれば電話で相談を希望します。");
    expect(json.summary).toContain("また、電話が苦手について配慮をお願いしたいです。");
  });

  it("新7フィールドを省略した場合は既存のリクエストと同様に正常応答を返す(後方互換性)", async () => {
    getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow()], []]));

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toBe("本人として相談したいです。\n「不注意・段取り」に関する困りごとがあります。");
  });

  it("NFR-36(ログ非保存)回帰確認: 新7フィールドの値を含むリクエストでも正常系でconsole.error/console.logにその値が含まれない", async () => {
    getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow()], []]));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await POST(buildRequest({ ...VALID_BODY, ...EXTRA_FIELDS_BODY }));

    expect(res.status).toBe(200);
    const secretValues = ["家庭で", "学校・園で", "電話が苦手", "相談窓口に相談したことがある"];
    for (const call of [...errorSpy.mock.calls, ...logSpy.mock.calls]) {
      for (const secret of secretValues) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
    }

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("NFR-36(ログ非保存)回帰確認: D1呼び出し失敗時も新7フィールドの値がconsole.error/console.logに含まれない", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding not configured");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await POST(buildRequest({ ...VALID_BODY, ...EXTRA_FIELDS_BODY }));

    expect(res.status).toBe(502);
    const secretValues = ["家庭で", "学校・園で", "電話が苦手", "相談窓口に相談したことがある"];
    for (const call of [...errorSpy.mock.calls, ...logSpy.mock.calls]) {
      for (const secret of secretValues) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
    }

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
