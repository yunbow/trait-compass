import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { TRACKABLE_SCREENS } from "@/lib/analytics/client";
import { parseSimpleJsonBody } from "@/lib/api/route-helpers";
import { getDb } from "@/lib/db";
import { consumeTrackRateLimit } from "@/lib/track/rate-limit";

// POST /api/track: プライバシー配慮の利用計測(TICKET-0034)。
//
// 画面到達数を日付×画面単位で集計するだけの、ファーストパーティの D1 UPSERT エンドポイント。
// IP・User-Agent・日付単位より詳細なタイムスタンプ・screen 以外のペイロードは一切保存しない
// (NFR-31〜33)。body は zod で `{ screen }` のみを strict 検証し、不正な body・未知の
// プロパティを含む body・未知の screen 値はすべて 400 とする(security.md/validation.md:
// 全入力データに Zod 等での検証を要求する)。

const TrackRequestSchema = z
  .object({
    screen: z.enum(TRACKABLE_SCREENS),
  })
  .strict();

/** 保存する日付(ISO 8601 の日付部分、UTC)。時刻は保持しない。 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest): Promise<Response> {
  // セキュリティレビュー指摘: レート制限が無く連続POSTでusage_countsを汚染できたため追加。
  // ボディを読む前に IP 単位で消費する(他の3ルートと同じ方針)。
  const rateLimit = await consumeTrackRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
    );
  }

  const parsed = await parseSimpleJsonBody(request, TrackRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const { screen } = parsed.data;

  try {
    const db = getDb();
    await db
      .prepare(
        `INSERT INTO usage_counts (date, screen, count) VALUES (?, ?, 1)
         ON CONFLICT(date, screen) DO UPDATE SET count = count + 1`,
      )
      .bind(todayUtc(), screen)
      .run();
  } catch {
    // D1 が利用できない環境(ローカル未セットアップ等)でも、計測失敗が画面表示に影響しては
    // ならない(呼び出し元の trackPageReached は fire-and-forget でレスポンスを見ない)。
    return NextResponse.json({ error: "tracking unavailable" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
