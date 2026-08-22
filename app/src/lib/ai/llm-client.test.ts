import { afterEach, describe, expect, it } from "vitest";
import { createLlmClient } from "@/lib/ai/llm-client";
import { GeminiMockServerLlmClient } from "@/lib/ai/providers/gemini-mock-server-llm-client";
import { MockLlmClient } from "@/lib/ai/providers/mock-llm-client";
import { VertexLlmClient } from "@/lib/ai/providers/vertex-llm-client";
import { VertexGatewayLlmClient } from "@/lib/ai/providers/vertex-gateway-llm-client";

describe("createLlmClient", () => {
  it("mock を指定すると MockLlmClient を返す", () => {
    expect(createLlmClient("mock")).toBeInstanceOf(MockLlmClient);
  });

  it("vertex-direct を指定すると VertexLlmClient を返す", () => {
    expect(createLlmClient("vertex-direct")).toBeInstanceOf(VertexLlmClient);
  });

  it("vertex-gateway を指定すると VertexGatewayLlmClient を返す", () => {
    expect(createLlmClient("vertex-gateway")).toBeInstanceOf(VertexGatewayLlmClient);
  });

  it("gemini-mock-server を指定すると GeminiMockServerLlmClient を返す", () => {
    expect(createLlmClient("gemini-mock-server")).toBeInstanceOf(GeminiMockServerLlmClient);
  });

  describe("LLM_PROVIDER 環境変数からの解決", () => {
    const ORIGINAL = process.env.LLM_PROVIDER;

    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = ORIGINAL;
    });

    it("未設定の場合は mock が既定になる", () => {
      delete process.env.LLM_PROVIDER;
      expect(createLlmClient()).toBeInstanceOf(MockLlmClient);
    });

    it("不正な値の場合は mock にフォールバックする", () => {
      process.env.LLM_PROVIDER = "not-a-real-provider";
      expect(createLlmClient()).toBeInstanceOf(MockLlmClient);
    });

    it("vertex-direct が設定されている場合はそれを使う", () => {
      process.env.LLM_PROVIDER = "vertex-direct";
      expect(createLlmClient()).toBeInstanceOf(VertexLlmClient);
    });

    it("vertex-gateway が設定されている場合はそれを使う", () => {
      process.env.LLM_PROVIDER = "vertex-gateway";
      expect(createLlmClient()).toBeInstanceOf(VertexGatewayLlmClient);
    });

    it("gemini-mock-server が設定されている場合はそれを使う", () => {
      process.env.LLM_PROVIDER = "gemini-mock-server";
      expect(createLlmClient()).toBeInstanceOf(GeminiMockServerLlmClient);
    });
  });
});
