import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto as unknown as Crypto);

import { createBetaGateSessionToken, verifyBetaGateSessionToken } from "@/lib/beta-gate/session-token";

describe("beta-gate セッショントークン(HMAC署名Cookie)", () => {
  it("正しい秘密鍵・未失効なら検証を通す", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = await createBetaGateSessionToken("secret", expiresAt);

    await expect(verifyBetaGateSessionToken(token, "secret")).resolves.toBe(true);
  });

  it("秘密鍵が違えば拒否する", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = await createBetaGateSessionToken("secret", expiresAt);

    await expect(verifyBetaGateSessionToken(token, "other-secret")).resolves.toBe(false);
  });

  it("期限切れなら拒否する", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 1;
    const token = await createBetaGateSessionToken("secret", expiresAt);

    await expect(verifyBetaGateSessionToken(token, "secret")).resolves.toBe(false);
  });

  it("トークンが無い・壊れている場合は拒否する(D1に触れず即falseなfail-closed)", async () => {
    await expect(verifyBetaGateSessionToken(undefined, "secret")).resolves.toBe(false);
    await expect(verifyBetaGateSessionToken("", "secret")).resolves.toBe(false);
    await expect(verifyBetaGateSessionToken("not-a-token", "secret")).resolves.toBe(false);
    await expect(verifyBetaGateSessionToken("123.not-hex!!", "secret")).resolves.toBe(false);
  });

  it("固定値 '1' 等の非署名Cookieは拒否する(Cookie偽造対策)", async () => {
    await expect(verifyBetaGateSessionToken("1", "secret")).resolves.toBe(false);
  });

  it("有効期限(expiresAt)を書き換えた署名なしトークンは拒否する(改ざん検知)", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 100; // 期限切れ
    const token = await createBetaGateSessionToken("secret", expiresAt);
    const [, signatureHex] = token.split(".");
    const tamperedExpiresAt = Math.floor(Date.now() / 1000) + 3600; // 未来に書き換え
    const tamperedToken = `${tamperedExpiresAt}.${signatureHex}`;

    await expect(verifyBetaGateSessionToken(tamperedToken, "secret")).resolves.toBe(false);
  });
});
