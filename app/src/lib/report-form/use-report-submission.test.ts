import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { useReportSubmission } from "@/lib/report-form/use-report-submission";

const ResponseSchema = z.object({ ok: z.literal(true) });

function renderSubmission() {
  return renderHook(() => useReportSubmission({ endpoint: "/api/facility-report", responseSchema: ResponseSchema }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useReportSubmission", () => {
  it("初期状態は step === 'form' / isRateLimited === false", () => {
    const { result } = renderSubmission();
    expect(result.current.step).toBe("form");
    expect(result.current.isRateLimited).toBe(false);
  });

  it("goToPreview / goToForm で step が遷移する", () => {
    const { result } = renderSubmission();

    act(() => result.current.goToPreview());
    expect(result.current.step).toBe("preview");

    act(() => result.current.goToForm());
    expect(result.current.step).toBe("form");
  });

  it("送信成功(2xx+スキーマ一致)で step === 'done' になる", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const { result } = renderSubmission();
    await act(async () => {
      await result.current.submit({ foo: "bar" });
    });

    expect(result.current.step).toBe("done");
    expect(result.current.isRateLimited).toBe(false);
  });

  it("429 は step === 'error' かつ isRateLimited === true になる", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate limited" }),
    });

    const { result } = renderSubmission();
    await act(async () => {
      await result.current.submit({ foo: "bar" });
    });

    expect(result.current.step).toBe("error");
    expect(result.current.isRateLimited).toBe(true);
  });

  it("500 は step === 'error' かつ isRateLimited === false になる", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal" }),
    });

    const { result } = renderSubmission();
    await act(async () => {
      await result.current.submit({ foo: "bar" });
    });

    expect(result.current.step).toBe("error");
    expect(result.current.isRateLimited).toBe(false);
  });

  it("429で失敗した後、再送信して成功すると isRateLimited が false に戻る(状態の持ち越しがない)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate limited" }),
    });

    const { result } = renderSubmission();
    await act(async () => {
      await result.current.submit({ foo: "bar" });
    });
    expect(result.current.isRateLimited).toBe(true);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await act(async () => {
      await result.current.submit({ foo: "bar" });
    });

    expect(result.current.step).toBe("done");
    expect(result.current.isRateLimited).toBe(false);
  });

  it("スキーマ不一致は step === 'error' かつ isRateLimited === false になる", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false }),
    });

    const { result } = renderSubmission();
    await act(async () => {
      await result.current.submit({ foo: "bar" });
    });

    expect(result.current.step).toBe("error");
    expect(result.current.isRateLimited).toBe(false);
  });

  it("fetch が reject した場合も step === 'error' かつ isRateLimited === false になる", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));

    const { result } = renderSubmission();
    await act(async () => {
      await result.current.submit({ foo: "bar" });
    });

    expect(result.current.step).toBe("error");
    expect(result.current.isRateLimited).toBe(false);
  });
});
