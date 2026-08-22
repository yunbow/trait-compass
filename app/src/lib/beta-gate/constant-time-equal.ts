// 定数時間文字列比較(セキュリティレビュー指摘: /api/beta-gate のパスワード比較が `===` の
// ため、一致文字数に応じた処理時間差からタイミング攻撃でパスワードを推測され得る)。
//
// Node.js の `crypto.timingSafeEqual` は同じ長さのバッファ同士でしか使えず、また
// Cloudflare Workers 上での可用性を `nodejs_compat` フラグに依存させたくないため、
// `src/lib/beta-gate/session-token.ts` と同じ Web Crypto API(`crypto.subtle`)の
// HMAC-verify を使う。`crypto.subtle.verify` は内部で定数時間比較を行う仕様
// (WebCrypto仕様、実装依存だが主要ランタイムはタイミングセーフに実装している)ため、
// 「ランダム鍵で a を HMAC 署名し、その署名が HMAC(鍵, b) と一致するか verify する」ことで
// 文字列比較そのものを定数時間化する。

async function importHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const key = await importHmacKey();
  const macA = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(a));
  return crypto.subtle.verify("HMAC", key, macA, new TextEncoder().encode(b));
}
