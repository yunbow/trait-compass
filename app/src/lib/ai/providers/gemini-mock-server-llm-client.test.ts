import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GeminiMockServerLlmClient,
  buildGeminiMockGenerateContentUrl,
} from "@/lib/ai/providers/gemini-mock-server-llm-client";

describe("buildGeminiMockGenerateContentUrl", () => {
  it.each(["http://localhost:3001", "http://localhost:3001/"])(
    "baseUrl の末尾スラッシュを正規化する: %s",
    (baseUrl) => {
      expect(buildGeminiMockGenerateContentUrl({ baseUrl, model: "gemini-2.5-flash" })).toBe(
        "http://localhost:3001/v1beta/models/gemini-2.5-flash:generateContent",
      );
    },
  );
});

describe("GeminiMockServerLlmClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("URL・API キー・Content-Type ヘッダーで fetch し、レスポンステキストを取り出す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new GeminiMockServerLlmClient({
      baseUrl: "http://localhost:3001/",
      apiKey: "test-api-key",
      model: "gemini-2.5-flash",
    });
    const result = await client.generate("テスト");

    expect(result.text).toBe("OK");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/v1beta/models/gemini-2.5-flash:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": "test-api-key" },
      }),
    );
  });

  it("generationConfig に thinkingConfig と指定された生成オプションを含める", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new GeminiMockServerLlmClient({ baseUrl: "http://localhost:3001" });
    await client.generate("テスト", { temperature: 0.3, maxOutputTokens: 512 });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.generationConfig).toEqual({
      temperature: 0.3,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    });
  });

  it("設定が不足している場合は例外を投げ、fetch を呼ばない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new GeminiMockServerLlmClient({}).generate("テスト")).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("HTTP エラー時はステータスコードを含む例外を投げる", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new GeminiMockServerLlmClient({ baseUrl: "http://localhost:3001" }).generate("テスト")).rejects.toThrow(
      /400/,
    );
  });

  it("apiKey 未指定時は既定の API キーを使う", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new GeminiMockServerLlmClient({ baseUrl: "http://localhost:3001" }).generate("テスト");

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "x-goog-api-key": "mock-api-key-dev1234" });
  });
});
