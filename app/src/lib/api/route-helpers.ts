import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

import { AI_DISABLED_MESSAGE, AI_ERROR_CODE, AI_RATE_LIMITED_MESSAGE } from "@/lib/api/ai-error-codes";
import { getDb } from "@/lib/db";

const DEFAULT_MAX_REQUEST_BODY_BYTES = 10 * 1024;

export interface ApiErrorBody {
  error: { code: string; message: string };
}

type JsonRequestResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse<ApiErrorBody> };

export function apiErrorResponse(
  code: string,
  message: string,
  status: number,
  options: { headers?: Record<string, string> } = {},
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status, headers: options.headers });
}

/** レート制限超過(TICKET-0035 AC-1)。Retry-After 秒を添えて 429 を返す。 */
export function aiRateLimitedResponse(retryAfterSeconds: number): NextResponse<ApiErrorBody> {
  return apiErrorResponse(AI_ERROR_CODE.RATE_LIMITED, AI_RATE_LIMITED_MESSAGE, 429, {
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

/** AI 機能停止中(TICKET-0035 AC-3)。非AI代替を持たない API 用の 503。 */
export function aiDisabledResponse(): NextResponse<ApiErrorBody> {
  return apiErrorResponse(AI_ERROR_CODE.AI_DISABLED, AI_DISABLED_MESSAGE, 503);
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

interface SimpleErrorBody {
  error: string;
}

type OriginAndSizeCheckResult =
  | { ok: true; rawBody: string }
  | { ok: false; response: NextResponse<SimpleErrorBody> };

/**
 * facility-report/content-report/track の3ルート専用の軽量ガード(G-3: 安全ガード配線ギャップ対応)。
 *
 * この3ルートは他の AI ルート群と異なり `parseJsonRequest` を経由せず独自に `request.json()` を
 * 呼んでいたため、同一オリジンチェックとボディサイズ上限が配線されていなかった。
 * TICKET-0064 で「意図的」と明記されているのはエラーレスポンスの**形式**(`{error: string}`という
 * 素朴な形)のみであり、この2つのガード自体は文書化された仕様ではなかったため追加する。
 *
 * `parseJsonRequest` 本体は変更しない(戻り値の型・エラー形式が異なるため別関数とする)。
 * 同一オリジン判定は既存の `isSameOriginRequest` をそのまま再利用する。
 */
export async function checkRequestOriginAndSize(
  request: NextRequest,
  options: { maxBodyBytes?: number } = {},
): Promise<OriginAndSizeCheckResult> {
  if (!isSameOriginRequest(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid request origin" }, { status: 403 }),
    };
  }

  const rawBody = await request.text();
  const bodyByteLength = new TextEncoder().encode(rawBody).length;
  if (bodyByteLength > (options.maxBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "request body too large" }, { status: 413 }),
    };
  }

  return { ok: true, rawBody };
}

type SimpleJsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse<SimpleErrorBody> };

/**
 * facility-report/content-report/track の3ルート専用のボディ解析(report-and-track-route-preflight)。
 *
 * 「同一オリジン+サイズ上限チェック(`checkRequestOriginAndSize`)→ `JSON.parse`(400
 * `invalid JSON body`)→ `schema.safeParse`(400 `invalid request body`)」の12行が3ルートで
 * 逐語一致していたため統合する。エラー形状は素朴な `{error: string}` のまま(`parseJsonRequest` の
 * `{error:{code,message}}` とは別物、TICKET-0064 で意図的とされている形式)。
 */
export async function parseSimpleJsonBody<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
  options: { maxBodyBytes?: number } = {},
): Promise<SimpleJsonBodyResult<T>> {
  const originAndSizeCheck = await checkRequestOriginAndSize(request, options);
  if (!originAndSizeCheck.ok) {
    return { ok: false, response: originAndSizeCheck.response };
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(originAndSizeCheck.rawBody);
  } catch {
    return { ok: false, response: NextResponse.json({ error: "invalid JSON body" }, { status: 400 }) };
  }

  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: "invalid request body" }, { status: 400 }) };
  }

  return { ok: true, data: parsed.data };
}

type DbResult =
  | { ok: true; db: ReturnType<typeof getDb> }
  | { ok: false; response: NextResponse<ApiErrorBody> };

/**
 * `getDb()` を NFR-36 準拠(例外オブジェクトの詳細をログ・レスポンスのいずれにも出さない)で
 * 取得する(report-and-track-route-preflight)。ask/recommend/prepare/facility-report/
 * content-report の5ルートで構造100%一致していた try/catch を統合したもの。失敗時は
 * `apiErrorResponse("UPSTREAM_ERROR", message, 502)`。message はファイルごとの現行文言をそのまま渡す。
 */
export function getDbOrErrorResponse(message: string): DbResult {
  try {
    return { ok: true, db: getDb() };
  } catch {
    // NFR-36: 例外オブジェクトをログに出力しない。
    return { ok: false, response: apiErrorResponse("UPSTREAM_ERROR", message, 502) };
  }
}

export async function parseJsonRequest<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
  options: { maxBodyBytes?: number } = {},
): Promise<JsonRequestResult<T>> {
  if (!isSameOriginRequest(request)) {
    return {
      success: false,
      response: apiErrorResponse("FORBIDDEN", "許可されていないリクエスト元です。", 403),
    };
  }

  const rawBody = await request.text();
  const bodyByteLength = new TextEncoder().encode(rawBody).length;
  if (bodyByteLength > (options.maxBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES)) {
    return {
      success: false,
      response: apiErrorResponse("PAYLOAD_TOO_LARGE", "リクエストボディが大きすぎます。", 413),
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return {
      success: false,
      response: apiErrorResponse("BAD_REQUEST", "リクエストボディが不正な JSON です。", 400),
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      response: apiErrorResponse("VALIDATION_ERROR", "入力内容を確認してください。", 400),
    };
  }

  return { success: true, data: parsed.data };
}

export function validatedJsonResponse<T>(
  body: T,
  schema: z.ZodType<T>,
): NextResponse<T | ApiErrorBody> {
  const validated = schema.safeParse(body);
  if (!validated.success) {
    return apiErrorResponse("INTERNAL_ERROR", "応答の生成に失敗しました。", 500);
  }
  return NextResponse.json(validated.data, { status: 200 });
}
