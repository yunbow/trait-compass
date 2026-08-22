import type { Metadata } from "next";

import { FullPageFallback } from "@/components/common/FullPageFallback";
import { SmartBackLinkButton } from "@/components/common/SmartBackLinkButton";
import { firstValue, resolveBackHref } from "@/components/common/report-form/back-href";
import { ReportPageShell } from "@/components/common/report-form/ReportPageShell";

import { ContentReportForm } from "@/features/content-report/components/ContentReportForm";
import type { ReportableGuide, ReportablePathway, ReportableSchool } from "@/features/content-report/schema/content-report";
import {
  GUIDE_REPORT_CATEGORY_OPTIONS,
  PATHWAY_REPORT_CATEGORY_OPTIONS,
  SCHOOL_REPORT_CATEGORY_OPTIONS,
} from "@/features/content-report/services/report-categories";
import type { ContentReportCategoryOption } from "@/features/content-report/services/report-categories";
import { CATEGORY_TYPES } from "@/features/support/constants/category-types";
import { SCHOOL_INFO_TAB } from "@/features/support/constants/results-tabs";
import type { ResultsTab } from "@/features/support/constants/results-tabs";
import { SCHOOL_LEVEL_LABELS } from "@/features/support/constants/school-labels";
import { parseLifestagePrefillParam } from "@/features/support/services/parse-lifestage-prefill";
import { fetchResultsGuideNote } from "@/features/support/services/results-guide-notes";
import { parseMunicipalityParam } from "@/features/support/schema/municipality-param";
import { getResultsTabGuide } from "@/features/support/services/results-tab-guides";
import { fetchSchoolById } from "@/features/support/services/school-info";
import { fetchSupportPathwayById } from "@/features/support/services/support-pathway";
import { getDb } from "@/lib/db";
import { safeErrorKind } from "@/lib/errors/safe-error-kind";

export const metadata: Metadata = {
  title: "内容の誤りを報告する | Trait Compass",
  robots: { index: false, follow: false },
};

interface ContentReportPageProps {
  searchParams: Promise<{
    targetType?: string | string[];
    targetId?: string | string[];
    municipality?: string | string[];
    tab?: string | string[];
    lifestage?: string | string[];
    back?: string | string[];
  }>;
}

const RESULTS_TAB_SET: ReadonlySet<string> = new Set([...CATEGORY_TYPES, SCHOOL_INFO_TAB]);

// `back` クエリの検証(オープンリダイレクト対策)は `facility-report/page.tsx` と完全に
// 同一のロジックだったため、Phase 2 「2-10 ReportFormParts」で
// `src/components/common/report-form/back-href.ts` へ共通化した(feature間依存を避けつつ、
// もはやローカル複製する理由が無いため方針転換)。

function parseResultsTabValue(raw: string | string[] | undefined): ResultsTab | null {
  const value = firstValue(raw);
  if (value === undefined || !RESULTS_TAB_SET.has(value)) return null;
  return value as ResultsTab;
}

interface ResolvedTarget {
  targetHeading: string;
  targetContext: string;
  categoryOptions: ContentReportCategoryOption<string>[];
  /**
   * `/api/content-report` へ送るリクエストボディのうち、対象を特定する部分(targetType +
   * targetId、または targetType + municipality/tab/lifestage)。フォーム入力欄の値と
   * マージして送信する(ContentReportForm.tsx 側)。サーバーコンポーネントからクライアント
   * コンポーネントへは関数を渡せない(シリアライズ不可)ため、プレーンなオブジェクトにする。
   */
  targetPayload: Record<string, unknown>;
}

/**
 * 掲載情報の訂正・更新報告ページ(`/support/content-report`)。
 *
 * `facility-report/page.tsx`(TICKET-0064)の対象を想定ルート・学校情報・結果の見方ガイドへ
 * 拡張したもの。`targetType` ごとに D1/ソースコードから対象を直接再取得し(クエリで受け取った
 * 値をそのまま信用しない)、見つからない場合は空状態を表示してフォームは描画しない。
 *
 * `back` クエリ(未指定時は `/support` にフォールバック)は「戻る」の遷移先候補の1つに過ぎない。
 * `SmartBackLink`/`SmartBackLinkButton` はブラウザ履歴があれば `history.back()` を優先し、
 * URL に検索条件を含む値を埋め込む必要が無いようにしている(P0対応。以前は各カードコンポーネントが
 * 遷移元(検索結果ページ)の URL(path+query、年齢・区市町村・相談分野タグ等の検索条件を含む)を
 * そのまま `back` に埋め込んでおり、報告ページの URL にも検索条件が二重に残っていた)。
 * `resolveBackHref` によるオープンリダイレクト対策(同一オリジンの相対パスのみ許可)は
 * 引き続き維持する。
 */
