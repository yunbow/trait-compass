import { NextResponse, type NextRequest } from "next/server";

import { preflightReportSubmission, reportInsertFailureResponse } from "@/lib/api/report-route";
import { stripControlChars } from "@/lib/text/strip-control-chars";

import { FacilityReportRequestSchema } from "@/features/facility-report/schema/facility-report";
import { fetchFacilityById } from "@/features/support/services/facility-search";

// POST /api/facility-report: 掲載情報の誤り報告(TICKET-0064)。
//
// このアプリで初めて利用者投稿の自由記述内容(訂正候補・補足)を D1 に永続化するエンドポイント。
// 他の AI 機能はリクエスト内容を一切ログ・保存しない設計だが、本機能は「送信内容を確認したうえで
// 送信する」明示同意ステップ(PreparePanel/AiSummarySection/RecommendHintSection と同じパターン)
// を経て初めて呼ばれる意図的な例外(design review 済み)。
//
// 保存する施設スナップショットはクライアントから受け取らず、必ずこのルートが D1 から直接
// 再取得した値から組み立てる(手順7)。クライアントが偽装したスナップショットを保存させない
// ための設計であり、同時にリクエストボディを小さく保てる。
//
// レビュー用の管理UIはこのアプリには存在しない(スコープ外)。
// 本ルートは GET を持たず、保存した報告内容を読み出す経路を一切提供しない。
//
// NFR-36: zod 検証エラー・D1 例外の詳細をレスポンス・ログのいずれにも出力しない。

export async function POST(request: NextRequest): Promise<Response> {
  const pre = await preflightReportSubmission(request, FacilityReportRequestSchema, {
    dbErrorMessage: "施設情報の取得に失敗しました。しばらくしてから再度お試しください。",
  });
  if (!pre.proceed) return pre.response;
  const { data: parsedData, db } = pre;

  const { facilityId, category, closureStatus, correctedValue, detailText } = parsedData;

  const facility = await fetchFacilityById(db, facilityId);
  if (facility === null) {
    return NextResponse.json({ error: "facility not found" }, { status: 404 });
  }

  // 手順7: 保存するスナップショットは、いま D1 から取得した値のみから組み立てる
  // (クライアント由来の「現在の掲載内容」は一切使わない)。
  const snapshot = {
    name: facility.name,
    municipality: facility.municipality,
    categoryType: facility.categoryType,
    address: facility.address,
    phone: facility.phone,
    url: facility.url,
    description: facility.description,
    contactMethods: facility.contactMethods,
    datasetId: facility.datasetId,
    datasetTitle: facility.datasetTitle,
    fetchedAt: facility.fetchedAt,
  };

  const sanitizedCorrectedValue = correctedValue !== undefined ? stripControlChars(correctedValue) : null;
  const sanitizedDetailText = detailText !== undefined ? stripControlChars(detailText) : null;

  const reportId = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO facility_reports
           (id, facility_id, facility_name, municipality, facility_snapshot_json,
            report_category, closure_status, corrected_value, detail_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reportId,
        facilityId,
        facility.name,
        facility.municipality,
        JSON.stringify(snapshot),
        category,
        closureStatus ?? null,
        sanitizedCorrectedValue,
        sanitizedDetailText,
      )
      .run();
  } catch {
    // NFR-36: 例外詳細をログ・レスポンスのいずれにも出力しない。
    return reportInsertFailureResponse();
  }

  // Slack通知は報告1件ごとの即時送信ではなく、日次ダイジェスト(未対応件数のみ、自由記述を
  // 含まない)へ変更した。
  // 通知本体は batch/ingest/report-digest.ts + batch/ingest/index.ts の Cron ハンドラが担う。

  return NextResponse.json({ ok: true }, { status: 200 });
}
