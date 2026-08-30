// batch/scripts/lib/embed-refresh.mjs のユニットテスト。
//
// ingest-open-data.mjs / ingest-manual-survey.mjs の --local 埋め込みリフレッシュ
// (D1 の facility ID 差分 → POST /embed → ログ/案内)を担う共通モジュール。
// spawnSync(wrangler呼び出し)・fetch(POST /embed呼び出し)はいずれもモック注入し、
// 実際の wrangler d1 execute・ネットワークアクセスは一切行わない。

import { describe, expect, it, vi } from "vitest";

import {
  buildEmbedRefreshFailureGuidance,
  buildFacilityIdsSelectSql,
  buildRemoteEmbedGuidance,
  captureFacilityIdsBeforeApply,
  computeStaleIds,
  DEFAULT_INGEST_DEV_URL,
  finishLocalEmbedRefresh,
  parseWranglerSelectIds,
  postEmbedRefresh,
  queryFacilityIds,
  resolveIngestDevUrl,
} from "../lib/embed-refresh.mjs";

describe("resolveIngestDevUrl", () => {
  it("INGEST_DEV_URL が未設定の場合は既定URL(wrangler devの既定ポート8787)を返す", () => {
    expect(resolveIngestDevUrl({})).toBe(DEFAULT_INGEST_DEV_URL);
    expect(DEFAULT_INGEST_DEV_URL).toBe("http://127.0.0.1:8787");
  });

  it("INGEST_DEV_URL が設定されている場合はその値を返す", () => {
    expect(resolveIngestDevUrl({ INGEST_DEV_URL: "http://localhost:9999" })).toBe("http://localhost:9999");
  });
});

describe("buildFacilityIdsSelectSql", () => {
  it("datasetIds が空配列の場合は null を返す(呼び出し元でクエリ自体をスキップする合図)", () => {
    expect(buildFacilityIdsSelectSql([])).toBeNull();
    expect(buildFacilityIdsSelectSql(undefined)).toBeNull();
  });

  it("単一 dataset ID の SELECT 文を組み立てる", () => {
    expect(buildFacilityIdsSelectSql(["ds-a"])).toBe("SELECT id FROM facilities WHERE dataset_id IN ('ds-a')");
  });

  it("複数 dataset ID をカンマ区切りで IN 句に含める", () => {
    expect(buildFacilityIdsSelectSql(["ds-a", "ds-b"])).toBe(
      "SELECT id FROM facilities WHERE dataset_id IN ('ds-a', 'ds-b')",
    );
  });

  it("シングルクォートを含む dataset ID はエスケープする(SQLインジェクション対策)", () => {
    expect(buildFacilityIdsSelectSql(["ds-o'brien"])).toBe(
      "SELECT id FROM facilities WHERE dataset_id IN ('ds-o''brien')",
    );
  });
});

describe("parseWranglerSelectIds", () => {
  it("wrangler --json 出力(単一結果)から id を抽出する", () => {
    const stdout = JSON.stringify([{ results: [{ id: "fac-a" }, { id: "fac-b" }], success: true }]);
    expect(parseWranglerSelectIds(stdout)).toEqual(["fac-a", "fac-b"]);
  });

  it("results が0件の場合は空配列を返す", () => {
    const stdout = JSON.stringify([{ results: [], success: true }]);
    expect(parseWranglerSelectIds(stdout)).toEqual([]);
  });

  it("複数エントリ(複数SQL文分)の結果をすべて集約する", () => {
    const stdout = JSON.stringify([
      { results: [{ id: "fac-a" }] },
      { results: [{ id: "fac-b" }] },
    ]);
    expect(parseWranglerSelectIds(stdout)).toEqual(["fac-a", "fac-b"]);
  });

  it("既にパース済みのオブジェクト(配列)を渡しても動作する", () => {
    expect(parseWranglerSelectIds([{ results: [{ id: "fac-a" }] }])).toEqual(["fac-a"]);
  });

  it("不正な JSON 文字列の場合は例外を投げる", () => {
    expect(() => parseWranglerSelectIds("{not json")).toThrow();
  });

  it("トップレベルが配列でない場合は例外を投げる", () => {
    expect(() => parseWranglerSelectIds(JSON.stringify({ results: [] }))).toThrow(/配列ではありません/);
  });

  it("id が文字列でない行は無視する", () => {
    const stdout = JSON.stringify([{ results: [{ id: 123 }, { id: "fac-a" }, {}] }]);
    expect(parseWranglerSelectIds(stdout)).toEqual(["fac-a"]);
  });
});

describe("computeStaleIds", () => {
  it("before にはあるが after にない id を返す(削除同期対象)", () => {
    expect(computeStaleIds(["fac-a", "fac-b"], ["fac-a"])).toEqual(["fac-b"]);
  });

  it("差分が無ければ空配列を返す", () => {
    expect(computeStaleIds(["fac-a"], ["fac-a"])).toEqual([]);
  });

  it("before が空配列の場合は常に空配列を返す", () => {
    expect(computeStaleIds([], ["fac-a"])).toEqual([]);
  });

  it("after が空配列の場合は before 全件を返す", () => {
    expect(computeStaleIds(["fac-a", "fac-b"], [])).toEqual(["fac-a", "fac-b"]);
  });
});

