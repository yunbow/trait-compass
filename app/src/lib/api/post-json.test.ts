import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { postJson } from "@/lib/api/post-json";

const ResponseSchema = z.object({ value: z.string() });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("postJson", () => {
  it("成功時: fetch が期待どおりの引数で1回だけ呼ばれ、{ ok: true, data } を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ value: "hello" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const body = { freeText: "foo" };
    const result = await postJson("/api/summarize", body, ResponseSchema);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(result).toEqual({ ok: true, data: { value: "hello" } });
  });

  it("HTTPエラー時: { ok:false, reason:'http-error', status, errorBody } を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate_limited" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postJson("/api/summarize", {}, ResponseSchema);

    expect(result).toEqual({
      ok: false,
      reason: "http-error",
      status: 429,
      errorBody: { error: "rate_limited" },
    });
  });

  it("HTTPエラーかつ本文がJSONでない場合: errorBody が null、reason は 'http-error' のまま", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("invalid json");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postJson("/api/summarize", {}, ResponseSchema);

    expect(result).toEqual({
      ok: false,
      reason: "http-error",
      status: 500,
      errorBody: null,
    });
  });

  it("2xxだがスキーマ不一致: { ok:false, reason:'invalid-response' } を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postJson("/api/summarize", {}, ResponseSchema);

    expect(result).toEqual({ ok: false, reason: "invalid-response" });
  });

  it("fetch が reject する場合: throw せず { ok:false, reason:'request-failed' } を返す", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postJson("/api/summarize", {}, ResponseSchema);

    expect(result).toEqual({ ok: false, reason: "request-failed" });
  });

  it("2xxで本文が壊れている場合: throw せず { ok:false, reason:'request-failed' } を返す", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postJson("/api/summarize", {}, ResponseSchema);

    expect(result).toEqual({ ok: false, reason: "request-failed" });
  });

  it("部分モック互換: text を持たない { ok, status, json } オブジェクトを返す fetch でも reason:'http-error' になる", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate_limited" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postJson("/api/summarize", {}, ResponseSchema);

    expect(result).toEqual({
      ok: false,
      reason: "http-error",
      status: 429,
      errorBody: { error: "rate_limited" },
    });
  });
});
