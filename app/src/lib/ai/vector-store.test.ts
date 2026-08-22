import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vectorize } from "@cloudflare/workers-types";
import {
  createVectorStore,
  findOversizedMetadataKeys,
  warnIfMetadataOversized,
} from "@/lib/ai/vector-store";
import { QdrantVectorStore } from "@/lib/ai/providers/qdrant-vector-store";
import { VectorizeVectorStore } from "@/lib/ai/providers/vectorize-vector-store";

describe("createVectorStore", () => {
  it("qdrant を指定すると QdrantVectorStore を返す", () => {
    expect(createVectorStore("qdrant")).toBeInstanceOf(QdrantVectorStore);
  });

  it("vectorize を指定すると VectorizeVectorStore を返す", () => {
    expect(createVectorStore("vectorize")).toBeInstanceOf(VectorizeVectorStore);
  });

  describe("VECTOR_PROVIDER 環境変数からの解決", () => {
    const ORIGINAL = process.env.VECTOR_PROVIDER;

    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.VECTOR_PROVIDER;
      else process.env.VECTOR_PROVIDER = ORIGINAL;
    });

    it("未設定の場合は qdrant が既定になる", () => {
      delete process.env.VECTOR_PROVIDER;
      expect(createVectorStore()).toBeInstanceOf(QdrantVectorStore);
    });

    it("不正な値の場合は qdrant にフォールバックする", () => {
      process.env.VECTOR_PROVIDER = "not-a-real-provider";
      expect(createVectorStore()).toBeInstanceOf(QdrantVectorStore);
    });

    it("vectorize が設定されている場合はそれを使う", () => {
      process.env.VECTOR_PROVIDER = "vectorize";
      expect(createVectorStore()).toBeInstanceOf(VectorizeVectorStore);
    });
  });

  describe("vectorizeBinding を明示的に渡した場合(getCloudflareContext() を使えない別 Worker 向け)", () => {
    it("渡した binding をそのまま使って upsert する(getCloudflareContext() を呼ばない)", async () => {
      const upsertMock = vi.fn().mockResolvedValue({ mutationId: "m1" });
      const store = createVectorStore("vectorize", { upsert: upsertMock } as unknown as Vectorize);

      await store.upsert([{ id: "1", vector: [0.1] }]);

      expect(upsertMock).toHaveBeenCalledWith([{ id: "1", values: [0.1], metadata: undefined }]);
    });
  });
});

describe("findOversizedMetadataKeys (NFR-23: メタデータ文字列 64 バイト制約)", () => {
  it("64 バイト以下の文字列は対象外", () => {
    expect(findOversizedMetadataKeys({ name: "a".repeat(64) })).toEqual([]);
  });

  it("64 バイトを超える文字列のキーを検出する", () => {
    expect(findOversizedMetadataKeys({ name: "a".repeat(65), age: 10 })).toEqual(["name"]);
  });

  it("マルチバイト文字は UTF-8 バイト長で判定する", () => {
    // "あ" は UTF-8 で 3 バイト。22 文字 = 66 バイト > 64
    expect(findOversizedMetadataKeys({ note: "あ".repeat(22) })).toEqual(["note"]);
    // 21 文字 = 63 バイト <= 64
    expect(findOversizedMetadataKeys({ note: "あ".repeat(21) })).toEqual([]);
  });

  it("文字列以外の値(number/boolean)は対象外", () => {
    expect(findOversizedMetadataKeys({ age: 999999999, flag: true })).toEqual([]);
  });

  it("metadata が未指定の場合は空配列", () => {
    expect(findOversizedMetadataKeys(undefined)).toEqual([]);
  });
});

describe("warnIfMetadataOversized", () => {
  it("超過キーがある場合、console.warn で警告する", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfMetadataOversized({ id: "item-1", metadata: { note: "a".repeat(100) } });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("item-1");
    warnSpy.mockRestore();
  });

  it("超過キーが無い場合、console.warn を呼ばない", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfMetadataOversized({ id: "item-1", metadata: { note: "short" } });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
