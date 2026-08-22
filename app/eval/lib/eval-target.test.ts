import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readEvalTarget, resolveRetrievalDeps } from "./eval-target";

// 外部通信(fetch)を伴わない純粋なロジックのみを対象にする(REST アダプタ・Qdrant/Ollama
// 疎通確認は eval/README.md に記載のとおりネットワーク依存のため単体テスト化しない)。
describe("readEvalTarget", () => {
  const ORIGINAL_ENV = process.env.EVAL_TARGET;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.EVAL_TARGET;
    else process.env.EVAL_TARGET = ORIGINAL_ENV;
  });

  it("未設定時は auto", () => {
    delete process.env.EVAL_TARGET;
    expect(readEvalTarget()).toBe("auto");
  });

  it("production を認識する", () => {
    process.env.EVAL_TARGET = "production";
    expect(readEvalTarget()).toBe("production");
  });

  it("local を認識する", () => {
    process.env.EVAL_TARGET = "local";
    expect(readEvalTarget()).toBe("local");
  });

  it("不正な値は auto にフォールバックする", () => {
    process.env.EVAL_TARGET = "bogus";
    expect(readEvalTarget()).toBe("auto");
  });
});

describe("resolveRetrievalDeps (production)", () => {
  const ORIGINAL = {
    EVAL_TARGET: process.env.EVAL_TARGET,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
  };

  beforeEach(() => {
    process.env.EVAL_TARGET = "production";
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN が無ければ即座にエラーを投げる(静かなフォールバック禁止)", async () => {
    await expect(resolveRetrievalDeps()).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("CLOUDFLARE_ACCOUNT_ID のみ設定されていてもエラーを投げる", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
    await expect(resolveRetrievalDeps()).rejects.toThrow(/CLOUDFLARE_API_TOKEN/);
  });

  it("両方設定されていれば usedPath: vector-production の REST アダプタを返す", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
    process.env.CLOUDFLARE_API_TOKEN = "test-token";
    const deps = await resolveRetrievalDeps();
    expect(deps.usedPath).toBe("vector-production");
    expect(deps.embedder).toBeDefined();
    expect(deps.vectorStore).toBeDefined();
  });
});