export default async function ContentReportPage({ searchParams }: ContentReportPageProps) {
  const raw = await searchParams;
  const targetType = firstValue(raw.targetType);
  const backHref = resolveBackHref(raw.back);

  let resolved: ResolvedTarget | null = null;

  // facility-report/page.tsx と同じく、明らかに不完全なクエリ(targetType 欠損・不正、
  // 対象種別に応じた必須パラメータ欠損)では D1 に触れずに空状態へフォールバックする。
  const targetId = firstValue(raw.targetId);
  const municipalityEntry = parseMunicipalityParam(raw.municipality);
  const municipality = municipalityEntry?.name ?? null;
  const tab = parseResultsTabValue(raw.tab);

  try {
    if (targetType === "pathway" && targetId) {
      const db = getDb();
      const pathway = await fetchSupportPathwayById(db, targetId);
      if (pathway !== null) {
        const reportable: ReportablePathway = { id: pathway.id, purposeLabel: pathway.purposeLabel, municipality: pathway.municipality };
        resolved = {
          targetHeading: reportable.purposeLabel,
          targetContext: `${reportable.municipality} ／ 想定ルート（${reportable.purposeLabel}）`,
          categoryOptions: PATHWAY_REPORT_CATEGORY_OPTIONS,
          targetPayload: { targetType: "pathway", targetId: pathway.id },
        };
      }
    } else if (targetType === "school" && targetId) {
      const db = getDb();
      const school = await fetchSchoolById(db, targetId);
      if (school !== null) {
        const reportable: ReportableSchool = {
          id: school.id,
          name: school.name,
          municipality: school.municipality,
          level: SCHOOL_LEVEL_LABELS[school.level],
        };
        resolved = {
          targetHeading: reportable.name,
          targetContext: `${reportable.municipality} ／ ${reportable.level}`,
          categoryOptions: SCHOOL_REPORT_CATEGORY_OPTIONS,
          targetPayload: { targetType: "school", targetId: school.id },
        };
      }
    } else if (targetType === "guide" && municipality && tab) {
      const db = getDb();
      const lifestage = parseLifestagePrefillParam(raw.lifestage);
      const note = await fetchResultsGuideNote(db, { municipality, tab });
      const genericGuide = getResultsTabGuide(tab, lifestage);

      if (note !== null || genericGuide !== null) {
        const heading = genericGuide?.heading ?? tab;
        const reportable: ReportableGuide = { municipality, tab, lifestage, heading };
        resolved = {
          targetHeading: reportable.heading,
          targetContext: `${reportable.municipality} ／ 結果の見方・解説（${reportable.tab}）`,
          categoryOptions: GUIDE_REPORT_CATEGORY_OPTIONS,
          targetPayload: { targetType: "guide", municipality, tab, lifestage },
        };
      }
    }
  } catch (error) {
    // セキュリティレビュー指摘: message・stack(D1の内部詳細を含み得る)は運用ログに
    // 渡さず、例外の種別のみに絞る(support/results/page.tsx と同じ方針)。
    console.error("[support/content-report] 報告対象の取得に失敗しました。", safeErrorKind(error));
    resolved = null;
  }

  if (resolved === null) {
    return (
      <FullPageFallback
        title="報告対象の掲載情報が見つかりませんでした。"
        description="掲載データが更新され、対象が変更・削除された可能性があります。"
        action={
          <SmartBackLinkButton fallbackHref={backHref} className="w-full max-w-xs">
            前の画面に戻る
          </SmartBackLinkButton>
        }
      />
    );
  }

  const { targetHeading, targetContext, categoryOptions, targetPayload } = resolved;

  return (
    <ReportPageShell backHref={backHref} targetHeading={targetHeading} targetContext={targetContext}>
      <ContentReportForm
        targetType={targetType as "pathway" | "school" | "guide"}
        targetContext={targetContext}
        categoryOptions={categoryOptions}
        backHref={backHref}
        targetPayload={targetPayload}
      />
    </ReportPageShell>
  );
}
