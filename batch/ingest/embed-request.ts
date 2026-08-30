// POST /embed(ingest/index.ts の handleManualEmbed)のリクエストボディ検証用の純関数。
//
// `cloudflare:workers`(WorkflowEntrypoint 等)に依存する index.ts / workflow.ts を vitest で
// import すると `Cannot find package 'cloudflare:workers'` で失敗する(Workers ランタイム専用の
// 組み込みモジュールのため)。この検証ロジック自体は D1/Workflow に一切依存しない純関数なので、
// 単独ファイルに切り出すことでテスト可能にする(db.ts が D1 非依存部分を純関数として
// 切り出している方針と同じ)。

/** POST /embed のリクエストボディ検証失敗を表す(400 として返す境界値、common/validation.md 準拠)。 */
export class EmbedRequestValidationError extends Error {}

/**
 * POST /embed のリクエストボディから `{ "deleteFacilityIds": string[] }` を読み取る(境界での
 * 入力検証、common/security.md §1「Require validation for all input data」)。
 * ボディなし・空ボディは削除なし(空配列)として扱う。ボディがあるのに不正な JSON、または
 * `deleteFacilityIds` が存在するのに文字列配列でない場合は `EmbedRequestValidationError` を
 * 投げる(呼び出し元が 400 を返す)。`datasetIds`(POST /trigger 側、readDatasetIdsFromBody)とは
 * 異なり、こちらは呼び出し元がスクリプトからの機械的な POST のみを想定するため、
 * 不正なボディは黙って無視せず明示的にエラーにする。
 */
export async function readDeleteFacilityIdsFromBody(request: Request): Promise<string[]> {
  const contentLength = request.headers.get("content-length");
  if (contentLength === "0") return [];

  const text = await request.text();
  if (text.trim() === "") return [];

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new EmbedRequestValidationError("リクエストボディが不正な JSON です。");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new EmbedRequestValidationError("リクエストボディは JSON オブジェクトである必要があります。");
  }
  if (!("deleteFacilityIds" in body)) return [];

  const value = (body as { deleteFacilityIds: unknown }).deleteFacilityIds;
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string")) {
    throw new EmbedRequestValidationError("deleteFacilityIds は文字列の配列である必要があります。");
  }
  return value;
}
