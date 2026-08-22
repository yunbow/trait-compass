import type { z } from "zod";

/**
 * クライアントコンポーネントから内部 API へ JSON を POST し、応答を Zod で検証する共通ヘルパー。
 *
 * 8つのクライアント fetch 箇所(AiSummarySection / AskAiPanel / CategoryExplainSection /
 * PreparePanel / RecommendHintSection / PurposeSelectionForm / FacilityReportForm /
 * ContentReportForm)で「fetch → HTTPエラー処理 → json() → safeParse」が1バイト一致していたため
 * 抽出した。
 *
 * 共通化するのは通信・検証の機構のみで、**失敗時に画面をどう出すか(エラー文言の解決・429の
 * 出し分け・state遷移)は呼び出し側に残す**。そのため戻り値は失敗理由を判別できる union にしている。
 *
 * 設計上の約束:
 * - この関数は決して throw しない(fetch の同期例外・ネットワーク例外・JSON 破損をすべて内部で吸収)。
 * - エラー応答本文は `res.json()` で読む(`res.text()` は使わない)。既存の3箇所
 *   (summarize/recommend/purpose-pickup)の挙動と一致させるためであり、また報告フォームの
 *   既存テストが `{ ok, status, json }` だけを持つ部分モックを使っているため text() では壊れる。
 * - AbortController・タイムアウト・リトライは足さない(現行8箇所のいずれも使っていない。YAGNI)。
 * - サーバー側 lib/ai/providers の `fetch→!ok→throw` 系とは別物なのでここへ統合しない。
 */
export type PostJsonResult<T> =
  | { ok: true; data: T }
  /** HTTP ステータスが 2xx 以外。`errorBody` は読めなかった場合 null。 */
  | { ok: false; reason: "http-error"; status: number; errorBody: unknown }
  /** 2xx だが応答が期待するスキーマに一致しなかった。 */
  | { ok: false; reason: "invalid-response" }
  /** 通信自体が失敗した、または応答本文が読めなかった。 */
  | { ok: false; reason: "request-failed" };

export async function postJson<T>(
  url: string,
  body: unknown,
  responseSchema: z.ZodType<T>,
): Promise<PostJsonResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errorBody: unknown = null;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = null;
      }
      return { ok: false, reason: "http-error", status: res.status, errorBody };
    }

    const json: unknown = await res.json();
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) return { ok: false, reason: "invalid-response" };

    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, reason: "request-failed" };
  }
}
