import { InfoPageShell } from "@/components/common/InfoPageShell";
import { SourceCredit } from "@/components/common/SourceCredit";
import type { CategoryType } from "@/features/support/constants/category-types";
import { formatSourceCredit } from "@/features/support/services/facility-display";
import {
  COVERAGE_CATEGORY_TYPES,
  COVERAGE_LEVELS,
  coverageLevel,
  type CoverageDatasetCredit,
  type CoverageLevel,
  type CoverageResult,
  type MunicipalityCoverage,
} from "@/features/coverage/services/aggregate-coverage";

interface CoverageOverviewProps {
  coverage: CoverageResult;
  credits: CoverageDatasetCredit[];
}

/** category_type(4分類)の短縮表示ラベル(テーブル幅を抑えるため)。フル名は title 属性で補う。 */
const CATEGORY_SHORT_LABEL: Record<CategoryType, string> = {
  相談窓口: "窓口",
  支援制度: "制度",
  福祉ガイド: "ガイド",
  発達障害支援資料: "資料",
};

/**
 * カバレッジレベル → バー表示のスタイル。色分けは既存テーマトークン(--foreground の不透明度)を
 * 使ったモノクロの連続(sequential)スケールにする(件数の多寡ではなく「3分類中いくつ揃っているか」
 * という単一の序列を表すため、複数の色相を使う分類=カテゴリカルな配色は用いない)。
 * 不透明度だけに頼らず、バーの隣に「n/3」の数値ラベルを必ず併記する(色だけに意味を持たせない)。
 */
const LEVEL_STYLE: Record<CoverageLevel, { barClassName: string; label: string }> = {
  none: { barClassName: "bg-transparent", label: "データなし" },
  low: { barClassName: "bg-foreground/33", label: "1分類のみ" },
  partial: { barClassName: "bg-foreground/66", label: "2分類充足" },
  full: { barClassName: "bg-foreground", label: "3分類すべて充足" },
};

function CoverageBar({ row, maxCount }: { row: MunicipalityCoverage; maxCount: number }) {
  const level = coverageLevel(row);
  const style = LEVEL_STYLE[level];
  const widthPercent = maxCount > 0 ? Math.max(row.count > 0 ? 6 : 0, (row.count / maxCount) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-3 w-24 overflow-hidden rounded-full bg-muted sm:w-32" aria-hidden="true">
        <div className={`h-full rounded-full ${style.barClassName}`} style={{ width: `${widthPercent}%` }} />
      </div>
      <span className="tabular-nums text-foreground">{row.count}件</span>
    </div>
  );
}

/**
 * 分類充足チップ(3分類、発達障害支援資料を除く)+ 自治体独自データの内訳(1件以上ある場合のみ)を
 * 1行(flex-wrap)で表示する。従来は発達障害支援資料を含む4分類を表示していたが、同分類はD1全体で
 * 登録がごく少数(2026-08時点)で分類充足の判定に使えないため非表示にし(COVERAGE_CATEGORY_TYPES参照)、
 * 空いたスペースに元々CoverageBar側にあった内訳をここへ移設した(2026-08是正)。
 * 独自データが0件の自治体では「共通データのみ」であることは自明で内訳を示す価値が薄いため、
 * 独自データが1件以上ある場合のみ「{合計}件中独自データ{件数}件」を同じ行の末尾に添える(2026-08是正)。
 */
function CategoryChips({ row }: { row: MunicipalityCoverage }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="tabular-nums text-xs text-muted-foreground">{row.categoryTypesCovered}/{COVERAGE_CATEGORY_TYPES.length}</span>
      <ul className="flex flex-wrap gap-1">
        {COVERAGE_CATEGORY_TYPES.map((type) => {
          const count = row.categoryCounts[type];
          const covered = count > 0;
          return (
            <li key={type}>
              <span
                title={`${type}: ${count}件`}
                className={
                  covered
                    ? "inline-block rounded-full border border-foreground bg-foreground/80 px-1.5 py-0.5 text-[10px] text-background"
                    : "inline-block rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                }
              >
                {CATEGORY_SHORT_LABEL[type]}
              </span>
            </li>
          );
        })}
      </ul>
      {row.municipalityOnlyDataCount > 0 && (
        <span className="text-[11px] text-muted-foreground">
          {row.count}件中独自データ{row.municipalityOnlyDataCount}件
        </span>
      )}
    </div>
  );
}

