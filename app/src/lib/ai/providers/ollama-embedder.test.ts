import { describe, expect, it, vi } from "vitest";
import { OllamaEmbedder, buildOllamaEmbeddingsRequestBody } from "@/lib/ai/providers/ollama-embedder";
import { EMBEDDING_DIM } from "@/lib/ai/embedder";

describe("buildOllamaEmbeddingsRequestBody", () => {
  it("OpenAI 互換 /v1/embeddings のボディ形式(model/input)を組み立てる", () => {
    expect(buildOllamaEmbeddingsRequestBody(["a", "b"])).toEqual({
      model: "bge-m3",
      input: ["a", "b"],
    });
  });
});

describe("OllamaEmbedder", () => {
  it("既定の baseUrl(http://localhost:11434)に対し /v1/embeddings を POST する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const embedder = new OllamaEmbedder();
    const result = await embedder.embed(["こんにちは"]);

    expect(result).toEqual([[0.1, 0.2]]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/embeddings");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ model: "bge-m3", input: ["こんにちは"] });

    vi.unstubAllGlobals();
  });

  it("baseUrl を明示指定した場合はそちらを使う", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const embedder = new OllamaEmbedder({ baseUrl: "http://localhost:21434/" });
    await embedder.embed(["x"]);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:21434/v1/embeddings");

    vi.unstubAllGlobals();
  });

  it("dimensions は EMBEDDING_DIM 定数と一致する", () => {
    expect(new OllamaEmbedder().dimensions).toBe(EMBEDDING_DIM);
  });

  it("レスポンスが ok でない場合は例外を投げる", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500, statusText: "Error" }));
    vi.stubGlobal("fetch", fetchMock);

    const embedder = new OllamaEmbedder();
    await expect(embedder.embed(["x"])).rejects.toThrow(/500/);

    vi.unstubAllGlobals();
  });
});
