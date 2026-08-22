"use client";

import { useState, useSyncExternalStore } from "react";
import { Flag } from "lucide-react";

import { isGuideExplanationsEnabled, subscribeToSettings } from "@/features/history/services/settings";
import { AuxActionLink, SourceList } from "@/features/support/components/CardAuxActions";
import { findPathwayTerms } from "@/features/support/services/pathway-term-glossary";
import type { SupportPathwayData } from "@/features/support/services/support-pathway";

interface SupportPathwaySectionProps {
  data: SupportPathwayData;
}

/**
 * 想定ルート表示(D1: support_pathways / support_pathway_steps)。
 * ステップを縦の番号付きリストとして表示し、末尾に出典全件と訂正・更新の補助操作を添える。
 * `status` が `confirmed` 以外の場合は見出し付近に注記を表示する(一部未確認情報を含む旨)。
 * 各ステップの title/note に用語集(`pathway-term-glossary`)登録済みの語が含まれる場合、
 * 初出のステップにのみ、画面上部の用語解説を添える。
 *
 * 出典は自治体の二次利用許諾条件対応として展開操作なしで全件常時表示し、掲載情報の訂正・
 * 更新報告(content-report)へのリンクをその下に添える。AskAiPanel(質問する)はこの
 * セクションではスコープ外とする。
 */
export function SupportPathwaySection({ data }: SupportPathwaySectionProps) {
  const termMatches = findPathwayTerms(data.steps);
  const explanationsEnabled = useSyncExternalStore(subscribeToSettings, isGuideExplanationsEnabled, () => true);
  const [isTermGuideDismissed, setIsTermGuideDismissed] = useState(false);
  // 「戻る」の遷移先は SmartBackLink(content-report/page.tsx)がブラウザ履歴から解決するため、
  // ここで検索結果ページの現在のURL(検索条件を含む)を back クエリへ埋め込む必要は無い
  // (P0対応: 検索条件の二重露出を避ける)。
  const reportHref = `/support/content-report?targetType=pathway&targetId=${encodeURIComponent(data.id)}`;

  return (
    <section aria-labelledby="support-pathway-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 id="support-pathway-heading" className="text-base font-semibold text-foreground">
          想定ルート
          <span className="ml-2 text-sm font-normal text-muted-foreground">{data.purposeLabel}</span>
        </h2>
        {data.status !== "confirmed" && (
          <p className="text-xs text-muted-foreground">一部未確認の情報を含みます。最新情報は各窓口にご確認ください。</p>
        )}
      </div>

      {explanationsEnabled && !isTermGuideDismissed && termMatches.length > 0 && (
        <aside aria-label="手続きの用語のポイント" className="rounded-md border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-primary">手続きの用語のポイント</p>
              <div className="mt-1 flex flex-col gap-1">
                {termMatches.map((match) => (
                  <p key={match.term} className="text-sm text-foreground">
                    <span className="font-semibold">{match.term}</span>：{match.description}
                  </p>
                ))}
              </div>
            </div>
            <button
              type="button"
              aria-label="手続きの用語のポイントを閉じる"
              onClick={() => setIsTermGuideDismissed(true)}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span aria-hidden="true" className="text-lg leading-none">×</span>
            </button>
          </div>
        </aside>
      )}

      <ol className="flex flex-col gap-4">
        {data.steps.map((step) => {
          const termMatch = termMatches.find((match) => match.order === step.order);
          return (
            <li key={step.order} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {step.order}
              </span>
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-foreground">{step.title}</p>
                  {step.isConditional && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">必要に応じて</span>
                  )}
                </div>
                {step.actor && <p className="text-muted-foreground">{step.actor}</p>}
                {step.contact && (
                  <a href={`tel:${step.contact.replace(/[^\d+]/g, "")}`} className="w-fit text-primary underline underline-offset-2">
                    {step.contact}
                  </a>
                )}
                {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
                {explanationsEnabled && !isTermGuideDismissed && termMatch && <p className="text-xs text-muted-foreground">この用語の説明は、上の「手続きの用語のポイント」で確認できます。</p>}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-border pt-3">
        <SourceList sources={data.sources} />
        <div role="group" aria-label={`想定ルート（${data.purposeLabel}）の補助操作`} className="mt-3 grid grid-cols-1 gap-1">
          <AuxActionLink href={reportHref} ariaLabel={`想定ルート（${data.purposeLabel}）の掲載情報の訂正・更新を報告`} icon={<Flag aria-hidden="true" className="size-3.5" />}>訂正・更新</AuxActionLink>
        </div>
      </div>
    </section>
  );
}
