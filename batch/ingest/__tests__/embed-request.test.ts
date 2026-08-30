// POST /embed のリクエストボディ検証(readDeleteFacilityIdsFromBody)のテスト
// (2026-08、Vectorize 削除同期対応)。
//
// index.ts は `cloudflare:workers`(WorkflowEntrypoint)に依存する workflow.ts を import するため
// vitest から直接 import できない(Workers ランタイム専用モジュール)。検証ロジック自体は
// D1/Workflow に非依存の純関数のため、embed-request.ts に切り出してテストする
// (index.ts の handleManualEmbed 自体は QdrantVectorStore(実 fetch 経由)・
// runEmbedPipeline(D1 実アクセス)に依存するため、db.ts 冒頭コメントの方針と同じく
// vitest では境界の入力検証部分のみをテストする。実際の埋め込み投入は `wrangler dev` の
// ローカル Qdrant/Ollama で確認する)。

import { describe, expect, it } from "vitest";

import { EmbedRequestValidationError, readDeleteFacilityIdsFromBody } from "../embed-request";

function makeRequest(body: string | undefined, headers: Record<string, string> = {}): Request {
  if (body === undefined) {
    return new Request("http://localhost/embed", { method: "POST", headers: { "content-length": "0", ...headers } });
  }
  return new Request("http://localhost/embed", { method: "POST", body, headers });
}

describe("readDeleteFacilityIdsFromBody", () => {
  it("ボディなし(content-length: 0)の場合は空配列を返す", async () => {
    const ids = await readDeleteFacilityIdsFromBody(makeRequest(undefined));
    expect(ids).toEqual([]);
  });

  it("空文字ボディの場合は空配列を返す", async () => {
    const ids = await readDeleteFacilityIdsFromBody(makeRequest(""));
    expect(ids).toEqual([]);
  });

  it("deleteFacilityIds を含まない JSON オブジェクトの場合は空配列を返す", async () => {
    const ids = await readDeleteFacilityIdsFromBody(makeRequest(JSON.stringify({ foo: "bar" })));
    expect(ids).toEqual([]);
  });

  it("deleteFacilityIds(文字列配列)をそのまま返す", async () => {
    const ids = await readDeleteFacilityIdsFromBody(
      makeRequest(JSON.stringify({ deleteFacilityIds: ["fac-a", "fac-b"] })),
    );
    expect(ids).toEqual(["fac-a", "fac-b"]);
  });

  it("deleteFacilityIds が空配列の場合はそのまま空配列を返す(削除なし)", async () => {
    const ids = await readDeleteFacilityIdsFromBody(makeRequest(JSON.stringify({ deleteFacilityIds: [] })));
    expect(ids).toEqual([]);
  });

  it("不正な JSON の場合は EmbedRequestValidationError を投げる(400 相当)", async () => {
    await expect(readDeleteFacilityIdsFromBody(makeRequest("{not json"))).rejects.toBeInstanceOf(
      EmbedRequestValidationError,
    );
  });

  it("ボディが JSON オブジェクトでない(配列)場合は EmbedRequestValidationError を投げる", async () => {
    await expect(readDeleteFacilityIdsFromBody(makeRequest(JSON.stringify(["fac-a"])))).rejects.toBeInstanceOf(
      EmbedRequestValidationError,
    );
  });

  it("ボディが JSON オブジェクトでない(文字列)場合は EmbedRequestValidationError を投げる", async () => {
    await expect(readDeleteFacilityIdsFromBody(makeRequest(JSON.stringify("fac-a")))).rejects.toBeInstanceOf(
      EmbedRequestValidationError,
    );
  });

  it("deleteFacilityIds が文字列配列でない(数値混在)場合は EmbedRequestValidationError を投げる", async () => {
    await expect(
      readDeleteFacilityIdsFromBody(makeRequest(JSON.stringify({ deleteFacilityIds: ["fac-a", 123] }))),
    ).rejects.toBeInstanceOf(EmbedRequestValidationError);
  });

  it("deleteFacilityIds が文字列(配列でない)場合は EmbedRequestValidationError を投げる", async () => {
    await expect(
      readDeleteFacilityIdsFromBody(makeRequest(JSON.stringify({ deleteFacilityIds: "fac-a" }))),
    ).rejects.toBeInstanceOf(EmbedRequestValidationError);
  });
});
