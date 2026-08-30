// deleteStaleVectorsInChunks(純関数)のテスト(poison queue対策)。
//
// `pending_vector_deletions`(outbox)に1,001件以上溜まると、Vectorize の `deleteByIds` の
// 1回あたりのID数上限(1,000件)に抵触して毎回失敗し続け、outboxが永久に消化されない
// poison queue状態になっていた問題への対応。500件ずつのチャンクに分割して削除し、
// チャンクごとに成功した分だけ outbox から取り除くことで、途中のチャンクが失敗しても
// それ以前に成功した分は再送されないようにする(部分成功の許容)。
//
// workflow.ts は `cloudflare:workers`(WorkflowEntrypoint)に依存しており、これは Workers
// ランタイム専用の組み込みモジュールのため Node 環境の vitest では解決できない
// (embed-request.ts 冒頭コメント・ingest/health.ts 冒頭コメント参照)。`deleteStaleVectorsInChunks`
// 自体は VectorStore・D1 へのアクセスを引数として注入する形に切り出した純粋なヘルパーで
// workflow.ts 以外への切り出しが本来望ましいが、今回の変更対象ファイルを db.ts/workflow.ts/
// テストファイルのみに限定する方針のため、`cloudflare:workers` をこのテストファイル内で
// フェイクモジュールとしてモックし、workflow.ts を直接 import できるようにする
// (`WorkflowEntrypoint` は `IngestWorkflow extends WorkflowEntrypoint<...>` の実行時の値としてのみ
// 必要で、`WorkflowEvent`/`WorkflowStep`/`WorkflowStepConfig` は型のみのため実行時には不要)。

import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: class {},
}));

const { deleteStaleVectorsInChunks } = await import("../workflow");

describe("deleteStaleVectorsInChunks", () => {
  it("1,200件のIDを500件ずつのチャンク(500/500/200)に分割し、チャンクごとにdeleteChunk・clearChunkを呼ぶ", async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `fac-${i}`);
    const deleteChunk = vi.fn(async () => {});
    const clearChunk = vi.fn(async () => {});

    const deletedCount = await deleteStaleVectorsInChunks(ids, 500, deleteChunk, clearChunk);

    expect(deleteChunk).toHaveBeenCalledTimes(3);
    expect(clearChunk).toHaveBeenCalledTimes(3);
    expect(deleteChunk.mock.calls[0][0]).toHaveLength(500);
    expect(deleteChunk.mock.calls[1][0]).toHaveLength(500);
    expect(deleteChunk.mock.calls[2][0]).toHaveLength(200);
    // 各チャンクは deleteChunk → clearChunk の順で同じID配列を受け取る。
    expect(clearChunk.mock.calls[0][0]).toEqual(deleteChunk.mock.calls[0][0]);
    expect(clearChunk.mock.calls[1][0]).toEqual(deleteChunk.mock.calls[1][0]);
    expect(clearChunk.mock.calls[2][0]).toEqual(deleteChunk.mock.calls[2][0]);
    expect(deletedCount).toBe(1200);
  });

  it("2チャンク目のdeleteChunkが失敗した場合、1チャンク目分はclear済み・2チャンク目以降はclearが呼ばれない(例外はそのまま伝播する)", async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `fac-${i}`);
    const deleteChunk = vi
      .fn()
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {
        throw new Error("vectorize delete failed");
      });
    const clearChunk = vi.fn(async () => {});

    await expect(deleteStaleVectorsInChunks(ids, 500, deleteChunk, clearChunk)).rejects.toThrow(
      "vectorize delete failed",
    );

    // 1チャンク目(0〜499)はdelete成功→clear済み。
    expect(deleteChunk).toHaveBeenCalledTimes(2);
    expect(clearChunk).toHaveBeenCalledTimes(1);
    expect(clearChunk.mock.calls[0][0]).toHaveLength(500);
    expect(clearChunk.mock.calls[0][0][0]).toBe("fac-0");
    // 2チャンク目(500〜999)はdeleteが失敗したためclearは呼ばれておらず、outboxに残る想定。
    expect(deleteChunk.mock.calls[1][0][0]).toBe("fac-500");
    // 3チャンク目(1000〜1199)には到達しない。
    expect(deleteChunk).not.toHaveBeenCalledWith(expect.arrayContaining(["fac-1000"]));
  });

  it("空配列の場合はdeleteChunk・clearChunkのどちらも呼ばず、0を返す", async () => {
    const deleteChunk = vi.fn(async () => {});
    const clearChunk = vi.fn(async () => {});

    const deletedCount = await deleteStaleVectorsInChunks([], 500, deleteChunk, clearChunk);

    expect(deleteChunk).not.toHaveBeenCalled();
    expect(clearChunk).not.toHaveBeenCalled();
    expect(deletedCount).toBe(0);
  });

  it("ちょうどchunkSizeの倍数(1,000件、chunkSize=500)の場合、端数チャンクは発生せず2チャンクになる", async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `fac-${i}`);
    const deleteChunk = vi.fn(async () => {});
    const clearChunk = vi.fn(async () => {});

    const deletedCount = await deleteStaleVectorsInChunks(ids, 500, deleteChunk, clearChunk);

    expect(deleteChunk).toHaveBeenCalledTimes(2);
    expect(deletedCount).toBe(1000);
  });
});
