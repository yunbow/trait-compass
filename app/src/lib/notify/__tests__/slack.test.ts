import { afterEach, describe, expect, it, vi } from "vitest";

import { postSlackMessage } from "@/lib/notify/slack";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("postSlackMessage", () => {
  it("SLACK_WEBHOOK_URL が未設定の場合は何もしない(fetchを呼ばない)", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await postSlackMessage("テストメッセージ");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SLACK_WEBHOOK_URL が設定されている場合、{text} をJSONでPOSTする", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.example/services/xxx");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await postSlackMessage("テストメッセージ");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.example/services/xxx");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(init?.body).toBe(JSON.stringify({ text: "テストメッセージ" }));
  });

  it("fetch が例外を投げても握りつぶし、呼び出し元には例外を伝播させない", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.example/services/xxx");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    await expect(postSlackMessage("テストメッセージ")).resolves.toBeUndefined();
  });

  it("fetch が reject された Promise を返しても握りつぶす", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.example/services/xxx");
    vi.spyOn(globalThis, "fetch").mockReturnValue(Promise.reject(new Error("slack side error")));

    await expect(postSlackMessage("テストメッセージ")).resolves.toBeUndefined();
  });
});
