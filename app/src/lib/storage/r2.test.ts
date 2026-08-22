import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// aws4fetch は実ネットワークアクセスを行うため、AwsClient をモックしてテストする。
const fetchMock = vi.fn();
vi.mock("aws4fetch", () => {
  return {
    AwsClient: vi.fn().mockImplementation(() => ({
      fetch: fetchMock,
    })),
  };
});

import {
  buildObjectEndpointUrl,
  buildPublicObjectUrl,
  isR2Enabled,
  type R2Config,
} from "@/lib/storage/r2";

describe("isR2Enabled", () => {
  const fullConfig: R2Config = {
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
    bucketName: "trait-compass",
    endpoint: "http://localhost:9000",
    publicUrl: "http://localhost:9000/trait-compass",
  };

  it("5変数すべてが設定されている場合は true", () => {
    expect(isR2Enabled(fullConfig)).toBe(true);
  });

  it.each([
    ["accessKeyId"],
    ["secretAccessKey"],
    ["bucketName"],
    ["endpoint"],
    ["publicUrl"],
  ] as const)("%s が欠けている場合は false", (key) => {
    const config = { ...fullConfig, [key]: undefined };
    expect(isR2Enabled(config)).toBe(false);
  });

  it("すべて未設定の場合は false", () => {
    expect(isR2Enabled({})).toBe(false);
  });
});

describe("buildObjectEndpointUrl", () => {
  it("endpoint/bucket/key のパス形式 URL を組み立てる", () => {
    const url = buildObjectEndpointUrl(
      { endpoint: "http://localhost:9000", bucketName: "trait-compass" },
      "images/foo.png",
    );
    expect(url).toBe("http://localhost:9000/trait-compass/images/foo.png");
  });

  it("endpoint 末尾のスラッシュを正規化する", () => {
    const url = buildObjectEndpointUrl(
      { endpoint: "http://localhost:9000/", bucketName: "trait-compass" },
      "images/foo.png",
    );
    expect(url).toBe("http://localhost:9000/trait-compass/images/foo.png");
  });

  it("key 先頭のスラッシュを正規化する", () => {
    const url = buildObjectEndpointUrl(
      { endpoint: "http://localhost:9000", bucketName: "trait-compass" },
      "/images/foo.png",
    );
    expect(url).toBe("http://localhost:9000/trait-compass/images/foo.png");
  });

  it("endpoint が無い場合は例外を投げる", () => {
    expect(() =>
      buildObjectEndpointUrl({ bucketName: "trait-compass" }, "images/foo.png"),
    ).toThrow();
  });

  it("bucketName が無い場合は例外を投げる", () => {
    expect(() =>
      buildObjectEndpointUrl({ endpoint: "http://localhost:9000" }, "images/foo.png"),
    ).toThrow();
  });
});

describe("buildPublicObjectUrl", () => {
  it("R2_PUBLIC_URL ベースの公開 URL を組み立てる", () => {
    const url = buildPublicObjectUrl(
      { publicUrl: "http://localhost:9000/trait-compass" },
      "images/foo.png",
    );
    expect(url).toBe("http://localhost:9000/trait-compass/images/foo.png");
  });

  it("publicUrl 末尾のスラッシュを正規化する", () => {
    const url = buildPublicObjectUrl(
      { publicUrl: "http://localhost:9000/trait-compass/" },
      "images/foo.png",
    );
    expect(url).toBe("http://localhost:9000/trait-compass/images/foo.png");
  });

  it("publicUrl が無い場合は例外を投げる(内部 endpoint を誤って公開しない)", () => {
    expect(() => buildPublicObjectUrl({}, "images/foo.png")).toThrow();
  });
});

describe("R2_ENABLED / getObjectUrl (モジュールレベルの環境変数読み込み)", () => {
  const ENV_KEYS = [
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ENDPOINT",
    "R2_PUBLIC_URL",
  ] as const;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    fetchMock.mockReset();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    vi.resetModules();
  });

  it("5変数すべて設定時は R2_ENABLED が true になる", async () => {
    process.env.R2_ACCESS_KEY_ID = "minioadmin";
    process.env.R2_SECRET_ACCESS_KEY = "minioadmin";
    process.env.R2_BUCKET_NAME = "trait-compass";
    process.env.R2_ENDPOINT = "http://localhost:9000";
    process.env.R2_PUBLIC_URL = "http://localhost:9000/trait-compass";
    vi.resetModules();

    const mod = await import("@/lib/storage/r2");
    expect(mod.R2_ENABLED).toBe(true);
    expect(mod.getObjectUrl("images/foo.png")).toBe(
      "http://localhost:9000/trait-compass/images/foo.png",
    );
  });

  it("いずれかが未設定の場合は R2_ENABLED が false になる", async () => {
    process.env.R2_ACCESS_KEY_ID = "minioadmin";
    process.env.R2_SECRET_ACCESS_KEY = "minioadmin";
    process.env.R2_BUCKET_NAME = "trait-compass";
    process.env.R2_ENDPOINT = "http://localhost:9000";
    delete process.env.R2_PUBLIC_URL;
    vi.resetModules();

    const mod = await import("@/lib/storage/r2");
    expect(mod.R2_ENABLED).toBe(false);
  });

  it("R2_ENABLED が false の場合、putObject は例外を投げアクセスしない", async () => {
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_PUBLIC_URL;
    vi.resetModules();

    const mod = await import("@/lib/storage/r2");
    await expect(
      mod.putObject({ key: "x", body: "x", contentType: "text/plain" }),
    ).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
