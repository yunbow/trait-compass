// サーバー(route handler)とクライアント("use client")の双方から利用するため、依存を持たない。

export const AI_ERROR_CODE = {
  RATE_LIMITED: "RATE_LIMITED",
  AI_DISABLED: "AI_DISABLED",
} as const;

export const AI_RATE_LIMITED_MESSAGE =
  "AI 機能へのリクエストが短時間に集中しています。しばらく時間をおいてからお試しください。";

export const AI_DISABLED_MESSAGE =
  "AI 機能は現在一時的に停止しています。日常の困りごとチェック・結果表示・支援情報の検索は通常どおりご利用いただけます。";

/** API エラー応答 body({ error: { code, message } })から code を安全に取り出す。 */
export function extractApiErrorCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error = body.error;
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

/** エラーコードに対応する利用者向け文言。未知のコードは呼び出し元の既定文言を返す。 */
export function resolveAiErrorMessage(code: string | undefined, fallbackMessage: string): string {
  if (code === AI_ERROR_CODE.RATE_LIMITED) return AI_RATE_LIMITED_MESSAGE;
  if (code === AI_ERROR_CODE.AI_DISABLED) return AI_DISABLED_MESSAGE;
  return fallbackMessage;
}
