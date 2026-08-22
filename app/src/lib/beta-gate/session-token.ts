import { BETA_GATE_COOKIE_NAME } from "@/lib/beta-gate";

// クローズドベータCookie(nd-beta-unlocked)の署名付きトークン(HMAC-SHA256)。
//
// 従来は Cookie の値が固定文字列 "1" で、HttpOnly でも「利用者が devtools で Cookie を
// 手動追加する」操作自体は防げない(HttpOnly が防ぐのは document.cookie 経由の JS アクセス
// のみ)ため、値を知ってさえいれば誰でもゲートを突破できた(セキュリティレビュー指摘)。
//
// 署名鍵は新たな Workers Secret を増やさず、既存の CLOSED_BETA_PASSWORD(NFR-11、
// `wrangler secret put` で設定済みの Workers Secret)を SHA-256 で鍵材料化して導出する。
// この臨時対応(TICKET番号なし、proxy.ts 冒頭コメント参照)にDB/KVセッションストアや
// 専用シークレットの追加運用コストを持ち込まないための選択であり、副次的にパスワードを
// ローテーションすると発行済みトークンが自動的に無効化される利点もある。
//
// トークン形式: `${expiresAtSeconds}.${hmacHex}`。`crypto.subtle.verify` は定数時間比較を
// 内部で行うため、署名検証に文字列の `===` 比較は使わない。

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function signingMessage(expiresAtSeconds: number): string {
  return `${BETA_GATE_COOKIE_NAME}:${expiresAtSeconds}`;
}

export async function createBetaGateSessionToken(secret: string, expiresAtSeconds: number): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingMessage(expiresAtSeconds)));
  return `${expiresAtSeconds}.${toHex(signature)}`;
}

export async function verifyBetaGateSessionToken(
  token: string | undefined,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (token === undefined) return false;

  const separatorIndex = token.indexOf(".");
  if (separatorIndex < 0) return false;

  const expiresAtRaw = token.slice(0, separatorIndex);
  const signatureHex = token.slice(separatorIndex + 1);

  const expiresAtSeconds = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds * 1000 < nowMs) return false;

  const signatureBytes = hexToBytes(signatureHex);
  if (signatureBytes === null) return false;

  const key = await importHmacKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    // TS 5.7+ の Uint8Array ジェネリクス化により素の `new Uint8Array(n)` は
    // `Uint8Array<ArrayBufferLike>` と推論され、dom.d.ts の BufferSource(ArrayBuffer前提)と
    // 型上噛み合わない(実行時は問題ない)。TextEncoder.encode() の戻り値のみ
    // `Uint8Array<ArrayBuffer>` として扱われるための差異。
    signatureBytes as BufferSource,
    new TextEncoder().encode(signingMessage(expiresAtSeconds)),
  );
}
