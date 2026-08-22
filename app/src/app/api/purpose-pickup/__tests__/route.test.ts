import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PURPOSE_OPTIONS_BY_LIFESTAGE } from "@/features/support/constants/purpose-options";

// route.ts は createLlmClient() を通じて LLM を呼び出す。recommend/summarize route のテストと
// 同じ方針で、実際のネットワークアクセスを避けるためにモジュールごと差し替える。
const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));
vi.mock("@/lib/ai/llm-client", () => ({
  createLlmClient: () => ({ generate: generateMock }),
}));

// TICKET-0035 AC-6。原価防衛レート制限は D1 に触れるため、統合テストでは判定結果だけを差し替える。
const { consumeAiRateLimitMock } = vi.hoisted(() => ({ consumeAiRateLimitMock: vi.fn() }));
vi.mock("@/lib/ai/rate-limit", () => ({
  consumeAiRateLimit: consumeAiRateLimitMock,
}));

// AI キルスイッチ(TICKET-0035 AC-3)の判定結果をテストごとに切り替えるため差し替える。
const { isAiFeatureEnabledMock } = vi.hoisted(() => ({ isAiFeatureEnabledMock: vi.fn() }));
vi.mock("@/lib/ai/ai-feature-flag", () => ({
  isAiFeatureEnabled: isAiFeatureEnabledMock,
}));

// 危機介入ガード(FR-044)の判定結果をテストごとに切り替えるため差し替える。
const { containsCrisisSignalMock } = vi.hoisted(() => ({ containsCrisisSignalMock: vi.fn() }));
vi.mock("@/features/ai-summary/services/crisis-detection", () => ({
  containsCrisisSignal: containsCrisisSignalMock,
}));

// 注入検知ガード(FR-046)の判定結果をテストごとに切り替えるため差し替える。
const { containsPromptInjectionSignalMock } = vi.hoisted(() => ({ containsPromptInjectionSignalMock: vi.fn() }));
vi.mock("@/lib/ai/injection-detection", () => ({
  containsPromptInjectionSignal: containsPromptInjectionSignalMock,
}));

// route.ts を差し替え後にインポートする(vi.mock はホイストされるため通常の import で問題ない)。
import { POST } from "@/app/api/purpose-pickup/route";

function buildRequest(body: unknown, init?: { rawBody?: string; origin?: string }): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.origin) headers.origin = init.origin;
  return new NextRequest("http://localhost/api/purpose-pickup", {
    method: "POST",
    headers,
    body: init?.rawBody ?? JSON.stringify(body),
  });
}

const VALID_BODY = { freeText: "会議の内容を覚えておくのが難しい", lifestage: "preschool" };
const PRESCHOOL_OPTIONS = PURPOSE_OPTIONS_BY_LIFESTAGE.preschool;

