import type { Metadata } from "next";
import type { D1Database } from "@cloudflare/workers-types";

import { resolveBackHref } from "@/components/common/report-form/back-href";
import { aggregateCoverageByMunicipality, fetchFacilityCoverageRows } from "@/features/coverage/services/aggregate-coverage";
import {
  buildDataSourceList,
  fetchDatasetCategoryCounts,
  fetchDatasetRows,
  fetchGrantedMunicipalityCodes,
} from "@/features/data-sources/services/list-data-sources";
import { OutcomesFallback } from "@/features/outcomes/components/OutcomesFallback";
import { OutcomesView } from "@/features/outcomes/components/OutcomesView";
import {
  aggregateBridgeSummary,
  aggregateKpiSummary,
  aggregateUnclearReasonBreakdown,
  buildImprovementSummary,
  combineReportCounts,
  fetchBridgeUsageRows,
  fetchContentReportCounts,
  fetchFacilityReportCounts,
  fetchFeedbackRatingRows,
  fetchPublishedFeedbackComments,
  fetchUnclearReasonRows,
  selectPublishedComments,
} from "@/features/outcomes/services/aggregate-outcomes";
import type {
  BridgeSummary,
  ImprovementSummary,
  KpiSummary,
  PublishedComment,
  UnclearReasonSummary,
} from "@/features/outcomes/services/aggregate-outcomes";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "Trait Compass の成果 | Trait Compass",
  description:
    "実際の利用データから、支援情報がどれだけ「次の行動」につながっているかを公開しています。",
};

interface OutcomesPageProps {
  searchParams: Promise<{ back?: string | string[] }>;
}

// このページは実データ(feedback_rating_counts 等)の集計を表示する趣旨のページであり、
// `next build` 時点では D1 バインディングが無く getDb() が throw するため、ビルド時に
// フォールバックの HTML がそのまま静的化されてしまう(data-sources/page.tsx・coverage/page.tsx
// と同じ理由)。本番でも最新の集計結果を毎リクエスト反映させたいため、動的レンダリングを強制する。
export const dynamic = "force-dynamic";

interface OutcomesData {
  kpi: KpiSummary;
  unclearBreakdown: UnclearReasonSummary[];
  bridge: BridgeSummary;
  comments: PublishedComment[];
  improvement: ImprovementSummary;
}

/**
 * D1 からの取得処理をまとめて行う(page.tsx の try/catch から JSX を追い出すため、データ取得
 * だけを行う関数として切り出す。React はレンダー内で throw された例外を try/catch では
 * 捕捉できないため、JSX の構築は必ずこの関数の外側で行う。data-sources/page.tsx の
 * loadDataSourcesData と同じパターン)。
 *
 * 「改善と広がり」の対応自治体数・登録データ数・掲載データセット数は、既存の
 * /coverage(aggregate-coverage.ts)・/data-sources(list-data-sources.ts)の集計をそのまま
 * 再利用する(Source of Truth を分岐させないため)。
 */
async function loadOutcomesData(db: D1Database): Promise<OutcomesData> {
  const [
    ratingRows,
    unclearReasonRows,
    bridgeRows,
    rawComments,
    facilityCoverageRows,
    datasetRows,
    datasetCategoryCounts,
    grantedMunicipalityCodes,
    facilityReportCounts,
    contentReportCounts,
  ] = await Promise.all([
    fetchFeedbackRatingRows(db),
    fetchUnclearReasonRows(db),
    fetchBridgeUsageRows(db),
    fetchPublishedFeedbackComments(db, 5),
    fetchFacilityCoverageRows(db),
    fetchDatasetRows(db),
    fetchDatasetCategoryCounts(db),
    fetchGrantedMunicipalityCodes(db),
    fetchFacilityReportCounts(db),
    fetchContentReportCounts(db),
  ]);

  const coverage = aggregateCoverageByMunicipality(facilityCoverageRows);
  const datasetList = buildDataSourceList(datasetRows, datasetCategoryCounts, grantedMunicipalityCodes);
  const reportCounts = combineReportCounts(facilityReportCounts, contentReportCounts);

  return {
    kpi: aggregateKpiSummary(ratingRows),
    unclearBreakdown: aggregateUnclearReasonBreakdown(unclearReasonRows),
    bridge: aggregateBridgeSummary(bridgeRows),
    comments: selectPublishedComments(rawComments, 5),
    improvement: buildImprovementSummary({
      coverageSummary: coverage.summary,
      datasetsCount: datasetList.length,
      reportCounts,
    }),
  };
}

/**
 * 「Trait Compass の成果」ページ(社会的インパクトの実データ公開)。
 *
 * 最重要原則: 実データの裏付けが無い数値は絶対に表示しない。回答0件の時点でデプロイされても
 * 捏造にならないよう、KPI(次の行動の手がかり)・利用者の声はそれぞれ0件を誠実に表す空状態を
 * 持つ(OutcomesView 側の分岐、aggregate-outcomes.ts の JSDoc参照)。
 *
 * D1 バインディングが無い環境では OutcomesFallback(準備中表示)を返す graceful degradation と
 * する(data-sources/page.tsx・coverage/page.tsx と同じ方針、ページ全体をフォールバックにする)。
 */
export default async function OutcomesPage({ searchParams }: OutcomesPageProps) {
  const { back } = await searchParams;
  const backHref = resolveBackHref(back, "/about");

  let data: OutcomesData | null = null;
  try {
    const db = getDb();
    data = await loadOutcomesData(db);
  } catch {
    data = null;
  }

  if (!data) {
    return <OutcomesFallback />;
  }

  return (
    <OutcomesView
      backHref={backHref}
      kpi={data.kpi}
      unclearBreakdown={data.unclearBreakdown}
      bridge={data.bridge}
      comments={data.comments}
      improvement={data.improvement}
    />
  );
}