describe("queryFacilityIds", () => {
  it("datasetIds が空の場合は spawnSync を呼ばず空配列を返す", () => {
    const spawnSyncImpl = vi.fn();
    expect(queryFacilityIds({ datasetIds: [], spawnSyncImpl })).toEqual([]);
    expect(spawnSyncImpl).not.toHaveBeenCalled();
  });

  it("wrangler d1 execute --local --json --command で SELECT を実行し、パース結果を返す", () => {
    const spawnSyncImpl = vi.fn(() => ({
      status: 0,
      stdout: JSON.stringify([{ results: [{ id: "fac-a" }] }]),
    }));

    const ids = queryFacilityIds({
      datasetIds: ["ds-a"],
      wranglerPath: "/bin/wrangler",
      wranglerConfigPath: "/repo/batch/wrangler.ingest.toml",
      spawnSyncImpl,
    });

    expect(ids).toEqual(["fac-a"]);
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      "/bin/wrangler",
      ["d1", "execute", "trait-compass", "--local", "-c", "/repo/batch/wrangler.ingest.toml", "--json", "--command", "SELECT id FROM facilities WHERE dataset_id IN ('ds-a')"],
      expect.objectContaining({ encoding: "utf8" }),
    );
  });

  // 2026-08是正: batch/ には wrangler.toml/wrangler.jsonc が無く(wrangler.ingest.toml のみ)、
  // `-c` 無しでは "Couldn't find a D1 DB with the name or binding 'trait-compass'" で
  // 実機で失敗することを確認済み(report-review.mjs と同じ既知の制約)。既定値でも
  // `-c` フラグが自動的に付与されることを回帰確認する。
  it("wranglerConfigPath省略時はDEFAULT_WRANGLER_CONFIG_PATH(batch/wrangler.ingest.toml)を-cへ渡す", () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 0, stdout: JSON.stringify([{ results: [] }]) }));

    queryFacilityIds({ datasetIds: ["ds-a"], spawnSyncImpl });

    const args = spawnSyncImpl.mock.calls[0][1];
    const configFlagIndex = args.indexOf("-c");
    expect(configFlagIndex).toBeGreaterThan(0);
    expect(args[configFlagIndex + 1]).toMatch(/batch[/\\]wrangler\.ingest\.toml$/);
  });

  it("spawnSync が result.error を返した場合は例外を投げる", () => {
    const spawnSyncImpl = vi.fn(() => ({ status: null, error: new Error("ENOENT") }));
    expect(() => queryFacilityIds({ datasetIds: ["ds-a"], spawnSyncImpl })).toThrow("ENOENT");
  });

  it("非0終了の場合は例外を投げる", () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 1, stderr: "boom" }));
    expect(() => queryFacilityIds({ datasetIds: ["ds-a"], spawnSyncImpl })).toThrow(/status=1/);
  });
});

describe("captureFacilityIdsBeforeApply", () => {
  it("成功時は取得した id をそのまま返す", () => {
    const spawnSyncImpl = vi.fn(() => ({
      status: 0,
      stdout: JSON.stringify([{ results: [{ id: "fac-a" }] }]),
    }));
    const ids = captureFacilityIdsBeforeApply({ datasetIds: ["ds-a"], spawnSyncImpl });
    expect(ids).toEqual(["fac-a"]);
  });

  it("失敗時は例外を投げず、警告を出して空配列を返す(安全側フォールバック)", () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 1, stderr: "boom" }));
    const warn = vi.fn();

    const ids = captureFacilityIdsBeforeApply({ datasetIds: ["ds-a"], spawnSyncImpl, warn });

    expect(ids).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("事前");
  });
});

describe("postEmbedRefresh", () => {
  it("devUrl/embed へ deleteFacilityIds を含む POST を行い、JSON レスポンスを返す", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ facilityCount: 5, deletedVectors: 2 }) }));

    const result = await postEmbedRefresh({
      devUrl: "http://127.0.0.1:8787",
      deleteFacilityIds: ["fac-a"],
      fetchImpl,
    });

    expect(result).toEqual({ facilityCount: 5, deletedVectors: 2 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/embed",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleteFacilityIds: ["fac-a"] }),
      }),
    );
  });

  it("deleteFacilityIds 省略時は空配列としてボディに含める", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    await postEmbedRefresh({ devUrl: "http://127.0.0.1:8787", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ deleteFacilityIds: [] }) }),
    );
  });

  it("非OKレスポンスの場合は例外を投げる", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "boom",
    }));

    await expect(postEmbedRefresh({ devUrl: "http://127.0.0.1:8787", fetchImpl })).rejects.toThrow(/500/);
  });
});

