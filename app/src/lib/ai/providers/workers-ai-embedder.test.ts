import { describe, expect, it, vi } from "vitest";

const getCloudflareContextMock = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...args: unknown[]) => getCloudflareContextMock(...args),
}));

import type { Ai } from "@cloudflare/workers-types";
import { WorkersAiEmbedder } from "@/lib/ai/providers/workers-ai-embedder";
import { EMBEDDING_DIM } from "@/lib/ai/embedder";

describe("WorkersAiEmbedder", () => {
  it("明示的に渡された AI バインディングで @cf/baai/bge-m3 を呼ぶ", async () => {
    const runMock = vi.fn().mockResolvedValue({ shape: [1, 2], data: [[0.1, 0.2]] });
    const embedder = new WorkersAiEmbedder({ run: runMock } as unknown as Ai);

    const result = await embedder.embed(["こんにちは"]);

    expect(result).toEqual([[0.1, 0.2]]);
    expect(runMock).toHaveBeenCalledWith("@cf/baai/bge-m3", { text: ["こんにちは"] });
    expect(getCloudflareContextMock).not.toHaveBeenCalled();
  });

  it("バインディング未指定時は getCloudflareContext() 経由で env.AI を取得する", async () => {
    const runMock = vi.fn().mockResolvedValue({ data: [[0.3]] });
    getCloudflareContextMock.mockReturnValue({ env: { AI: { run: runMock } }, cf: undefined, ctx: {} });

    const embedder = new WorkersAiEmbedder();
    const result = await embedder.embed(["x"]);

    expect(result).toEqual([[0.3]]);
    expect(getCloudflareContextMock).toHaveBeenCalled();
  });

  it("env.AI が未設定の場合は例外を投げる", async () => {
    getCloudflareContextMock.mockReturnValue({ env: {}, cf: undefined, ctx: {} });

    const embedder = new WorkersAiEmbedder();
    await expect(embedder.embed(["x"])).rejects.toThrow(/AI binding 'AI' is not configured/);
  });

  it("dimensions は EMBEDDING_DIM 定数と一致する", () => {
    expect(new WorkersAiEmbedder().dimensions).toBe(EMBEDDING_DIM);
  });
});
