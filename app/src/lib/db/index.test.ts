import { describe, expect, it, vi } from "vitest";

const getCloudflareContextMock = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...args: unknown[]) => getCloudflareContextMock(...args),
}));

import { getDb } from "@/lib/db";

describe("getDb", () => {
  it("env.DB が設定されている場合はそのまま返す", () => {
    const fakeDb = { prepare: vi.fn() };
    getCloudflareContextMock.mockReturnValue({ env: { DB: fakeDb }, cf: undefined, ctx: {} });

    expect(getDb()).toBe(fakeDb);
  });

  it("env.DB が未設定の場合は例外を投げる", () => {
    getCloudflareContextMock.mockReturnValue({ env: {}, cf: undefined, ctx: {} });

    expect(() => getDb()).toThrow(/D1 binding 'DB' is not configured/);
  });
});
