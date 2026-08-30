import { describe, expect, it, vi } from "vitest";

import {
  buildEmbeddingText,
  buildFacilityMetadata,
  chunk,
  embedAndUpsertFacilities,
  MAX_EMBEDDING_TEXT_LENGTH,
  type EmbeddableFacilityRow,
} from "../embed-pipeline";
import type { Embedder } from "../../../app/src/lib/ai/embedder";
import type { VectorStore, VectorStoreItem } from "../../../app/src/lib/ai/vector-store";

function makeRow(overrides: Partial<EmbeddableFacilityRow> = {}): EmbeddableFacilityRow {
  return {
    id: "fac-00000001",
    name: "しののめ相談支援センター",
    municipality: "新宿区",
    description: "発達障害に関する相談を受け付けています。",
    tags: "対人・コミュニケーション,こころ・感情",
    age_range: "both",
    lifestage_min: null,
    lifestage_max: null,
    ...overrides,
  };
}

describe("buildEmbeddingText", () => {
  it("name + municipality + description + タグをスペース区切りで結合する", () => {
    const text = buildEmbeddingText(makeRow());
    expect(text).toBe(
      "しののめ相談支援センター 新宿区 発達障害に関する相談を受け付けています。 対人・コミュニケーション こころ・感情",
    );
  });

  it("description が null の場合は空文字として扱い、余計な空白を残さない", () => {
    const text = buildEmbeddingText(makeRow({ description: null, tags: null }));
    expect(text).toBe("しののめ相談支援センター 新宿区");
  });

  it("tags が null または空文字の場合はタグを含めない", () => {
    expect(buildEmbeddingText(makeRow({ tags: null }))).not.toContain("undefined");
    expect(buildEmbeddingText(makeRow({ tags: "" }))).toBe(
      "しののめ相談支援センター 新宿区 発達障害に関する相談を受け付けています。",
    );
  });

  it("タグ文字列の前後空白はトリムする", () => {
    const text = buildEmbeddingText(makeRow({ tags: " 感覚 , 学習・からだ " }));
    expect(text).toContain("感覚 学習・からだ");
  });

  it(`MAX_EMBEDDING_TEXT_LENGTH(${MAX_EMBEDDING_TEXT_LENGTH})を超える長文は末尾を切り詰める`, () => {
    const longDescription = "あ".repeat(MAX_EMBEDDING_TEXT_LENGTH + 500);
    const text = buildEmbeddingText(makeRow({ description: longDescription, tags: null }));
    expect(text.length).toBe(MAX_EMBEDDING_TEXT_LENGTH);
  });

  it("上限未満の通常の長さの場合は切り詰めない", () => {
    const text = buildEmbeddingText(makeRow());
    expect(text.length).toBeLessThan(MAX_EMBEDDING_TEXT_LENGTH);
  });
});

describe("buildFacilityMetadata", () => {
  it("facility_id/municipality/age_range/lifestage_min/lifestage_max を含む(NFR-23: 施設名・説明等は含めない)", () => {
    const metadata = buildFacilityMetadata(makeRow());
    expect(metadata).toEqual({
      facility_id: "fac-00000001",
      municipality: "新宿区",
      age_range: "both",
      lifestage_min: 0,
      lifestage_max: 4,
    });
  });

  it("lifestage_min/max が非 NULL の場合はそのまま格納する(番兵値に変換しない)", () => {
    const metadata = buildFacilityMetadata(makeRow({ age_range: "adult", lifestage_min: 1, lifestage_max: 3 }));
    expect(metadata.lifestage_min).toBe(1);
    expect(metadata.lifestage_max).toBe(3);
  });

  it("lifestage_min/max が NULL の場合は全域をカバーする番兵値(0/4)に変換する(2026-08是正、外部コードレビュー指摘 項目5)", () => {
    const metadata = buildFacilityMetadata(makeRow({ lifestage_min: null, lifestage_max: null }));
    expect(metadata.lifestage_min).toBe(0);
    expect(metadata.lifestage_max).toBe(4);
  });

  it("64 バイト制約以内に収まる(通常の区市町村名・facility id 長を想定)", () => {
    const metadata = buildFacilityMetadata(makeRow());
    const encoder = new TextEncoder();
    for (const value of Object.values(metadata)) {
      expect(encoder.encode(String(value)).length).toBeLessThanOrEqual(64);
    }
  });

  it("東京都(広域)の municipality でも 64 バイト以内", () => {
    const metadata = buildFacilityMetadata(makeRow({ municipality: "東京都" }));
    const encoder = new TextEncoder();
    expect(encoder.encode(metadata.municipality as string).length).toBeLessThanOrEqual(64);
  });
});

