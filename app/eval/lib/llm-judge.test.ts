// eval/lib/llm-judge.ts のユニットテスト。
//
// `runJudge` は `createLlmClient("vertex-gateway")`(fetch ベース)を経由するため、
// vertex-gateway-llm-client.test.ts と同じ方針(`fetch` をモックする)でテストする
// (実際の Vertex AI への往復はしない)。

import { afterEach, describe, expect, it, vi } from "vitest";

import { assertRealLlmProvider, buildJudgeSchema, majorityVote, runJudge } from "./llm-judge";

const ORIGINAL_ENV = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  AI_GATEWAY_URL: process.env.AI_GATEWAY_URL,
  GOOGLE_VERTEX_PROJECT: process.env.GOOGLE_VERTEX_PROJECT,
  GOOGLE_VERTEX_LOCATION: process.env.GOOGLE_VERTEX_LOCATION,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key as keyof typeof ORIGINAL_ENV];
    else process.env[key as keyof typeof ORIGINAL_ENV] = value;
  }
}

function setRealProviderEnv() {
  process.env.LLM_PROVIDER = "vertex-gateway";
  process.env.AI_GATEWAY_URL = "https://gateway.ai.cloudflare.com/v1/my-account/my-gateway";
  process.env.GOOGLE_VERTEX_PROJECT = "my-project";
  process.env.GOOGLE_VERTEX_LOCATION = "asia-northeast1";
}

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
});

describe("assertRealLlmProvider", () => {
  it("LLM_PROVIDER が未設定(mock 既定)の場合は例外を投げる", () => {
    delete process.env.LLM_PROVIDER;
    expect(() => assertRealLlmProvider()).toThrow(/vertex-gateway/);
  });

  it("LLM_PROVIDER=mock の場合は例外を投げる", () => {
    process.env.LLM_PROVIDER = "mock";
    expect(() => assertRealLlmProvider()).toThrow(/vertex-gateway/);
  });

  it("LLM_PROVIDER=vertex-gateway の場合は例外を投げない", () => {
    process.env.LLM_PROVIDER = "vertex-gateway";
    expect(() => assertRealLlmProvider()).not.toThrow();
  });

  it("LLM_PROVIDER=vertex-direct の場合は例外を投げない", () => {
    process.env.LLM_PROVIDER = "vertex-direct";
    expect(() => assertRealLlmProvider()).not.toThrow();
  });
});

describe("buildJudgeSchema", () => {
  it("reasoning → verdict → score の順で geminiSchema の propertyOrdering を組み立てる(CoT 先出し規約)", () => {
    const schema = buildJudgeSchema(["relevant", "irrelevant"] as const);
    expect(schema.geminiSchema).toMatchObject({
      type: "object",
      required: ["reasoning", "verdict"],
      propertyOrdering: ["reasoning", "verdict", "score"],
    });
  });

  it("zodSchema が reasoning/verdict/score を検証する", () => {
    const schema = buildJudgeSchema(["relevant", "irrelevant"] as const);
    expect(schema.zodSchema.safeParse({ reasoning: "根拠", verdict: "relevant" }).success).toBe(true);
    expect(schema.zodSchema.safeParse({ reasoning: "根拠", verdict: "not-a-verdict" }).success).toBe(false);
    expect(schema.zodSchema.safeParse({ verdict: "relevant" }).success).toBe(false); // reasoning 必須
  });
});

describe("runJudge", () => {
  const schema = buildJudgeSchema(["relevant", "irrelevant"] as const);

  it("LLM_PROVIDER が real でない場合は fetch を呼ばずに例外を投げる", async () => {
    delete process.env.LLM_PROVIDER;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(runJudge("判定して", schema)).rejects.toThrow(/vertex-gateway/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Structured Output が1回目で valid な場合、そのまま値を返す", async () => {
    setRealProviderEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify({ reasoning: "根拠です", verdict: "relevant" }) }] } },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runJudge("判定して", schema);
    expect(result).toEqual({ indeterminate: false, value: { reasoning: "根拠です", verdict: "relevant" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("temperature: 0 と responseSchema を付けてリクエストする", async () => {
    setRealProviderEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify({ reasoning: "根拠です", verdict: "relevant" }) }] } },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runJudge("判定して", schema);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toMatchObject({
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: schema.geminiSchema,
    });
  });

  it("1回目が不正な JSON、2回目が valid な場合、再試行で成功する", async () => {
    setRealProviderEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "不正なJSON" }] } }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify({ reasoning: "根拠2", verdict: "irrelevant" }) }] } },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runJudge("判定して", schema);
    expect(result).toEqual({ indeterminate: false, value: { reasoning: "根拠2", verdict: "irrelevant" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("2回とも zod パースに失敗した場合、例外にせず indeterminate: true を返す", async () => {
    setRealProviderEnv();
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict: "not-a-verdict" }) }] } }],
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runJudge("判定して", schema);
    expect(result.indeterminate).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("majorityVote", () => {
  it("多数決で verdict を決める", () => {
    const result = majorityVote([
      { indeterminate: false, value: { reasoning: "r1", verdict: "diagnostic" } },
      { indeterminate: false, value: { reasoning: "r2", verdict: "diagnostic" } },
      { indeterminate: false, value: { reasoning: "r3", verdict: "non-diagnostic" } },
    ]);
    expect(result).toMatchObject({ indeterminate: false, verdict: "diagnostic" });
  });

  it("判定不能の回を母数から除外する", () => {
    const result = majorityVote([
      { indeterminate: true, rawText: "", reason: "x" },
      { indeterminate: false, value: { reasoning: "r2", verdict: "diagnostic" } },
      { indeterminate: false, value: { reasoning: "r3", verdict: "diagnostic" } },
    ]);
    expect(result).toMatchObject({ indeterminate: false, verdict: "diagnostic" });
  });

  it("全回が判定不能の場合は indeterminate: true を返す", () => {
    const result = majorityVote([
      { indeterminate: true, rawText: "", reason: "x" },
      { indeterminate: true, rawText: "", reason: "y" },
    ]);
    expect(result).toEqual({ indeterminate: true });
  });
});
