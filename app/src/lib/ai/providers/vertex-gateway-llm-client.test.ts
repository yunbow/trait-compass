import { describe, expect, it, vi } from "vitest";
import {
  VertexGatewayLlmClient,
  buildVertexGatewayUrl,
  readCacheTtlSeconds,
} from "@/lib/ai/providers/vertex-gateway-llm-client";

describe("buildVertexGatewayUrl", () => {
  it("AI_GATEWAY_URL に google-vertex-ai パスを付与した URL を組み立てる", () => {
    const url = buildVertexGatewayUrl({
      gatewayUrl: "https://gateway.ai.cloudflare.com/v1/my-account/my-gateway",
      project: "my-project",
      location: "asia-northeast1",
      model: "gemini-2.5-flash",
    });
    expect(url).toBe(
      "https://gateway.ai.cloudflare.com/v1/my-account/my-gateway/google-vertex-ai/v1/projects/my-project/locations/asia-northeast1/publishers/google/models/gemini-2.5-flash:generateContent",
    );
  });

  it("gatewayUrl 末尾のスラッシュを正規化する", () => {
    const url = buildVertexGatewayUrl({
      gatewayUrl: "https://gateway.ai.cloudflare.com/v1/my-account/my-gateway/",
      project: "my-project",
      location: "asia-northeast1",
      model: "gemini-2.5-flash",
    });
    expect(url.startsWith("https://gateway.ai.cloudflare.com/v1/my-account/my-gateway/google-vertex-ai")).toBe(
      true,
    );
  });
});

describe("VertexGatewayLlmClient", () => {
  const config = {
    gatewayUrl: "https://gateway.ai.cloudflare.com/v1/my-account/my-gateway",
    project: "my-project",
    location: "asia-northeast1",
    accessToken: "test-token",
    model: "gemini-2.5-flash",
  };

  it("NFR-34 回帰テスト: cf-aig-collect-log: false ヘッダーを必ず付与する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new VertexGatewayLlmClient(config);
    await client.generate("テスト");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({ "cf-aig-collect-log": "false" });

    vi.unstubAllGlobals();
  });

  it("AI Gateway 経由の URL・Authorization ヘッダーで fetch する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new VertexGatewayLlmClient(config);
    const result = await client.generate("テスト");

    expect(result.text).toBe("OK");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://gateway.ai.cloudflare.com/v1/my-account/my-gateway/google-vertex-ai/v1/projects/my-project/locations/asia-northeast1/publishers/google/models/gemini-2.5-flash:generateContent",
    );
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-token" });

    vi.unstubAllGlobals();
  });

  it("設定が不足している場合は例外を投げ、fetch を呼ばない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new VertexGatewayLlmClient({});
    await expect(client.generate("テスト")).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  // 2026-08是正: BYOK(Gateway側に保存済みの Google service account)運用では
  // GOOGLE_VERTEX_ACCESS_TOKEN を設定しない。この場合も例外にせず、Authorization ヘッダーを
  // 付けずに fetch する(Gateway が認証を自動注入する)。
  it("accessToken が無い場合(BYOK運用)は例外を投げず、Authorization ヘッダーを付けずに fetch する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { accessToken: _accessToken, ...configWithoutToken } = config;
    const client = new VertexGatewayLlmClient(configWithoutToken);
    const result = await client.generate("テスト");

    expect(result.text).toBe("OK");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(init.headers).toMatchObject({ "cf-aig-collect-log": "false" });

    vi.unstubAllGlobals();
  });

  // 2026-08是正: AI Gateway の「認証済みゲートウェイ」を有効にしている場合、
  // cf-aig-authorization が無いと Gateway 入口で拒否される(Vertex AI 側の認証とは別レイヤー)。
  it("authGatewayToken がある場合、cf-aig-authorization ヘッダーを付けて fetch する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new VertexGatewayLlmClient({ ...config, authGatewayToken: "gateway-token" });
    await client.generate("テスト");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({ "cf-aig-authorization": "Bearer gateway-token" });

    vi.unstubAllGlobals();
  });

  it("authGatewayToken が無い場合、cf-aig-authorization ヘッダーを付けずに fetch する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new VertexGatewayLlmClient(config);
    await client.generate("テスト");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("cf-aig-authorization");

    vi.unstubAllGlobals();
  });

  it("cacheable と TTL が両方ある場合だけキャッシュヘッダーを付け、常にログ収集を無効化する", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), { status: 200 }),
    ));
    vi.stubGlobal("fetch", fetchMock);
    const client = new VertexGatewayLlmClient({ ...config, cacheTtlSeconds: 3600 });

    await client.generate("テスト");
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("cf-aig-cache-ttl");
    await client.generate("テスト", { cacheable: true });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      "cf-aig-cache-ttl": "3600",
      "cf-aig-collect-log": "false",
    });
    vi.unstubAllGlobals();
  });
});

describe("readCacheTtlSeconds", () => {
  it.each([["3600", 3600], [undefined, null], ["", null], ["0", null], ["-1", null], ["abc", null]])(
    "%j を安全に解決する",
    (raw, expected) => expect(readCacheTtlSeconds(raw)).toBe(expected),
  );
});
