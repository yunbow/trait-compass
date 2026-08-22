import { afterEach, describe, expect, it } from "vitest";
import { createEmbedder, EMBEDDING_DIM } from "@/lib/ai/embedder";
import { OllamaEmbedder } from "@/lib/ai/providers/ollama-embedder";
import { WorkersAiEmbedder } from "@/lib/ai/providers/workers-ai-embedder";

describe("createEmbedder", () => {
  it("ollama を指定すると OllamaEmbedder を返す", () => {
    expect(createEmbedder("ollama")).toBeInstanceOf(OllamaEmbedder);
  });

  it("workers-ai を指定すると WorkersAiEmbedder を返す", () => {
    expect(createEmbedder("workers-ai")).toBeInstanceOf(WorkersAiEmbedder);
  });

  it("EMBEDDING_DIM は両実装の dimensions と一致する(混在検知のための共通定数)", () => {
    expect(createEmbedder("ollama").dimensions).toBe(EMBEDDING_DIM);
    expect(createEmbedder("workers-ai").dimensions).toBe(EMBEDDING_DIM);
  });

  describe("EMBEDDER_PROVIDER 環境変数からの解決", () => {
    const ORIGINAL = process.env.EMBEDDER_PROVIDER;

    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.EMBEDDER_PROVIDER;
      else process.env.EMBEDDER_PROVIDER = ORIGINAL;
    });

    it("未設定の場合は ollama が既定になる", () => {
      delete process.env.EMBEDDER_PROVIDER;
      expect(createEmbedder()).toBeInstanceOf(OllamaEmbedder);
    });

    it("不正な値の場合は ollama にフォールバックする", () => {
      process.env.EMBEDDER_PROVIDER = "not-a-real-provider";
      expect(createEmbedder()).toBeInstanceOf(OllamaEmbedder);
    });

    it("workers-ai が設定されている場合はそれを使う", () => {
      process.env.EMBEDDER_PROVIDER = "workers-ai";
      expect(createEmbedder()).toBeInstanceOf(WorkersAiEmbedder);
    });
  });
});
