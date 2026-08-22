import { describe, expect, it, vi } from "vitest";
import {
  VertexLlmClient,
  buildVertexGenerateContentUrl,
  buildVertexRequestBody,
  extractTextFromVertexResponse,
} from "@/lib/ai/providers/vertex-llm-client";

describe("buildVertexGenerateContentUrl", () => {
  it("project/location/model から Vertex AI 直叩き URL を組み立てる", () => {
    const url = buildVertexGenerateContentUrl({
      project: "my-project",
      location: "asia-northeast1",
      model: "gemini-2.5-flash",
    });
    expect(url).toBe(
      "https://asia-northeast1-aiplatform.googleapis.com/v1/projects/my-project/locations/asia-northeast1/publishers/google/models/gemini-2.5-flash:generateContent",
    );
  });
});

describe("buildVertexRequestBody", () => {
  it("プロンプトのみの場合、contents のみを組み立てる", () => {
    const body = buildVertexRequestBody("こんにちは");
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "こんにちは" }] }]);
    expect(body).not.toHaveProperty("systemInstruction");
  });

  it("systemInstruction を指定した場合、そのフィールドが含まれる", () => {
    const body = buildVertexRequestBody("こんにちは", { systemInstruction: "非診断的に回答して" });
    expect(body.systemInstruction).toEqual({ parts: [{ text: "非診断的に回答して" }] });
  });

  it("maxOutputTokens/temperature を generationConfig に反映する", () => {
    const body = buildVertexRequestBody("こんにちは", { maxOutputTokens: 256, temperature: 0.2 });
    expect(body.generationConfig).toEqual({ maxOutputTokens: 256, temperature: 0.2 });
  });
});

describe("extractTextFromVertexResponse", () => {
  it("最初の候補のテキストを結合して返す", () => {
    const text = extractTextFromVertexResponse({
      candidates: [{ content: { parts: [{ text: "こんに" }, { text: "ちは" }] } }],
    });
    expect(text).toBe("こんにちは");
  });

  it("thinking の思考パートを除外して本文だけを返す", () => {
    const text = extractTextFromVertexResponse({
      candidates: [{ content: { parts: [{ text: "思考メモ", thought: true }, { text: "本文" }] } }],
    });
    expect(text).toBe("本文");
  });

  it("candidates が無い場合は空文字を返す", () => {
    expect(extractTextFromVertexResponse({})).toBe("");
  });
});

describe("VertexLlmClient", () => {
  const config = {
    project: "my-project",
    location: "asia-northeast1",
    accessToken: "test-token",
    model: "gemini-2.5-flash",
  };

  it("正しい URL・ヘッダー・ボディで fetch する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new VertexLlmClient(config);
    const result = await client.generate("テスト", { systemInstruction: "sys" });

    expect(result.text).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://asia-northeast1-aiplatform.googleapis.com/v1/projects/my-project/locations/asia-northeast1/publishers/google/models/gemini-2.5-flash:generateContent",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "テスト" }] }],
      systemInstruction: { parts: [{ text: "sys" }] },
    });

    vi.unstubAllGlobals();
  });

  it("設定が不足している場合は例外を投げ、fetch を呼ばない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new VertexLlmClient({});
    await expect(client.generate("テスト")).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("レスポンスが ok でない場合は例外を投げる", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500, statusText: "Error" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new VertexLlmClient(config);
    await expect(client.generate("テスト")).rejects.toThrow(/500/);

    vi.unstubAllGlobals();
  });
});
