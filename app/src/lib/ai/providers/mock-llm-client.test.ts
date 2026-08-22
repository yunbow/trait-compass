import { describe, expect, it, vi } from "vitest";
import { MockLlmClient, MOCK_LLM_RESPONSE_TEXT } from "@/lib/ai/providers/mock-llm-client";

describe("MockLlmClient", () => {
  it("常に同じ固定応答を返す(決定的)", async () => {
    const client = new MockLlmClient();
    const first = await client.generate("こんにちは");
    const second = await client.generate("まったく違うプロンプト", { temperature: 0.9 });

    expect(first.text).toBe(MOCK_LLM_RESPONSE_TEXT);
    expect(second.text).toBe(MOCK_LLM_RESPONSE_TEXT);
    expect(first.text).toBe(second.text);
  });

  it("外部ネットワークアクセスを行わない(fetch を呼ばない)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = new MockLlmClient();
    await client.generate("プロンプト");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
