import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FACILITY_PRESET_QUESTIONS, INSTITUTION_PRESET_QUESTIONS } from "@/features/ask-ai/services/preset-questions";

// route.ts は createLlmClient/getDb を通じて外部依存を呼び出す。prepare/recommend route の
// テストと同じ方針で、実際のネットワーク・D1 アクセスを避けるためにモジュールごと差し替える。
const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));
vi.mock("@/lib/ai/llm-client", () => ({
  createLlmClient: () => ({ generate: generateMock }),
}));

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

// route.ts を差し替え後にインポートする(vi.mock はホイストされるため通常の import で問題ない)。
import { POST } from "@/app/api/ask/route";

function buildRequest(body: unknown, init?: { rawBody?: string; origin?: string }): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.origin) headers.origin = init.origin;
  return new NextRequest("http://localhost/api/ask", {
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

function makeKnowledgeRow(overrides: Record<string, unknown> = {}) {
  return {
    name: "テスト制度",
    description: "テスト制度の説明文です。",
    dataset_title: "ダミーデータセット",
    source_org: "東京都福祉局",
    license: "cc-by-4.0",
    source_url: "https://example.com/dataset",
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/ask", () => {
  it("zod 検証: targetType='facility' で facilityId が無い場合は400を返し、外部依存を一切呼び出さない", async () => {
    const res = await POST(buildRequest({ targetType: "facility", questionId: FACILITY_PRESET_QUESTIONS[0].id }));

    expect(res.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("zod 検証: questionId が定型質問マスタ外(自由文字列)の場合は400を返す(AC-2)", async () => {
    const res = await POST(
      buildRequest({ targetType: "institution", questionId: "自由記述の質問文をここに入れてみる" }),
    );
    expect(res.status).toBe(400);
  });

  it("Origin ヘッダーが自オリジンと異なる場合は403を返す(CSRF対策)", async () => {
    const res = await POST(
      buildRequest(
        { targetType: "institution", questionId: INSTITUTION_PRESET_QUESTIONS[0].id },
        { origin: "https://evil.example.com" },
      ),
    );
    expect(res.status).toBe(403);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("D1(getDb)が利用できない場合は502を返す", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("D1 binding not configured");
    });

    const res = await POST(
      buildRequest({ targetType: "institution", questionId: INSTITUTION_PRESET_QUESTIONS[0].id }),
    );

    expect(res.status).toBe(502);
  });

  describe("targetType='facility'", () => {
    it("窓口が見つからない場合は404を返す", async () => {
      getDbMock.mockReturnValue(createQueueDb([[]]));

      const res = await POST(
        buildRequest({ targetType: "facility", questionId: "facility-age-range", facilityId: "not-exist" }),
      );

      expect(res.status).toBe(404);
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("D1の事実情報のみから回答を組み立て、出典を必ず含む(AC-3)。LLMは一切呼び出さない", async () => {
      getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow()]]));

      const res = await POST(
        buildRequest({ targetType: "facility", questionId: "facility-age-range", facilityId: "fac-001" }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.answer).toContain("世田谷区 発達障がい相談支援センター");
      expect(json.sources).toHaveLength(1);
      expect(json.sources[0].credit).toContain("ダミーデータセット");
      expect(json.isFallback).toBe(false);
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("リスク区分が medium の窓口では電話番号を回答に含めない(FR-027 との整合)", async () => {
      getDbMock.mockReturnValue(createQueueDb([[makeFacilityJoinRow({ risk_level: "medium" })]]));

      const res = await POST(
        buildRequest({ targetType: "facility", questionId: "facility-contact", facilityId: "fac-001" }),
      );

      const json = await res.json();
      expect(json.answer).not.toContain("03-1234-5678");
    });
  });

  describe("targetType='institution'", () => {
    it("低リスクデータが1件も無い場合はLLMを呼び出さずグレースフルフォールバックする(AC-4)", async () => {
      getDbMock.mockReturnValue(createQueueDb([[]]));

      const res = await POST(
        buildRequest({ targetType: "institution", questionId: INSTITUTION_PRESET_QUESTIONS[0].id }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isFallback).toBe(true);
      expect(json.sources).toEqual([]);
      expect(generateMock).not.toHaveBeenCalled();
    });

    it("低リスクデータを根拠にLLM生成した回答と出典を返す(AC-3)", async () => {
      getDbMock.mockReturnValue(createQueueDb([[makeKnowledgeRow()]]));
      generateMock.mockResolvedValue({ text: "この制度は窓口での申し込みが必要です。" });

      const res = await POST(
        buildRequest({ targetType: "institution", questionId: INSTITUTION_PRESET_QUESTIONS[0].id }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.answer).toBe("この制度は窓口での申し込みが必要です。");
      expect(json.sources).toHaveLength(1);
      expect(json.sources[0].credit).toContain("ダミーデータセット");
      expect(json.isFallback).toBe(false);
    });

    it("LLM応答が禁止語・断定表現を含む場合は出力ガードでフォールバックする", async () => {
      getDbMock.mockReturnValue(createQueueDb([[makeKnowledgeRow()]]));
      generateMock.mockResolvedValue({ text: "あなたはADHDです。" });

      const res = await POST(
        buildRequest({ targetType: "institution", questionId: INSTITUTION_PRESET_QUESTIONS[0].id }),
      );

      const json = await res.json();
      expect(json.answer).not.toBe("あなたはADHDです。");
      expect(json.answer).toContain("安全に配慮し");
    });

    it("LLM応答が因果断定文型(「〜のため△△が原因です」)を含む場合は出力ガードでフォールバックする(TICKET-0060, SNS-D05)", async () => {
      getDbMock.mockReturnValue(createQueueDb([[makeKnowledgeRow()]]));
      generateMock.mockResolvedValue({ text: "不注意の傾向が高いためADHDが原因です。" });

      const res = await POST(
        buildRequest({ targetType: "institution", questionId: INSTITUTION_PRESET_QUESTIONS[0].id }),
      );

      const json = await res.json();
      expect(json.answer).not.toBe("不注意の傾向が高いためADHDが原因です。");
      expect(json.answer).toContain("安全に配慮し");
    });

    it("LLM呼び出しが例外を投げた場合は502を返す", async () => {
      getDbMock.mockReturnValue(createQueueDb([[makeKnowledgeRow()]]));
      generateMock.mockRejectedValue(new Error("upstream failure: some secret detail"));

      const res = await POST(
        buildRequest({ targetType: "institution", questionId: INSTITUTION_PRESET_QUESTIONS[0].id }),
      );

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(JSON.stringify(json)).not.toContain("secret detail");
    });
  });

  it("不正なJSONボディの場合は400を返す", async () => {
    const res = await POST(buildRequest(undefined, { rawBody: "{not-json" }));
    expect(res.status).toBe(400);
  });
});