beforeEach(() => {
  containsCrisisSignalMock.mockReturnValue(false);
  containsPromptInjectionSignalMock.mockReturnValue(false);
  isAiFeatureEnabledMock.mockReturnValue(true);
  consumeAiRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/purpose-pickup", () => {
  it("危機介入シグナルを含む場合はLLMを呼び出さず、isCrisisResponse=true・matchedPurposeId=null・isAiEnabled=falseを返す(FR-044)", async () => {
    containsCrisisSignalMock.mockReturnValue(true);

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ matchedPurposeId: null, isAiEnabled: false, isCrisisResponse: true });
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("注入検知シグナルを含む場合はLLMを呼び出さず、matchedPurposeId=null・isAiEnabled=false・isCrisisResponse=falseを返す(FR-046)", async () => {
    containsPromptInjectionSignalMock.mockReturnValue(true);

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ matchedPurposeId: null, isAiEnabled: false, isCrisisResponse: false });
    expect(generateMock).not.toHaveBeenCalled();
    expect(consumeAiRateLimitMock).not.toHaveBeenCalled();
  });

  it("危機介入シグナルと注入シグナルが同居する場合は危機介入側が優先される(isCrisisResponse=true)", async () => {
    containsCrisisSignalMock.mockReturnValue(true);
    containsPromptInjectionSignalMock.mockReturnValue(true);

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ matchedPurposeId: null, isAiEnabled: false, isCrisisResponse: true });
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("AI機能が無効な場合はLLMを呼び出さず、matchedPurposeId=null・isAiEnabled=false・isCrisisResponse=falseを返す(TICKET-0035 AC-3)", async () => {
    isAiFeatureEnabledMock.mockReturnValue(false);

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ matchedPurposeId: null, isAiEnabled: false, isCrisisResponse: false });
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("レート制限超過時は429とRetry-Afterを返し、LLMを呼び出さない(TICKET-0035 AC-1)", async () => {
    consumeAiRateLimitMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
    const json = await res.json();
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("正常系: LLMが選択肢に実在するidを返した場合、そのidがmatchedPurposeIdに入りisAiEnabled=trueを返す", async () => {
    const matchedId = PRESCHOOL_OPTIONS[0].id;
    generateMock.mockResolvedValue({ text: matchedId });

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ matchedPurposeId: matchedId, isAiEnabled: true, isCrisisResponse: false });
  });

  it('LLMが"none"を返した場合、matchedPurposeId=null・isAiEnabled=trueを返す', async () => {
    generateMock.mockResolvedValue({ text: "none" });

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ matchedPurposeId: null, isAiEnabled: true, isCrisisResponse: false });
  });

  it("LLMが選択肢に無い無関係な文字列を返した場合、matchedPurposeId=null・isAiEnabled=trueを返す", async () => {
    generateMock.mockResolvedValue({ text: "これは選択肢に無い文字列です" });

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ matchedPurposeId: null, isAiEnabled: true, isCrisisResponse: false });
  });

  it("LLM応答が出力ガードに抵触する(禁止語を含む)場合、matchedPurposeId=nullを返す(NFR-51)", async () => {
    generateMock.mockResolvedValue({ text: "あなたはADHDです。" });

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matchedPurposeId).toBeNull();
    expect(json.isAiEnabled).toBe(true);
  });

  it("LLM呼び出しが例外を投げる場合、500にはならずmatchedPurposeId=null・isAiEnabled=falseで縮退する", async () => {
    generateMock.mockRejectedValue(new Error("upstream failure: some secret detail"));

    const res = await POST(buildRequest(VALID_BODY));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ matchedPurposeId: null, isAiEnabled: false, isCrisisResponse: false });
  });

  it("zod検証: freeTextが空文字の場合は400を返し、LLMを呼び出さない", async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, freeText: "" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("zod検証: lifestageが不正な値の場合は400を返し、LLMを呼び出さない", async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, lifestage: "not-a-real-lifestage" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("freeTextが最大文字数(500文字)を超える場合は400を返す", async () => {
    const res = await POST(buildRequest({ ...VALID_BODY, freeText: "あ".repeat(501) }));

    expect(res.status).toBe(400);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("不正なJSONボディの場合は400を返す", async () => {
    const res = await POST(buildRequest(undefined, { rawBody: "{not-json" }));

    expect(res.status).toBe(400);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("Originヘッダーが自オリジンと異なる場合は403を返す(CSRF対策)", async () => {
    const res = await POST(buildRequest(VALID_BODY, { origin: "https://evil.example.com" }));

    expect(res.status).toBe(403);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("NFR-36(ログ非保存)回帰防止: 例外時にconsole.error/console.logが自由記述本文を含む形で呼ばれない", async () => {
    const secretFreeText = "とても個人的な相談内容についての秘密のテキスト12345";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    generateMock.mockRejectedValue(new Error(`upstream failure containing ${secretFreeText}`));

    const res = await POST(buildRequest({ ...VALID_BODY, freeText: secretFreeText }));

    expect(res.status).toBe(200);
    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretFreeText);
    }
    for (const call of logSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretFreeText);
    }

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("NFR-36(ログ非保存)回帰防止: 正常系でもconsole.error/console.logが自由記述本文を含む形で呼ばれない", async () => {
    const secretFreeText = "とても個人的な相談内容についての秘密のテキスト67890";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    generateMock.mockResolvedValue({ text: PRESCHOOL_OPTIONS[0].id });

    const res = await POST(buildRequest({ ...VALID_BODY, freeText: secretFreeText }));

    expect(res.status).toBe(200);
    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretFreeText);
    }
    for (const call of logSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secretFreeText);
    }

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
