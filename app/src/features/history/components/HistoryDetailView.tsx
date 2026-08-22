"use client";

import Link from "next/link";
import { MapPinned, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatSavedAt } from "@/features/history/components/HistoryCard";
import type { HistoryEntry } from "@/features/history/services/history-store";
import { ResultCharts } from "@/features/result/components/ResultCharts";
import { mapScoresToTags } from "@/features/support/services/category-tag-mapping";
import { buildSupportEntryHref } from "@/features/support/services/results-url";

interface HistoryDetailViewProps {
  entry: HistoryEntry;
  onBack: () => void;
}

/**
 * 履歴1件の表示専用モード(TICKET-0026 AC-2, AC-5)。
 * 結果画面(FR-018)の既存 `ResultCharts` を、スコアのみ(回答生値は保持していない)で
 * 再利用して同じ見た目で再描画する。保存・共有は行えない表示専用画面としつつ、
 * 保存時点の傾向を手がかりにした支援先検索と、現在の状態を確認する導線を提供する。
 */
export function HistoryDetailView({ entry, onBack }: HistoryDetailViewProps) {
  const supportTags = mapScoresToTags(entry.categoryScores);
  // 支援情報検索(TICKET-0014)へ相談分野タグを引き継ぐ(FR-023)。tagsクエリはASCII ID化
  // (受動的プライバシー対策、support-tag-url.ts 参照)。タグが1つも無い場合は「全般」扱いとし、
  // tags クエリを付けずに /support へ遷移する。
  const supportHref = buildSupportEntryHref(supportTags);

  return (
    <div className="flex flex-col gap-6">
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onBack}>
        一覧へ戻る
      </Button>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">保存時点の記録</p>
        <h1 className="text-xl font-bold text-foreground">{formatSavedAt(entry.savedAt)}の記録</h1>
        <p className="text-sm text-muted-foreground">保存済みの結果を表示専用で振り返っています。</p>
      </div>

      <ResultCharts
        categoryScores={entry.categoryScores}
        grayZoneMeta={{ grayZoneCount: entry.grayZoneCount }}
      />

      <section aria-labelledby="history-next-actions-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 id="history-next-actions-heading" className="text-base font-semibold text-foreground">次にできること</h2>
          <p className="mt-1 text-sm text-muted-foreground">この記録を手がかりに、相談先を探したり、今の状態を改めて確認できます。</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button render={<Link href={supportHref} />} nativeButton={false} variant="outline" size="lg" className="w-full sm:flex-1">
            <MapPinned aria-hidden="true" />
            地域の相談先を探す
          </Button>
          <Button render={<Link href="/survey" />} nativeButton={false} variant="outline" size="lg" className="w-full sm:flex-1">
            <RotateCcw aria-hidden="true" />
            今の状態を確認する
          </Button>
        </div>
      </section>
    </div>
  );
}
