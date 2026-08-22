import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto as unknown as Crypto);

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { requireBetaGateUnlocked } from "@/lib/beta-gate/require-unlock";
import { BETA_GATE_COOKIE_NAME } from "@/lib/beta-gate";
import { createBetaGateSessionToken } from "@/lib/beta-gate/session-token";

function mockCookieValue(value: string | undefined) {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (name === BETA_GATE_COOKIE_NAME && value !== undefined ? { name, value } : undefined),
  });
}

describe("requireBetaGateUnlocked(page.tsx から呼ぶベータゲート判定)", () => {
  let originalPassword: string | undefined;

  beforeEach(() => {
    originalPassword = process.env.CLOSED_BETA_PASSWORD;
    redirectMock.mockClear();
    cookiesMock.mockReset();
  });

  afterEach(() => {
    if (originalPassword === undefined) {
      delete process.env.CLOSED_BETA_PASSWORD;
    } else {
      process.env.CLOSED_BETA_PASSWORD = originalPassword;
    }
  });

  it("パスワード未設定なら何もしない(Cookieにも触れない)", async () => {
    delete process.env.CLOSED_BETA_PASSWORD;

    await requireBetaGateUnlocked();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it("有効な署名付きCookieがあればリダイレクトしない", async () => {
    process.env.CLOSED_BETA_PASSWORD = "secret";
    const token = await createBetaGateSessionToken("secret", Math.floor(Date.now() / 1000) + 3600);
    mockCookieValue(token);

    await requireBetaGateUnlocked();

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("Cookieが無ければ /beta-gate へリダイレクトする", async () => {
    process.env.CLOSED_BETA_PASSWORD = "secret";
    mockCookieValue(undefined);

    await requireBetaGateUnlocked();

    expect(redirectMock).toHaveBeenCalledWith("/beta-gate");
  });

  it("固定値 '1' 等の非署名Cookieはリダイレクトする(Cookie偽造対策)", async () => {
    process.env.CLOSED_BETA_PASSWORD = "secret";
    mockCookieValue("1");

    await requireBetaGateUnlocked();

    expect(redirectMock).toHaveBeenCalledWith("/beta-gate");
  });

  it("別のパスワードで発行されたCookieはリダイレクトする", async () => {
    process.env.CLOSED_BETA_PASSWORD = "secret";
    const token = await createBetaGateSessionToken("other-secret", Math.floor(Date.now() / 1000) + 3600);
    mockCookieValue(token);

    await requireBetaGateUnlocked();

    expect(redirectMock).toHaveBeenCalledWith("/beta-gate");
  });
});