describe("buildEmbedRefreshFailureGuidance", () => {
  it("devUrl と削除対象IDを含む curl コマンド例を出力する", () => {
    const message = buildEmbedRefreshFailureGuidance({
      devUrl: "http://127.0.0.1:8787",
      deleteFacilityIds: ["fac-a", "fac-b"],
    });

    expect(message).toContain("npm run ingest:dev");
    expect(message).toContain("curl -X POST http://127.0.0.1:8787/embed");
    expect(message).toContain(JSON.stringify({ deleteFacilityIds: ["fac-a", "fac-b"] }));
  });

  it("削除対象IDが無い場合も空配列を含む curl コマンドを出力する", () => {
    const message = buildEmbedRefreshFailureGuidance({ devUrl: "http://127.0.0.1:8787" });
    expect(message).toContain(JSON.stringify({ deleteFacilityIds: [] }));
  });
});

describe("buildRemoteEmbedGuidance", () => {
  it("本番Vectorizeが自動更新されないこと・次回CKAN取込での再upsert・POST /embedがOllama+Qdrant専用であることを案内する", () => {
    const message = buildRemoteEmbedGuidance();
    expect(message).toContain("Vectorize");
    expect(message).toContain("EMBEDDINGS_ENABLED");
    expect(message).toContain("Ollama + Qdrant");
  });

  it("deleteFacilityIds が指定された場合、具体的なIDを追記する", () => {
    const message = buildRemoteEmbedGuidance({ deleteFacilityIds: ["fac-a"] });
    expect(message).toContain("fac-a");
    expect(message).toContain("1 件");
  });

  it("deleteFacilityIds 未指定でも例外を投げない(--remoteはD1を追加クエリしないため常に不明)", () => {
    expect(() => buildRemoteEmbedGuidance()).not.toThrow();
  });

  // 2026-08是正(外部コードレビュー指摘 項目1): 削除された施設のベクトルは
  // pending_vector_deletions(outbox)経由でCKAN取込Workerの次回実行時に自動削除されるように
  // なったため、「手動削除が必要」という誤った案内を出さないことを回帰確認する。
  it("削除同期がpending_vector_deletions経由で自動化されており、手動削除が不要であることを案内する", () => {
    const message = buildRemoteEmbedGuidance();
    expect(message).toContain("pending_vector_deletions");
    expect(message).not.toContain("手動削除が必要");
  });
});

describe("finishLocalEmbedRefresh", () => {
  it("成功時: 事後IDを取得し差分をPOSTし、結果をログ出力する", async () => {
    const spawnSyncImpl = vi.fn(() => ({
      status: 0,
      stdout: JSON.stringify([{ results: [{ id: "fac-a" }] }]),
    }));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ facilityCount: 10, batchCount: 1, deletedVectors: 1 }),
    }));
    const log = vi.fn();
    const warn = vi.fn();

    const outcome = await finishLocalEmbedRefresh({
      datasetIds: ["ds-a"],
      beforeIds: ["fac-a", "fac-removed"],
      spawnSyncImpl,
      fetchImpl,
      devUrl: "http://127.0.0.1:8787",
      log,
      warn,
    });

    expect(outcome.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/embed",
      expect.objectContaining({ body: JSON.stringify({ deleteFacilityIds: ["fac-removed"] }) }),
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("facilityCount=10");
    expect(warn).not.toHaveBeenCalled();
  });

  it("事後ID取得に失敗した場合: 削除同期をスキップ(空配列でPOST)しつつ埋め込み更新自体は続行する", async () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 1, stderr: "boom" }));
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ facilityCount: 10 }) }));
    const warn = vi.fn();

    const outcome = await finishLocalEmbedRefresh({
      datasetIds: ["ds-a"],
      beforeIds: ["fac-a"],
      spawnSyncImpl,
      fetchImpl,
      devUrl: "http://127.0.0.1:8787",
      log: vi.fn(),
      warn,
    });

    expect(outcome.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ deleteFacilityIds: [] }) }),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("事後");
  });

  it("dev ワーカーへのPOSTが失敗した場合: 例外を投げず案内メッセージを警告出力する", async () => {
    const spawnSyncImpl = vi.fn(() => ({
      status: 0,
      stdout: JSON.stringify([{ results: [{ id: "fac-a" }] }]),
    }));
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed: connection refused");
    });
    const warn = vi.fn();

    const outcome = await finishLocalEmbedRefresh({
      datasetIds: ["ds-a"],
      beforeIds: ["fac-a"],
      spawnSyncImpl,
      fetchImpl,
      devUrl: "http://127.0.0.1:8787",
      log: vi.fn(),
      warn,
    });

    expect(outcome.ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("npm run ingest:dev");
  });

  it("devUrl省略時は resolveIngestDevUrl の既定値を使う", async () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 0, stdout: JSON.stringify([{ results: [] }]) }));
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

    await finishLocalEmbedRefresh({ datasetIds: [], beforeIds: [], spawnSyncImpl, fetchImpl, log: vi.fn(), warn: vi.fn() });

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_INGEST_DEV_URL}/embed`, expect.any(Object));
  });
});
