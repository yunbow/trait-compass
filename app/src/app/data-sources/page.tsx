import type { Metadata } from "next";
import Link from "next/link";
import type { D1Database } from "@cloudflare/workers-types";

import { AnchorNav } from "@/components/common/AnchorNav";
import { ContentSection } from "@/components/common/ContentSection";
import { ExternalTextLink } from "@/components/common/ExternalTextLink";
import { InfoPageShell } from "@/components/common/InfoPageShell";
import { resolveBackHref } from "@/components/common/report-form/back-href";
import { DataSourceList } from "@/features/data-sources/components/DataSourceList";
import { DataSourcesFallback } from "@/features/data-sources/components/DataSourcesFallback";
import {
  buildDataSourceList,
  fetchDatasetCategoryCounts,
  fetchDatasetRows,
  fetchGrantedMunicipalityCodes,
} from "@/features/data-sources/services/list-data-sources";
import type { DataSourceListItem } from "@/features/data-sources/services/list-data-sources";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "利用しているデータ | Trait Compass",
  description:
    "このサービスが支援情報の表示に使用しているデータの一覧と、その用途・出典を公開しています。",
};

const DATA_SOURCES_NAV_ITEMS = [
  { href: "#data-purpose", label: "データの利用目的" },
  { href: "#data-kinds", label: "データの区分" },
  { href: "#data-list", label: "掲載データの一覧" },
  { href: "#data-coverage", label: "地域別のデータ充足状況" },
  { href: "#data-report", label: "情報の更新と訂正" },
] as const;

interface DataSourcesPageProps {
  searchParams: Promise<{ back?: string | string[] }>;
}

// このページは searchParams(back)を持つが、実データは D1 依存のためビルド時には
// 取得できない(coverage/page.tsx と同じ理由: `next build` 時点では D1 バインディングが無く
// getDb() が throw するため、ビルド時に「準備中」フォールバックの HTML がそのまま
// 静的化されてしまう)。本番でも D1 の最新の掲載データ一覧を毎リクエスト反映させたいため、
// 動的レンダリングを強制する。
export const dynamic = "force-dynamic";

/**
 * D1 からの取得処理をまとめて行う(page.tsx の try/catch から JSX を追い出すため、データ取得
 * だけを行う関数として切り出す。React はレンダー内で throw された例外を try/catch では
 * 捕捉できないため、JSX の構築は必ずこの関数の外側で行う。coverage/page.tsx の
 * loadCoverageData と同じパターン)。
 */
async function loadDataSourcesData(db: D1Database): Promise<DataSourceListItem[]> {
  const [datasets, categoryCounts, grantedMunicipalityCodes] = await Promise.all([
    fetchDatasetRows(db),
    fetchDatasetCategoryCounts(db),
    fetchGrantedMunicipalityCodes(db),
  ]);
  return buildDataSourceList(datasets, categoryCounts, grantedMunicipalityCodes);
}

/**
 * データ透明性ページ「利用しているデータ」(TICKET-0065)。
 *
 * このサービスが支援情報の表示に使用しているデータセットの一覧・出典・用途を公開し、
 * 「日常の困りごとチェックの結果の算出には使用していない」ことを明示する。/about の
 * データの出典セクションとフッター(SiteFooterNav)から導線を設け、本ページから
 * /coverage(区市町村別のデータ充足状況)への導線を持つ。
 *
 * D1 バインディングが無い環境では DataSourcesFallback(準備中表示)を返す graceful
 * degradation とする(coverage/page.tsx と同じ方針、ページ全体をフォールバックにする)。
 */
export default async function DataSourcesPage({ searchParams }: DataSourcesPageProps) {
  const { back } = await searchParams;
  const backHref = resolveBackHref(back, "/");

  let items: DataSourceListItem[] | null = null;
  try {
    const db = getDb();
    items = await loadDataSourcesData(db);
  } catch {
    items = null;
  }

  if (!items) {
    return <DataSourcesFallback />;
  }

  return (
    <InfoPageShell
      backHref={backHref}
      eyebrow="DATA SOURCES"
      title="利用しているデータ"
      lead="このサービスが支援情報の表示に使用しているデータの一覧と、その用途・出典を公開しています。"
    >
      <AnchorNav label="このページの目次" items={DATA_SOURCES_NAV_ITEMS} />

      <ContentSection anchorId="data-purpose" title="データの利用目的">
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          掲載している支援情報(相談窓口・支援制度・施設情報など)は、お住まいの地域に合った相談先や支援制度を探すために使用しています。
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          日常の困りごとチェックの結果の算出には使用していません。チェックの設問と結果の算出は本プロジェクトが独自に作成したものです。
        </p>
      </ContentSection>

      <ContentSection anchorId="data-kinds" title="データの区分">
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          掲載データは、次の3区分で収集しています。
        </p>
        <dl className="mt-2 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-foreground">オープンデータ</dt>
            <dd className="mt-0.5 text-muted-foreground">
              東京都・区市町村等が機械可読形式で公開しているデータです。
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">標準利用規約データ</dt>
            <dd className="mt-0.5 text-muted-foreground">
              政府標準利用規約や公共データ利用規約(PDL)など、あらかじめ定められた利用規約に基づき、個別の許諾を得ずに利用できるデータです。
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">個別許諾データ</dt>
            <dd className="mt-0.5 text-muted-foreground">
              自治体等へ個別に問い合わせ、許諾・事実確認を得たうえで独自に整理したデータです。
            </dd>
          </div>
        </dl>
      </ContentSection>

      <ContentSection anchorId="data-list" title="掲載データの一覧">
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          実際に取り込み、サービス内で使用しているデータのみを掲載しています。
        </p>
        <div className="mt-3">
          <DataSourceList items={items} />
        </div>
      </ContentSection>

      <ContentSection anchorId="data-coverage" title="地域別のデータ充足状況">
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          区市町村ごとのデータの充足状況(件数・分類のそろい具合)は、{" "}
          <Link
            href="/coverage"
            className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            地域別のデータ充足状況
          </Link>
          {" "}のページで公開しています。
        </p>
      </ContentSection>

      <ContentSection anchorId="data-report" title="情報の更新と訂正">
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          掲載している情報は、可能な範囲で出典と最終確認日(最終取得日)を表示しています。
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          誤りや更新に気づいた場合は、各カードの「掲載情報の誤りを報告」からお知らせください。
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          その他のご意見は{" "}
          <ExternalTextLink href="https://github.com/yunbow/trait-compass/issues">GitHub Issues</ExternalTextLink>
          {" "}へお寄せください。
        </p>
      </ContentSection>
    </InfoPageShell>
  );
}
