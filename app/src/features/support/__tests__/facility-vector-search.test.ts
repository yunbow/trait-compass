import { describe, expect, it, vi } from "vitest";

import { queryFacilityIds } from "@/features/support/services/facility-vector-search";
import type { Embedder } from "@/lib/ai/embedder";
import type { VectorStore, VectorStoreQueryResult } from "@/lib/ai/vector-store";

function makeEmbedder(vector: number[] | null = [0.1, 0.2, 0.3]): Embedder {
  return {
    dimensions: vector?.length ?? 0,
    embed: vi.fn(async (texts: string[]) => (vector ? texts.map(() => vector) : [])),
  };
}

function makeVectorStore(results: VectorStoreQueryResult[]): VectorStore {
  return {
    upsert: vi.fn(async () => {}),
    query: vi.fn(async () => results),
  };
}

describe("queryFacilityIds", () => {
  it("クエリテキストを埋め込み、VectorStore.query の結果から facility_id 配列を返す", async () => {
    const embedder = makeEmbedder([0.1, 0.2, 0.3]);
    const vectorStore = makeVectorStore([
      { id: "fac-1", score: 0.9, metadata: { facility_id: "fac-1", municipality: "新宿区" } },
      { id: "fac-2", score: 0.8, metadata: { facility_id: "fac-2", municipality: "渋谷区" } },
    ]);

    const ids = await queryFacilityIds({ text: "発達障害 相談 新宿区", topK: 2 }, { embedder, vectorStore });

    expect(ids).toEqual(["fac-1", "fac-2"]);
  });

  it("embedder.embed には [text] を渡す(1件分のテキストのみ埋め込む)", async () => {
    const embedder = makeEmbedder();
    const vectorStore = makeVectorStore([]);

    await queryFacilityIds({ text: "こだわり 支援", topK: 5 }, { embedder, vectorStore });

    expect(embedder.embed).toHaveBeenCalledWith(["こだわり 支援"]);
  });

  it("vectorStore.query には embed 結果のベクトル・topK・filter を渡す", async () => {
    const embedder = makeEmbedder([0.5, 0.6]);
    const vectorStore = makeVectorStore([]);

    await queryFacilityIds(
      { text: "感覚過敏", topK: 3, filter: { municipality: "台東区" } },
      { embedder, vectorStore },
    );

    expect(vectorStore.query).toHaveBeenCalledWith([0.5, 0.6], 3, { municipality: "台東区" });
  });

  it("filter 未指定の場合は undefined のまま渡す", async () => {
    const embedder = makeEmbedder([0.5, 0.6]);
    const vectorStore = makeVectorStore([]);

    await queryFacilityIds({ text: "感覚過敏", topK: 3 }, { embedder, vectorStore });

    expect(vectorStore.query).toHaveBeenCalledWith([0.5, 0.6], 3, undefined);
  });

  it("embed がベクトルを返さない場合は空配列を返し、query を呼ばない", async () => {
    const embedder = makeEmbedder(null);
    const vectorStore = makeVectorStore([{ id: "fac-1", score: 1 }]);

    const ids = await queryFacilityIds({ text: "", topK: 5 }, { embedder, vectorStore });

    expect(ids).toEqual([]);
    expect(vectorStore.query).not.toHaveBeenCalled();
  });

  it("検索結果が0件の場合は空配列を返す", async () => {
    const embedder = makeEmbedder([0.1]);
    const vectorStore = makeVectorStore([]);

    const ids = await queryFacilityIds({ text: "存在しない支援", topK: 5 }, { embedder, vectorStore });

    expect(ids).toEqual([]);
  });
});
