import type { Metadata } from "next";
import type { D1Database } from "@cloudflare/workers-types";

import { CoverageFallback } from "@/features/coverage/components/CoverageFallback";
import { CoverageOverview } from "@/features/coverage/components/CoverageOverview";
import {
  aggregateCoverageByMunicipality,
  fetchDatasetCredits,
  fetchFacilityCoverageRows,
  filterVisibleDatasetCredits,
} from "@/features/coverage/services/aggregate-coverage";
import type { CoverageDatasetCredit, CoverageResult } from "@/features/coverage/services/aggregate-coverage";
import { fetchGrantedMunicipalityCodes } from "@/lib/dataset-visibility";
import { getDb } from "@/lib/db";

interface CoveragePageData {
  coverage: CoverageResult;
  credits: CoverageDatasetCredit[];
}

export const metadata: Metadata = {
  title: "データカバレッジ | Trait Compass",
  description: "東京都の区市町村ごとに、支援窓口データの登録状況(件数・分類の分布)を可視化しています。",
};

// このページは searchParams を持たないため、Next はデフォルトで静的プリレンダーしようとする
// (`next build` 時点では D1 バインディングが無く getDb() が throw するため、ビルド時に
// 「準備中」フォールバックの HTML がそのまま静的化されてしまう)。本番でも D1 の最新の集計結果を
// 毎リクエスト反映させたいため、動的レンダリングを強制する。
export const dynamic = "force-dynamic";

/**
 * D1 からの集計処理をまとめて行う(page.tsx の try/catch から JSX を追い出すため、データ取得
 * だけを行う関数として切り出す。React はレンダー内で throw された例外を try/catch では
 * 捕捉できないため、JSX の構築は必ずこの関数の外側で行う。support/results/page.tsx の
 * loadResultsData と同じパターン)。
 */
async function loadCoverageData(db: D1Database): Promise<CoveragePageData> {
  const [rows, rawCredits, grantedMunicipalityCodes] = await Promise.all([
    fetchFacilityCoverageRows(db),
    fetchDatasetCredits(db),
    fetchGrantedMunicipalityCodes(db),
  ]);
  const datasetIdsWithFacilities = new Set(rows.map((row) => row.datasetId));
  return {
    coverage: aggregateCoverageByMunicipality(rows),
    credits: filterVisibleDatasetCredits(rawCredits, grantedMunicipalityCodes, datasetIdsWithFacilities),
  };
}

/**
 * データカバレッジ可視化ページ(TICKET-0029, FR-02B)。
 *
 * 東京都62区市町村に対する支援窓口データの充足状況(件数・4分類の分布)を
 * 集計・可視化する啓発・政策提言用のページ。当初はハッカソンデモ用に直接アクセスのみと
 * していたが(TICKET-0029)、データ透明性ページ /data-sources(TICKET-0065)からの導線を
 * 追加した。トップ画面のナビゲーションには引き続き含めない。
 *
 * D1 バインディングが無い環境では CoverageFallback(準備中表示)を返す graceful degradation
 * とする(support/results/page.tsx と同じ方針)。
 */
export default async function CoveragePage() {
  let data: CoveragePageData | null = null;
  try {
    const db = getDb();
    data = await loadCoverageData(db);
  } catch {
    data = null;
  }

  if (!data) {
    return <CoverageFallback />;
  }

  return <CoverageOverview coverage={data.coverage} credits={data.credits} />;
}
