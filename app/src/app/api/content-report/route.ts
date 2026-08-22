import { NextResponse, type NextRequest } from "next/server";

// レート制限は `/api/facility-report`(TICKET-0064)と意図的に同一クォータを共用する
// (report_rate_limits テーブル、IP単位 5 req/600秒)。掲載情報の訂正・更新報告という
// 同じ性質のスパムリスクに対する枠のため、機能ごとに枠を分けない設計判断(design review 済み)。
// preflightReportSubmission が consumeReportRateLimit を内部で呼び出す。
import { preflightReportSubmission, reportInsertFailureResponse } from "@/lib/api/report-route";
import { stripControlChars } from "@/lib/text/strip-control-chars";

import { ContentReportRequestSchema } from "@/features/content-report/schema/content-report";
import { fetchResultsGuideNote } from "@/features/support/services/results-guide-notes";
import { getResultsTabGuide } from "@/features/support/services/results-tab-guides";
import { fetchSchoolById } from "@/features/support/services/school-info";
import { fetchSupportPathwayById } from "@/features/support/services/support-pathway";

// POST /api/content-report: 掲載情報の訂正・更新報告(想定ルート・学校情報・結果の見方ガイド)。
//
// `facility-report/route.ts`(TICKET-0064)の対象を施設以外(想定ルート/学校情報/結果の見方
// ガイド)へ拡張したもの。設計方針は facility-report と同一: 明示同意ステップ(preview)を経て
// 初めて呼ばれる、利用者投稿の自由記述内容を D1 に永続化する意図的な例外。
//
// 保存する対象スナップショットはクライアントから受け取らず、必ずこのルートが D1/ソースコードから
// 直接再取得した値から組み立てる(クライアントが偽装したスナップショットを保存させないため)。
//
// レビュー用の管理UIはこのアプリには存在しない(スコープ外)。本ルートは GET を持たず、
// 保存した報告内容を読み出す経路を一切提供しない。
//
// NFR-36: zod 検証エラー・D1 例外の詳細をレスポンス・ログのいずれにも出力しない。

type ContentReportTargetType = "pathway" | "school" | "guide_note" | "guide_generic";

interface ResolvedTarget {
  targetType: ContentReportTargetType;
  targetId: string | null;
  targetLabel: string;
  municipality: string;
  lifestage: string | null;
  tab: string | null;
  snapshot: Record<string, unknown>;
}

export async function POST(request: NextRequest): Promise<Response> {
  const pre = await preflightReportSubmission(request, ContentReportRequestSchema, {
    dbErrorMessage: "掲載情報の取得に失敗しました。しばらくしてから再度お試しください。",
  });
  if (!pre.proceed) return pre.response;
  const { data: parsedData, db } = pre;

  const { category, correctedValue, detailText } = parsedData;

  let target: ResolvedTarget;

  if (parsedData.targetType === "pathway") {
    const pathway = await fetchSupportPathwayById(db, parsedData.targetId);
    if (pathway === null) {
      return NextResponse.json({ error: "pathway not found" }, { status: 404 });
    }
    target = {
      targetType: "pathway",
      targetId: pathway.id,
      targetLabel: pathway.purposeLabel,
      municipality: pathway.municipality,
      lifestage: pathway.lifestage,
      tab: null,
      snapshot: {
        municipality: pathway.municipality,
        lifestage: pathway.lifestage,
        purposeId: pathway.purposeId,
        purposeLabel: pathway.purposeLabel,
        status: pathway.status,
        steps: pathway.steps,
        sources: pathway.sources,
      },
    };
  } else if (parsedData.targetType === "school") {
    const school = await fetchSchoolById(db, parsedData.targetId);
    if (school === null) {
      return NextResponse.json({ error: "school not found" }, { status: 404 });
    }
    target = {
      targetType: "school",
      targetId: school.id,
      targetLabel: school.name,
      municipality: school.municipality,
      lifestage: null,
      tab: null,
      snapshot: {
        name: school.name,
        municipality: school.municipality,
        level: school.level,
        address: school.address ?? null,
        phone: school.phone ?? null,
        url: school.url ?? null,
        districtNote: school.districtNote ?? null,
        fixedClasses: school.fixedClasses,
        resourceRoom: school.resourceRoom ?? null,
        sources: school.sources,
      },
    };
  } else {
    // "guide": D1 の自治体固有補足(results_guide_notes)を優先し、無ければ汎用ガイド
    // (getResultsTabGuide、ソースコード由来)にフォールバックする。両方無ければ 404。
    const { municipality: municipalityEntry, tab, lifestage } = parsedData;
    const municipality = municipalityEntry.name;
    const note = await fetchResultsGuideNote(db, { municipality, tab });
    const genericGuide = getResultsTabGuide(tab, lifestage);

    if (note === null && genericGuide === null) {
      return NextResponse.json({ error: "guide not found" }, { status: 404 });
    }

    if (note !== null) {
      target = {
        targetType: "guide_note",
        targetId: note.id,
        targetLabel: genericGuide?.heading ?? tab,
        municipality,
        lifestage,
        tab,
        snapshot: {
          municipality,
          tab,
          lifestage,
          noteBody: note.body,
          noteSources: note.sources,
        },
      };
    } else {
      // genericGuide !== null はここまでに確定している(note === null かつ両方nullなら404済み)。
      const guide = genericGuide!;
      target = {
        targetType: "guide_generic",
        targetId: null,
        targetLabel: guide.heading,
        municipality,
        lifestage,
        tab,
        snapshot: {
          municipality,
          tab,
          lifestage,
          heading: guide.heading,
          keyPoints: guide.keyPoints,
          body: guide.body,
          sources: guide.sources,
        },
      };
    }
  }

  const sanitizedCorrectedValue = correctedValue !== undefined ? stripControlChars(correctedValue) : null;
  const sanitizedDetailText = detailText !== undefined ? stripControlChars(detailText) : null;

  const reportId = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO content_reports
           (id, target_type, target_id, target_label, municipality, lifestage, tab,
            target_snapshot_json, report_category, corrected_value, detail_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reportId,
        target.targetType,
        target.targetId,
        target.targetLabel,
        target.municipality,
        target.lifestage,
        target.tab,
        JSON.stringify(target.snapshot),
        category,
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
