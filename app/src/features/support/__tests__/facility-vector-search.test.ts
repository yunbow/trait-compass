import { describe, expect, it, vi } from "vitest";

import { mergeScoredFacilityIds, queryFacilityIds, queryFacilityIdsAcrossFilters } from "@/features/support/services/facility-vector-search";
import type { Embedder } from "@/lib/ai/embedder";
import type { VectorStore, VectorStoreFilter, VectorStoreQueryResult } from "@/lib/ai/vector-store";

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

/** filter.municipality の値ごとに異なる結果を返す VectorStore(自治体別・広域クエリの分岐検証用)。 */
function makeVectorStoreByFilter(resultsByMunicipality: Record<string, VectorStoreQueryResult[]>): VectorStore {
  return {
    upsert: vi.fn(async () => {}),
    query: vi.fn(async (_vector: number[], _topK: number, filter?: VectorStoreFilter) => {
      const municipality = filter?.municipality as string | undefined;
      return municipality !== undefined ? (resultsByMunicipality[municipality] ?? []) : [];
    }),
  };
}

describe("queryFacilityIdsAcrossFilters", () => {
  it("2026-08是正(外部コードレビュー指摘): 選択自治体で0件でも、広域(東京都)フィルタの結果を拾う", async () => {
    const embedder = makeEmbedder([0.1, 0.2, 0.3]);
    const vectorStore = makeVectorStoreByFilter({
      台東区: [],
      東京都: [{ id: "fac-broad", score: 0.8 }],
    });

    const results = await queryFacilityIdsAcrossFilters(
      { text: "台東区 小中学生 感覚過敏", topK: 10, filters: [{ municipality: "台東区" }, { municipality: "東京都" }] },
      { embedder, vectorStore },
    );

    expect(results).toEqual([{ id: "fac-broad", score: 0.8 }]);
  });

  it("両フィルタの結果をスコア降順でマージする", async () => {
    const embedder = makeEmbedder([0.1, 0.2, 0.3]);
    const vectorStore = makeVectorStoreByFilter({
      台東区: [{ id: "fac-local", score: 0.7 }],
      東京都: [{ id: "fac-broad", score: 0.9 }],
    });

    const results = await queryFacilityIdsAcrossFilters(
      { text: "感覚過敏", topK: 10, filters: [{ municipality: "台東区" }, { municipality: "東京都" }] },
      { embedder, vectorStore },
    );

    expect(results).toEqual([
      { id: "fac-broad", score: 0.9 },
      { id: "fac-local", score: 0.7 },
    ]);
  });

  it("同一idが複数フィルタにヒットした場合は最良スコアを採用し重複させない", async () => {
    const embedder = makeEmbedder([0.1, 0.2, 0.3]);
    const vectorStore = makeVectorStoreByFilter({
      台東区: [{ id: "fac-both", score: 0.6 }],
      東京都: [{ id: "fac-both", score: 0.95 }],
    });

    const results = await queryFacilityIdsAcrossFilters(
      { text: "感覚過敏", topK: 10, filters: [{ municipality: "台東区" }, { municipality: "東京都" }] },
      { embedder, vectorStore },
    );

    expect(results).toEqual([{ id: "fac-both", score: 0.95 }]);
    expect(vectorStore.query).toHaveBeenCalledTimes(2);
  });

  it("embed はクエリテキストにつき1回のみ行う(フィルタ数だけ埋め込み課金が増えるのを避ける)", async () => {
    const embedder = makeEmbedder([0.1, 0.2, 0.3]);
    const vectorStore = makeVectorStoreByFilter({ 台東区: [], 東京都: [] });

    await queryFacilityIdsAcrossFilters(
      { text: "感覚過敏", topK: 10, filters: [{ municipality: "台東区" }, { municipality: "東京都" }] },
      { embedder, vectorStore },
    );

    expect(embedder.embed).toHaveBeenCalledTimes(1);
    expect(embedder.embed).toHaveBeenCalledWith(["感覚過敏"]);
  });

  it("embed がベクトルを返さない場合は空配列を返し、query を呼ばない", async () => {
    const embedder = makeEmbedder(null);
    const vectorStore = makeVectorStoreByFilter({ 台東区: [{ id: "fac-1", score: 1 }] });

    const results = await queryFacilityIdsAcrossFilters(
      { text: "", topK: 5, filters: [{ municipality: "台東区" }] },
      { embedder, vectorStore },
    );

    expect(results).toEqual([]);
    expect(vectorStore.query).not.toHaveBeenCalled();
  });
});

describe("mergeScoredFacilityIds", () => {
  it("複数配列をスコア降順でマージする", () => {
    const merged = mergeScoredFacilityIds(
      [{ id: "fac-a", score: 0.4 }],
      [{ id: "fac-b", score: 0.8 }],
    );

    expect(merged).toEqual([
      { id: "fac-b", score: 0.8 },
      { id: "fac-a", score: 0.4 },
    ]);
  });

  it("同一idが複数配列にある場合は最良スコアを採用する", () => {
    const merged = mergeScoredFacilityIds(
      [{ id: "fac-a", score: 0.4 }],
      [{ id: "fac-a", score: 0.9 }],
    );

    expect(merged).toEqual([{ id: "fac-a", score: 0.9 }]);
  });

  it("引数が無い場合は空配列を返す", () => {
    expect(mergeScoredFacilityIds()).toEqual([]);
  });
});
