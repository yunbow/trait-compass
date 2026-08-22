import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { isSameOriginRequest } from "@/lib/api/route-helpers";
import { BETA_GATE_COOKIE_NAME } from "@/lib/beta-gate";
import { consumeBetaGateRateLimit } from "@/lib/beta-gate/rate-limit";
import { constantTimeEqual } from "@/lib/beta-gate/constant-time-equal";
import { createBetaGateSessionToken } from "@/lib/beta-gate/session-token";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// セキュリティレビュー指摘: formData() をサイズ制限なく読み込んでいたため、Content-Length で
// 事前に上限チェックする(単一のパスワードフィールドのみなので 4KB あれば十分)。
const MAX_FORM_BODY_BYTES = 4 * 1024;

const BetaGateFormSchema = z
  .object({
    // セキュリティレビュー指摘: 上限が無いと極端に長い入力でハッシュ処理コストを増やせるため、
    // 実用上あり得ない長さで打ち切る。
    password: z.string().min(1).max(200),
  })
  .strict();

export async function POST(request: NextRequest): Promise<Response> {
  // CSRF対策(security.md §2): 他ルートの isSameOriginRequest と同じ判定を再利用する。
  if (!isSameOriginRequest(request)) {
    return NextResponse.redirect(new URL("/beta-gate?error=1", request.url), { status: 303 });
  }

  // パスワード総当たり対策(security.md §3.2)。ボディを読む前に IP 単位で消費する。
  const rateLimit = await consumeBetaGateRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.redirect(new URL("/beta-gate?error=1", request.url), { status: 303 });
  }

  // セキュリティレビュー指摘: formData() を読む前に Content-Length で上限チェックする。
  const contentLength = Number(request.headers.get("content-length") ?? "");
  if (!Number.isFinite(contentLength) || contentLength > MAX_FORM_BODY_BYTES) {
    return NextResponse.redirect(new URL("/beta-gate?error=1", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const parsed = BetaGateFormSchema.safeParse(Object.fromEntries(formData));
  const expected = process.env.CLOSED_BETA_PASSWORD;

  // セキュリティレビュー指摘: `===` はタイミング攻撃の対象になり得るため定数時間比較にする。
  const isCorrect =
    parsed.success &&
    expected !== undefined &&
    (await constantTimeEqual(parsed.data.password, expected));

  const redirectUrl = new URL(isCorrect ? "/" : "/beta-gate?error=1", request.url);
  const response = NextResponse.redirect(redirectUrl, { status: 303 });

  if (isCorrect && expected !== undefined) {
    // Cookie 偽造対策(セキュリティレビュー指摘): 固定値ではなく、期限付きHMAC署名トークンを
    // 発行する。検証は src/lib/beta-gate/require-unlock.ts の requireBetaGateUnlocked が行う。
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS;
    const token = await createBetaGateSessionToken(expected, expiresAtSeconds);
    response.cookies.set(BETA_GATE_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}