/**
 * データカバレッジ可視化画面の本体(TICKET-0029, FR-02B)。
 * サーバーコンポーネント(page.tsx)から集計済みデータを受け取って描画するだけの
 * プレゼンテーション部品にする(project-structure.md §7: page.tsx はデータパススルーのみ)。
 *
 * 62区市町村すべてを表示し(coverage.rows は常に62件)、データが無い区市町村も
 * count=0 の行として明示することで「一部の区市町村しかデータが無い」という分断状況を
 * そのまま見せる(AC-1, AC-2)。
 *
 * 画面枠は /about・/data-sources 等と同じ `InfoPageShell`(戻る導線+eyebrow/title/lead の
 * ヒーロー見出し)に統一する(TICKET-0065 追補)。fallbackHref は、このページの唯一の
 * 導線元である `/data-sources` に固定する(coverage/page.tsx の JSDoc参照: トップ画面ナビには
 * 含めず `/data-sources` からのリンクのみで到達させる方針のため)。
 */
export function CoverageOverview({ coverage, credits }: CoverageOverviewProps) {
  const { rows, summary } = coverage;
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return (
    <InfoPageShell
      backHref="/data-sources"
      eyebrow="DATA COVERAGE"
      title="区市町村データカバレッジ可視化"
      lead="東京都の区市町村ごとに、支援窓口データの登録状況(件数・分類の分布)を可視化しています。件数は「その区市町村に施設がいくつあるか」ではなく、Trait Compassに取り込んだデータの件数です。"
      heroExtra={
        <p className="mt-4 inline-block w-fit rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          実験的機能・ハッカソンデモ用ページ
        </p>
      }
      className="max-w-4xl gap-8"
    >
      <section aria-labelledby="coverage-summary-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-4">
        <h2 id="coverage-summary-heading" className="text-sm font-semibold text-foreground">
          サマリー
        </h2>
        <p className="text-xs text-muted-foreground">
          区市町村データ充足状況(相談窓口/支援制度/福祉ガイドの3分類。発達障害支援資料は登録データがごく少数のため分類充足の対象外)
        </p>
        <dl className="flex flex-col gap-1.5">
          {COVERAGE_LEVELS.map((level) => (
            <div key={level} className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-foreground">{LEVEL_STYLE[level].label}</dt>
              <dd className="tabular-nums text-foreground">
                {summary.levelCounts[level]} <span className="text-muted-foreground">/ {summary.totalMunicipalities}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="coverage-table-heading" className="flex flex-col gap-3">
        <h2 id="coverage-table-heading" className="text-sm font-semibold text-foreground">
          区市町村別カバレッジ一覧
        </h2>
        <p className="text-xs text-muted-foreground">
          「登録データ数」には、複数の区市町村にまたがる共通データ(東京都オープンデータカタログ・WAM
          NET等)と、一部の自治体だけが独自に追加投入したオープンデータの両方が含まれます。自治体独自データを多く持つ区市町村ほど登録データ数が多く出ますが、これは実際の施設数が多いことを意味しません。区市町村間で公平に比較する場合は、共通データの分布(分類充足)を参考にしてください。
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">
              東京都{summary.totalMunicipalities}区市町村ごとの、取込済み相談窓口データの登録データ数・
              3分類(相談窓口/支援制度/福祉ガイド)の充足状況(共通データ・自治体独自データの内訳を備考として含む)の一覧。
            </caption>
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th scope="col" className="px-3 py-2 font-medium text-foreground">
                  区市町村
                </th>
                <th scope="col" className="px-3 py-2 font-medium text-foreground">
                  登録データ数
                </th>
                <th scope="col" className="px-3 py-2 font-medium text-foreground">
                  分類充足(相談窓口/支援制度/福祉ガイド)・備考
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.municipality} className="border-b border-border last:border-b-0 odd:bg-transparent even:bg-muted/20">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 font-normal text-foreground">
                    {row.municipality}
                  </th>
                  <td className="px-3 py-2">
                    <CoverageBar row={row} maxCount={maxCount} />
                  </td>
                  <td className="px-3 py-2">
                    <CategoryChips row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {credits.length > 0 && (
        <section aria-labelledby="coverage-credit-heading" className="flex flex-col gap-2">
          <h2 id="coverage-credit-heading" className="text-sm font-semibold text-foreground">
            出典
          </h2>
          {credits.map((credit) => (
            <SourceCredit
              key={`${credit.datasetTitle}-${credit.sourceOrg}`}
              credit={formatSourceCredit(credit)}
              sourceUrl={credit.sourceUrl}
            />
          ))}
        </section>
      )}
    </InfoPageShell>
  );
}
