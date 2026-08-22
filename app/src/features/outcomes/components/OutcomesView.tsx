import Link from "next/link";

import { AnchorNav } from "@/components/common/AnchorNav";
import { ContentSection } from "@/components/common/ContentSection";
import { InfoPageShell } from "@/components/common/InfoPageShell";
import { FEEDBACK_UNCLEAR_REASON_OPTIONS } from "@/features/feedback/constants/feedback-options";
import type {
  BridgeSummary,
  ImprovementSummary,
  KpiSummary,
  PublishedComment,
  UnclearReason,
  UnclearReasonSummary,
} from "@/features/outcomes/services/aggregate-outcomes";

interface OutcomesViewProps {
  backHref: string;
  kpi: KpiSummary;
  unclearBreakdown: UnclearReasonSummary[];
  bridge: BridgeSummary;
  comments: PublishedComment[];
  improvement: ImprovementSummary;
}

const OUTCOMES_NAV_ITEMS = [
  { href: "#outcomes-kpi", label: "次の行動の手がかり" },
  { href: "#outcomes-bridge", label: "支援情報への橋渡し" },
  { href: "#outcomes-voices", label: "利用者の声" },
  { href: "#outcomes-improvement", label: "サービスの改善と広がり" },
] as const;

/**
 * 「まだ分からない」の理由コードの表示ラベル。ウィジェット側(FEEDBACK_UNCLEAR_REASON_OPTIONS、
 * src/features/feedback/constants/feedback-options.ts)で利用者に実際に提示される選択肢文言と
 * 一致させる(成果ページ独自の言い換えラベルを持たない、Source of Truthの統一)。
 */
const UNCLEAR_REASON_LABEL: Record<UnclearReason, string> = Object.fromEntries(
  FEEDBACK_UNCLEAR_REASON_OPTIONS.map((option) => [option.value, option.label]),
) as Record<UnclearReason, string>;

/** "2026-08-19" のような日付文字列から "2026年8月" だけを取り出す(created_date の年月表示用)。 */
function formatYearMonth(dateText: string): string {
  const [year, month] = dateText.split("-");
  if (!year || !month) return dateText;
  return `${year}年${Number(month)}月`;
}

/**
 * 「Trait Compass の成果」画面の本体(社会的インパクトの実データ公開ページ)。
 * サーバーコンポーネント(app/outcomes/page.tsx)から集計済みデータを受け取って描画するだけの
 * プレゼンテーション部品にする(project-structure.md §7、CoverageOverview と同じ方針)。
 *
 * 最重要原則: 実データの裏付けが無い数値は表示しない。KPI(次の行動の手がかり)は回答数が
 * 0件の場合、割合(%)を一切描画せず「回答を収集中です」という誠実な空状態のみを表示する
 * (aggregateKpiSummary が totalResponses=0 のとき clearOrPartialPercentage を null で
 * 返すため、この null をそのまま「%非表示」の判定に使う)。
 */
export function OutcomesView({ backHref, kpi, unclearBreakdown, bridge, comments, improvement }: OutcomesViewProps) {
  return (
    <InfoPageShell
      backHref={backHref}
      eyebrow="OUTCOMES"
      title="Trait Compass の成果"
      lead="実際の利用データをもとに、Trait Compass がどれだけ「次にすべきこと」を見つける手がかりになっているかを公開しています。"
      heroExtra={
        <p className="mt-4 text-xs text-muted-foreground">
          回答は日付と選択肢のみを集計し、氏名・IPアドレスなど個人を特定できる情報は保存しません。
        </p>
      }
    >
      <AnchorNav label="このページの目次" items={OUTCOMES_NAV_ITEMS} />

      <ContentSection anchorId="outcomes-kpi" title="次の行動の手がかり">
        {kpi.totalResponses > 0 && kpi.clearOrPartialPercentage !== null ? (
          <>
            <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{kpi.clearOrPartialPercentage}%</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              「次に何をすればよいか分かりましたか？」に「分かった」「少し分かった」と回答した割合です。回答数 {kpi.totalResponses}
              件(集計期間: {kpi.earliestDate} から現在まで)。
            </p>
            {unclearBreakdown.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">「まだ分からない」と回答した方の理由(任意回答)</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {unclearBreakdown.map((item) => (
                    <li
                      key={item.reason}
                      className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {UNCLEAR_REASON_LABEL[item.reason]} {item.count}件
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            回答を収集中です。
            <Link
              href="/support"
              className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              支援情報のページ
            </Link>
            でご協力ください。
          </p>
        )}
      </ContentSection>

      <ContentSection anchorId="outcomes-bridge" title="支援情報への橋渡し(補助指標)">
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">支援情報一覧の延べ到達数</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {bridge.supportResultsTotal}
              <span className="text-sm font-normal text-muted-foreground">件</span>
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">相談メモ画面の延べ到達数</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {bridge.resultPrepareTotal}
              <span className="text-sm font-normal text-muted-foreground">件</span>
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          延べ到達数(同じ方の複数回閲覧を含む)です。相談先の候補や相談メモ作成にたどり着いた回数の目安として掲載しています。
        </p>
      </ContentSection>

      <ContentSection anchorId="outcomes-voices" title="利用者の声">
        {comments.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm leading-6 text-foreground">{comment.commentText}</p>
                <p className="mt-2 text-xs text-muted-foreground">{formatYearMonth(comment.createdDate)}にいただいた声</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            掲載できる利用者の声はまだありません。お寄せいただいたコメントは、公開許可をいただいたもののみ、内容を確認したうえで掲載します。
          </p>
        )}
      </ContentSection>

      <ContentSection anchorId="outcomes-improvement" title="サービスの改善と広がり">
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">対応自治体数</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {improvement.municipalitiesWithData}
              <span className="text-sm font-normal text-muted-foreground"> / {improvement.totalMunicipalities} 区市町村</span>
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">登録データ数</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {improvement.totalFacilities}
              <span className="text-sm font-normal text-muted-foreground">件</span>
            </dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">相談窓口・支援制度・福祉ガイド等を含む(学校情報は含まない)</dd>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">掲載データセット数</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {improvement.datasetsCount}
              <span className="text-sm font-normal text-muted-foreground">件</span>
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">掲載情報の報告受付件数</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {improvement.reportsTotal}
              <span className="text-sm font-normal text-muted-foreground">件</span>
            </dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">うち確認・反映済み {improvement.reportsDone}件</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          「使う」「気づいたことを報告する」「情報を見直す」という循環を通じて、掲載情報の質を継続的に高めています。
        </p>
      </ContentSection>
    </InfoPageShell>
  );
}
