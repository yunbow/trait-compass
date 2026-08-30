import { describe, expect, it, vi } from "vitest";

const getCloudflareContextMock = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...args: unknown[]) => getCloudflareContextMock(...args),
}));

import type { Vectorize } from "@cloudflare/workers-types";
import {
  VectorizeVectorStore,
  toVectorizeVector,
} from "@/lib/ai/providers/vectorize-vector-store";

describe("toVectorizeVector", () => {
  it("VectorStoreItem の vector/metadata を Vectorize の values/metadata に変換する", () => {
    expect(toVectorizeVector({ id: "1", vector: [0.1, 0.2], metadata: { category: "adhd" } })).toEqual({
      id: "1",
      values: [0.1, 0.2],
      metadata: { category: "adhd" },
    });
  });
});

describe("VectorizeVectorStore", () => {
  it("明示的に渡された Vectorize バインディングで upsert する", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ mutationId: "m1" });
    const store = new VectorizeVectorStore({ upsert: upsertMock } as unknown as Vectorize);

    await store.upsert([{ id: "1", vector: [0.1, 0.2], metadata: { category: "adhd" } }]);

    expect(upsertMock).toHaveBeenCalledWith([{ id: "1", values: [0.1, 0.2], metadata: { category: "adhd" } }]);
    expect(getCloudflareContextMock).not.toHaveBeenCalled();
  });

  it("delete は明示的に渡された Vectorize バインディングの deleteByIds を ID 配列で呼ぶ", async () => {
    const deleteByIdsMock = vi.fn().mockResolvedValue({ mutationId: "m1" });
    const store = new VectorizeVectorStore({ deleteByIds: deleteByIdsMock } as unknown as Vectorize);

    await store.delete(["1", "2"]);

    expect(deleteByIdsMock).toHaveBeenCalledWith(["1", "2"]);
    expect(getCloudflareContextMock).not.toHaveBeenCalled();
  });

  it("delete は空配列が渡された場合、deleteByIds を呼ばずに正常終了する", async () => {
    const deleteByIdsMock = vi.fn();
    const store = new VectorizeVectorStore({ deleteByIds: deleteByIdsMock } as unknown as Vectorize);

    await expect(store.delete([])).resolves.toBeUndefined();

    expect(deleteByIdsMock).not.toHaveBeenCalled();
  });

  it("query は topK/filter を渡し、matches を id/score/metadata に変換して返す", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      count: 1,
      matches: [{ id: "1", score: 0.9, metadata: { category: "adhd" } }],
    });
    const store = new VectorizeVectorStore({ query: queryMock } as unknown as Vectorize);

    const results = await store.query([0.1, 0.2], 5, { category: "adhd" });

    expect(results).toEqual([{ id: "1", score: 0.9, metadata: { category: "adhd" } }]);
    expect(queryMock).toHaveBeenCalledWith([0.1, 0.2], {
      topK: 5,
      returnMetadata: true,
      filter: { category: "adhd" },
    });
  });

  it("filter 未指定時は filter キーを渡さない", async () => {
    const queryMock = vi.fn().mockResolvedValue({ count: 0, matches: [] });
    const store = new VectorizeVectorStore({ query: queryMock } as unknown as Vectorize);

    await store.query([0.1], 5);

    expect(queryMock).toHaveBeenCalledWith([0.1], { topK: 5, returnMetadata: true });
  });

  it("バインディング未指定時は getCloudflareContext() 経由で env.VECTORIZE を取得する", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ mutationId: "m1" });
    getCloudflareContextMock.mockReturnValue({
      env: { VECTORIZE: { upsert: upsertMock } },
      cf: undefined,
      ctx: {},
    });

    const store = new VectorizeVectorStore();
    await store.upsert([{ id: "1", vector: [0.1] }]);

    expect(upsertMock).toHaveBeenCalled();
    expect(getCloudflareContextMock).toHaveBeenCalled();
  });

  it("env.VECTORIZE が未設定の場合は例外を投げる", async () => {
    getCloudflareContextMock.mockReturnValue({ env: {}, cf: undefined, ctx: {} });

    const store = new VectorizeVectorStore();
    await expect(store.upsert([{ id: "1", vector: [0.1] }])).rejects.toThrow(
      /Vectorize binding 'VECTORIZE' is not configured/,
    );
  });

  it("64 バイトを超える文字列メタデータがある場合、警告を出しつつ upsert は継続する", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ mutationId: "m1" });
    const store = new VectorizeVectorStore({ upsert: upsertMock } as unknown as Vectorize);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const longValue = "あ".repeat(30);
    await store.upsert([{ id: "1", vector: [0.1], metadata: { note: longValue } }]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