describe("chunk", () => {
  it("指定サイズごとに配列を分割する", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("要素数がちょうど割り切れる場合も正しく分割する", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("サイズが配列長以上の場合は1バッチにまとまる", () => {
    expect(chunk([1, 2], 50)).toEqual([[1, 2]]);
  });

  it("空配列を渡すと空配列を返す", () => {
    expect(chunk([], 50)).toEqual([]);
  });

  it("サイズが 0 以下の場合は例外を投げる", () => {
    expect(() => chunk([1, 2], 0)).toThrow(/positive/);
    expect(() => chunk([1, 2], -1)).toThrow(/positive/);
  });
});

describe("embedAndUpsertFacilities", () => {
  function makeEmbedderMock(dim = 3): Embedder {
    return {
      dimensions: dim,
      embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
    };
  }

  function makeVectorStoreMock(): VectorStore & { upsertedBatches: VectorStoreItem[][] } {
    const upsertedBatches: VectorStoreItem[][] = [];
    return {
      upsertedBatches,
      upsert: vi.fn(async (items: VectorStoreItem[]) => {
        upsertedBatches.push(items);
      }),
      query: vi.fn(async () => []),
    };
  }

  it("50件単位(既定バッチサイズ)でバッチ処理する", async () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      makeRow({ id: `fac-${String(i).padStart(8, "0")}` }),
    );
    const embedder = makeEmbedderMock();
    const vectorStore = makeVectorStoreMock();

    const summary = await embedAndUpsertFacilities(rows, embedder, vectorStore);

    expect(summary).toEqual({ facilityCount: 120, batchCount: 3 });
    expect(vectorStore.upsertedBatches.map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(embedder.embed).toHaveBeenCalledTimes(3);
  });

  it("カスタムバッチサイズを指定できる", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow({ id: `fac-${i}` }));
    const embedder = makeEmbedderMock();
    const vectorStore = makeVectorStoreMock();

    const summary = await embedAndUpsertFacilities(rows, embedder, vectorStore, 2);

    expect(summary).toEqual({ facilityCount: 5, batchCount: 3 });
    expect(vectorStore.upsertedBatches.map((batch) => batch.length)).toEqual([2, 2, 1]);
  });

  it("id=facility id、vector=embed結果、metadata=facility_id/municipality/age_range/lifestage_min/max で upsert する", async () => {
    const rows = [makeRow()];
    const embedder = makeEmbedderMock();
    const vectorStore = makeVectorStoreMock();

    await embedAndUpsertFacilities(rows, embedder, vectorStore);

    expect(vectorStore.upsertedBatches[0]).toEqual([
      {
        id: "fac-00000001",
        vector: [0.1, 0.2, 0.3],
        metadata: {
          facility_id: "fac-00000001",
          municipality: "新宿区",
          age_range: "both",
          lifestage_min: 0,
          lifestage_max: 4,
        },
      },
    ]);
  });

  it("対象0件の場合は embed も upsert も呼ばれない", async () => {
    const embedder = makeEmbedderMock();
    const vectorStore = makeVectorStoreMock();

    const summary = await embedAndUpsertFacilities([], embedder, vectorStore);

    expect(summary).toEqual({ facilityCount: 0, batchCount: 0 });
    expect(embedder.embed).not.toHaveBeenCalled();
    expect(vectorStore.upsert).not.toHaveBeenCalled();
  });
});
