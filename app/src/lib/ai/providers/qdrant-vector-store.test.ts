import { describe, expect, it, vi } from "vitest";
import {
  QdrantVectorStore,
  buildQdrantFilter,
  buildQdrantSearchBody,
  buildQdrantUpsertBody,
  toQdrantPointId,
} from "@/lib/ai/providers/qdrant-vector-store";

const SOURCE_ID_PAYLOAD_KEY = "__vector_store_source_id";

describe("toQdrantPointId (TICKET-0021: Qdrant の point ID は符号なし整数/UUID のみ許可)", () => {
  it("符号なし整数の文字列はそのまま使う", () => {
    expect(toQdrantPointId("1")).toBe("1");
    expect(toQdrantPointId("42")).toBe("42");
  });

  it("UUID 文字列はそのまま使う", () => {
    const uuid = "3f29a1b2-4c3d-4e5f-8a1b-1234567890ab";
    expect(toQdrantPointId(uuid)).toBe(uuid);
  });

  it("取込元由来の任意文字列 ID(例: facility.id)は UUID 風文字列に決定的変換する", () => {
    const converted = toQdrantPointId("fac-1a2b3c4d");
    expect(converted).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("同じ入力からは常に同じ ID になる(冪等な再取込のため)", () => {
    expect(toQdrantPointId("fac-1a2b3c4d")).toBe(toQdrantPointId("fac-1a2b3c4d"));
  });

  it("異なる入力からは異なる ID になる", () => {
    expect(toQdrantPointId("fac-aaaaaaaa")).not.toBe(toQdrantPointId("fac-bbbbbbbb"));
  });
});

describe("buildQdrantUpsertBody", () => {
  it("VectorStoreItem の vector/metadata を Qdrant の vector/payload に変換する(数値文字列 ID はそのまま)", () => {
    const body = buildQdrantUpsertBody([
      { id: "1", vector: [0.1, 0.2], metadata: { category: "adhd" } },
    ]);
    expect(body).toEqual({
      points: [
        { id: "1", vector: [0.1, 0.2], payload: { category: "adhd", [SOURCE_ID_PAYLOAD_KEY]: "1" } },
      ],
    });
  });

  it("metadata 未指定の場合は予約キーのみの payload になる", () => {
    const body = buildQdrantUpsertBody([{ id: "1", vector: [0.1] }]);
    expect(body.points[0].payload).toEqual({ [SOURCE_ID_PAYLOAD_KEY]: "1" });
  });

  it("Qdrant 非互換の文字列 ID(例: facility.id)は変換し、元の ID を payload に保持する", () => {
    const body = buildQdrantUpsertBody([{ id: "fac-1a2b3c4d", vector: [0.1] }]);
    expect(body.points[0].id).toBe(toQdrantPointId("fac-1a2b3c4d"));
    expect(body.points[0].payload).toEqual({ [SOURCE_ID_PAYLOAD_KEY]: "fac-1a2b3c4d" });
  });
});

describe("buildQdrantFilter", () => {
  it("フラットな等価条件を Qdrant の must/match DSL に変換する", () => {
    expect(buildQdrantFilter({ category: "adhd", age: 10 })).toEqual({
      must: [
        { key: "category", match: { value: "adhd" } },
        { key: "age", match: { value: 10 } },
      ],
    });
  });

  it("filter 未指定の場合は undefined を返す", () => {
    expect(buildQdrantFilter(undefined)).toBeUndefined();
    expect(buildQdrantFilter({})).toBeUndefined();
  });
});

describe("buildQdrantSearchBody", () => {
  it("vector/limit/with_payload を含み、filter が無い場合は filter キーを含まない", () => {
    const body = buildQdrantSearchBody([0.1, 0.2], 5);
    expect(body).toEqual({ vector: [0.1, 0.2], limit: 5, with_payload: true });
  });

  it("filter がある場合は filter キーを含む", () => {
    const body = buildQdrantSearchBody([0.1], 3, { category: "adhd" });
    expect(body).toMatchObject({
      filter: { must: [{ key: "category", match: { value: "adhd" } }] },
    });
  });
});

describe("QdrantVectorStore", () => {
  const store = new QdrantVectorStore({ baseUrl: "http://localhost:16333", collection: "trait-compass" });

  it("upsert は PUT /collections/{collection}/points にリクエストする", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await store.upsert([{ id: "1", vector: [0.1, 0.2], metadata: { category: "adhd" } }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:16333/collections/trait-compass/points");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      points: [
        { id: "1", vector: [0.1, 0.2], payload: { category: "adhd", [SOURCE_ID_PAYLOAD_KEY]: "1" } },
      ],
    });

    vi.unstubAllGlobals();
  });

  it("upsert 失敗時は例外を投げる", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500, statusText: "Error" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(store.upsert([{ id: "1", vector: [0.1] }])).rejects.toThrow(/500/);

    vi.unstubAllGlobals();
  });

  it("query は POST /collections/{collection}/points/search にリクエストし、id/score/payload を変換して返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: [{ id: "1", score: 0.9, payload: { category: "adhd" } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await store.query([0.1, 0.2], 5, { category: "adhd" });

    expect(results).toEqual([{ id: "1", score: 0.9, metadata: { category: "adhd" } }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:16333/collections/trait-compass/points/search");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ vector: [0.1, 0.2], limit: 5 });

    vi.unstubAllGlobals();
  });

  it("payload に予約キーがある場合、Qdrant 変換後の point ID ではなく元の ID を復元して返す(TICKET-0021)", async () => {
    const convertedId = toQdrantPointId("fac-1a2b3c4d");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: [
            {
              id: convertedId,
              score: 0.9,
              payload: { facility_id: "fac-1a2b3c4d", municipality: "新宿区", [SOURCE_ID_PAYLOAD_KEY]: "fac-1a2b3c4d" },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await store.query([0.1], 5);

    expect(results).toEqual([
      { id: "fac-1a2b3c4d", score: 0.9, metadata: { facility_id: "fac-1a2b3c4d", municipality: "新宿区" } },
    ]);

    vi.unstubAllGlobals();
  });

  it("ensureCollection は既存コレクションがある場合は作成しない", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await store.ensureCollection(1024);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");

    vi.unstubAllGlobals();
  });

  it("ensureCollection はコレクションが無い場合に PUT で作成する", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await store.ensureCollection(1024);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("http://localhost:16333/collections/trait-compass");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ vectors: { size: 1024, distance: "Cosine" } });

    vi.unstubAllGlobals();
  });

  it("64 バイトを超える文字列メタデータがある場合、警告を出しつつ upsert は継続する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const longValue = "あ".repeat(30); // UTF-8 で 1 文字 3 バイト相当 = 90 バイト > 64
    await store.upsert([{ id: "1", vector: [0.1], metadata: { note: longValue } }]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
