import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OUTPUT_GUARD_FALLBACK_TEXT } from "@/features/ai-summary/services/output-guard";

// route.ts は createLlmClient() を通じて LLM を呼び出す。summarize route のテストと同じ方針で、
// mock provider の実際の応答内容(成功/禁止語/例外)をテストごとに切り替えるため差し替える。
const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));
vi.mock("@/lib/ai/llm-client", () => ({
  createLlmClient: () => ({ generate: generateMock }),
}));

// route.ts を差し替え後にインポートする(vi.mock はホイストされるため通常の import で問題ない)。
import { POST } from "@/app/api/explain/route";

function buildRequest(body: unknown, init?: { rawBody?: string; origin?: string }): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.origin) headers.origin = init.origin;
  return new NextRequest("http://localhost/api/explain", {
    method: "POST",
    headers,
    body: init?.rawBody ?? JSON.stringify(body),
  });
}

afterEach(() => {
  generateMock.mockReset();
});

describe("POST /api/explain", () => {
  it("正常な入力かつ mock LLM 成功時は解説を200で返す", async () => {
    generateMock.mockResolvedValue({ text: "この傾向は多くの人に見られる一般的な特徴です。" });

    const res = await POST(buildRequest({ topCategories: ["communication"] }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ explanation: "この傾向は多くの人に見られる一般的な特徴です。" });
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("プロンプトに fact-checked 242件由来の根拠質問文が含まれる(FR-043 AC-3)", async () => {
    generateMock.mockResolvedValue({ text: "解説文です。" });

    await POST(buildRequest({ topCategories: ["communication"] }));

    const [prompt] = generateMock.mock.calls[0] as [string, unknown];
    expect(prompt).toContain("fact-checked");
    expect(prompt).toContain("根拠となる日常の困りごとチェック項目");
  });

  it("zod 検証: topCategories が空配列の場合は400を返し、LLMを呼び出さない", async () => {
    const res = await POST(buildRequest({ topCategories: [] }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("zod 検証: topCategories に未知のカテゴリ key(ホワイトリスト外)が含まれる場合は400を返す", async () => {
    const res = await POST(buildRequest({ topCategories: ["not-a-real-category"] }));

    expect(res.status).toBe(400);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("zod 検証: topCategories が4件以上(既定の最大3件超過)の場合は400を返す", async () => {
    const res = await POST(
      buildRequest({
        topCategories: ["communication", "sensory", "motor", "learning"],
      }),
    );

    expect(res.status).toBe(400);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("LLM応答が禁止語・断定表現を含む場合はサーバー側でリジェクトし定型文にフォールバックする(出力ガード)", async () => {
    generateMock.mockResolvedValue({ text: "あなたはASDです。" });

    const res = await POST(buildRequest({ topCategories: ["communication"] }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ explanation: OUTPUT_GUARD_FALLBACK_TEXT });
  });

  it("LLM応答が因果断定文型(「〜のため△△が原因です」)を含む場合は定型文にフォールバックする(TICKET-0060, SNS-D05)", async () => {
    generateMock.mockResolvedValue({ text: "不注意の傾向が高いためADHDが原因です。" });

    const res = await POST(buildRequest({ topCategories: ["communication"] }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ explanation: OUTPUT_GUARD_FALLBACK_TEXT });
  });

  it("LLM呼び出しが例外を投げた場合は502を返す", async () => {
    generateMock.mockRejectedValue(new Error("upstream failure: some secret detail"));

    const res = await POST(buildRequest({ topCategories: ["communication"] }));

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("UPSTREAM_ERROR");
    expect(JSON.stringify(json)).not.toContain("secret detail");
  });

  it("リクエストボディが10KBを超える場合は413を返す", async () => {
    const oversizedRawBody = JSON.stringify({ topCategories: ["communication"], extra: "あ".repeat(6000) });
    expect(new TextEncoder().encode(oversizedRawBody).length).toBeGreaterThan(10 * 1024);

    const res = await POST(buildRequest(undefined, { rawBody: oversizedRawBody }));

    expect(res.status).toBe(413);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("不正なJSONボディの場合は400を返す", async () => {
    const res = await POST(buildRequest(undefined, { rawBody: "{not-json" }));

    expect(res.status).toBe(400);
  });

  it("Originヘッダーが自オリジンと異なる場合は403を返す(CSRF対策)", async () => {
    const res = await POST(buildRequest({ topCategories: ["communication"] }, { origin: "https://evil.example.com" }));

    expect(res.status).toBe(403);
    expect(generateMock).not.toHaveBeenCalled();
  });
});
