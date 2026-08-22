import { NextResponse, type NextRequest } from "next/server";

import { apiErrorResponse, getDbOrErrorResponse, parseSimpleJsonBody } from "@/lib/api/route-helpers";
import { consumeFeedbackRateLimit } from "@/lib/feedback/rate-limit";
import { stripControlChars } from "@/lib/text/strip-control-chars";

import { FeedbackRequestSchema } from "@/features/feedback/schema/feedback";

// POST /api/feedback: 支援先一覧「このページで、次に何をすればよいか分かりましたか?」フィードバック。
//
// プライバシー最小主義(個人を特定できる情報を一切保存しない、NFR-31〜33)を厳守するため、
// 3択評価(kind: "rating")・「まだ分からない」の内訳(kind: "unclear-reason")は日付×選択肢の
// 集計カウンタへの UPSERT のみとし、行レベル記録を一切持たない(usage_counts と同方針)。
// 任意の一言コメント(kind: "comment")のみ、送信された自由記述文そのものを feedback_comments に
// 保持する。公開は開発者が内容を確認したうえで wrangler d1 execute で手動更新する(専用の管理UI
// は持たない、facility_reports.status と同じ運用方針)。
//
// 処理順序は facility-report/content-report(`lib/api/report-route.ts` の
// preflightReportSubmission)と揃える: JSON解析+zod検証 → ハニーポット → レート制限 → D1取得。
// facility-report/content-report とはレート制限のテーブル・上限が異なる(feedback_rate_limits、
// IP単位10 req/600秒)ため、共通ヘルパーはそのままでは再利用できず、ここで個別に組み立てる
// (parseSimpleJsonBody/getDbOrErrorResponse/apiErrorResponse は shape が一致するためそのまま使う)。
//
// NFR-36: zod 検証エラー・D1 例外の詳細をレスポンス・ログのいずれにも出力しない。

/** 保存する日付(ISO 8601 の日付部分、UTC)。時刻は保持しない(/api/track と同一方式)。 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parseSimpleJsonBody(request, FeedbackRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const data = parsed.data;

  // ハニーポット: comment の website が非空ならbotとみなし、保存せず偽の成功を返す
  // (挙動を学習させない、facility-report/content-report と同じ思想)。
  if (data.kind === "comment" && data.website !== undefined && data.website.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const rateLimit = await consumeFeedbackRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate limited", retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429 },
    );
  }

  const dbResult = getDbOrErrorResponse("送信できませんでした。しばらくしてから再度お試しください。");
  if (!dbResult.ok) {
    return dbResult.response;
  }
  const { db } = dbResult;

  try {
    if (data.kind === "rating") {
      await db
        .prepare(
          `INSERT INTO feedback_rating_counts (date, source, rating, count) VALUES (?, ?, ?, 1)
           ON CONFLICT(date, source, rating) DO UPDATE SET count = count + 1`,
        )
        .bind(todayUtc(), data.source, data.rating)
        .run();
    } else if (data.kind === "unclear-reason") {
      await db
        .prepare(
          `INSERT INTO feedback_unclear_reason_counts (date, reason, count) VALUES (?, ?, 1)
           ON CONFLICT(date, reason) DO UPDATE SET count = count + 1`,
        )
        .bind(todayUtc(), data.reason)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO feedback_comments
             (id, created_date, source, comment_text, publish_consent, published)
           VALUES (?, ?, ?, ?, ?, 0)`,
        )
        .bind(
          crypto.randomUUID(),
          todayUtc(),
          data.source,
          stripControlChars(data.commentText),
          data.publishConsent ? 1 : 0,
        )
        .run();
    }
  } catch {
    // NFR-36: 例外詳細をログ・レスポンスのいずれにも出力しない。
    return apiErrorResponse("INTERNAL_ERROR", "送信できませんでした。しばらくしてから再度お試しください。", 500);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
