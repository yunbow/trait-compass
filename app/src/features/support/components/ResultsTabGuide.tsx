"use client";

import { useState, useSyncExternalStore } from "react";
import { Flag } from "lucide-react";

import { isGuideExplanationsEnabled, subscribeToSettings } from "@/features/history/services/settings";
import { AuxActionLink } from "@/features/support/components/CardAuxActions";
import { getResultsTabGuide } from "@/features/support/services/results-tab-guides";
import type { ResultsGuideNoteData } from "@/features/support/services/results-guide-notes";
import { dedupeSources } from "@/features/support/services/dedupe-sources";
import type { ResultsTab } from "@/features/support/constants/results-tabs";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import { buildContentReportGuideHref } from "@/features/support/services/results-url";

interface ResultsTabGuideProps {
  activeTab: ResultsTab;
  municipalityNote: ResultsGuideNoteData | null;
  lifestage?: Lifestage | null;
  /** 掲載情報の訂正・更新報告(content-report)の対象特定に使う区市町村の5桁コード。 */
  municipalityCode: string;
}

/**
 * 支援検索結果画面のタブ直下に表示する「1分でわかるガイド」。
 * ライフステージ(preschool/elementary-junior-high/high-school/university-vocational/
 * working-adult)ごとに登録タブが異なり、`getResultsTabGuide`が`null`を返す組み合わせでは
 * 何も描画しない。
 * `municipalityNote`(D1の`results_guide_notes`由来、`support/results/page.tsx`で取得)が
 * ある場合は、汎用本文の後ろに自治体固有の補足本文・出典を追加で表示する。ただし、
 * D1の`results_guide_notes`に登録されている自治体固有補足は現時点で児童発達支援・
 * 放課後等デイサービスという子ども向けサービスの内容のみのため、成人ライフステージ
 * (university-vocational・working-adult)では文脈が合わず`municipalityNote`を描画しない
 * (将来的に`results_guide_notes`へlifestage列を追加すれば解消できる暫定対応)。
 * 出典・訂正導線は常時表示し、制度本文だけを details で展開する。表示設定と一時的な閉じる操作を
 * 扱うため、クライアントコンポーネントとして実装する。
 */
export function ResultsTabGuide({ activeTab, municipalityNote, lifestage, municipalityCode }: ResultsTabGuideProps) {
  const guide = getResultsTabGuide(activeTab, lifestage ?? null);
  const explanationsEnabled = useSyncExternalStore(subscribeToSettings, isGuideExplanationsEnabled, () => true);
  const [isDismissed, setIsDismissed] = useState(false);
  if (!guide || !explanationsEnabled || isDismissed) return null;

  const isAdultLifestage = lifestage === "university-vocational" || lifestage === "working-adult";
  const effectiveMunicipalityNote = isAdultLifestage ? null : municipalityNote;
  // 「戻る」の遷移先は SmartBackLink(content-report/page.tsx)がブラウザ履歴から解決するため、
  // ここで検索結果ページの現在のURL(検索条件を含む)を back クエリへ埋め込む必要は無い
  // (P0対応: 検索条件の二重露出を避ける)。
  const reportHref = buildContentReportGuideHref({ municipalityCode, tab: activeTab, lifestage });
  const sources = dedupeSources([...guide.sources, ...(effectiveMunicipalityNote?.sources ?? [])]);

  return (
    <section aria-labelledby="results-tab-guide-heading" className="rounded-lg border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-primary">結果の見方・解説</p>
          <h3 id="results-tab-guide-heading" className="text-base font-semibold text-foreground">{guide.heading}</h3>
          <p className="text-sm text-muted-foreground">まずは、状況に合う相談先と次の一歩を確認しましょう。</p>
        </div>
        <button
          type="button"
          aria-label={`「${guide.heading}」の解説を閉じる`}
          onClick={() => setIsDismissed(true)}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span aria-hidden="true" className="text-lg leading-none">×</span>
        </button>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-3">
        {guide.keyPoints.map((point) => (
          <div key={point.label} className="rounded-md border border-border/80 bg-background/80 p-3">
            <dt className="text-xs font-medium text-primary">{point.label}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-foreground">{point.value}</dd>
          </div>
        ))}
      </dl>

      <details className="mt-4 border-t border-border/70 pt-3">
        <summary className="cursor-pointer text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          制度の説明を詳しく読む
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-sm text-foreground">
        {guide.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {effectiveMunicipalityNote && effectiveMunicipalityNote.body.map((paragraph) => (
          <p key={paragraph} className="text-foreground">
            {paragraph}
          </p>
        ))}
        </div>
      </details>
      <div className="mt-4 border-t border-border/70 pt-3">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {sources.map((source) => (
            <p key={source.label}>
              出典:{" "}
              {source.url ? (
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {source.label}
                </a>
              ) : (
                source.label
              )}
              (確認日: {source.confirmedOn})
            </p>
          ))}
        </div>
        <div role="group" aria-label={`${guide.heading}の補助操作`} className="mt-3 grid grid-cols-1 gap-1">
          <AuxActionLink href={reportHref} ariaLabel={`${guide.heading}の解説の訂正・更新を報告`} icon={<Flag aria-hidden="true" className="size-3.5" />}>訂正・更新</AuxActionLink>
        </div>
      </div>
    </section>
  );
}
