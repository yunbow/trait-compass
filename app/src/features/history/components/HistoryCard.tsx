"use client";

import { ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { HistoryEntry } from "@/features/history/services/history-store";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { getTopCategories } from "@/features/survey/services/scoring";

const SAVED_AT_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * `HistoryEntry.savedAt`(ISO 8601)を一覧・詳細表示共通の日本語表記に整形する。
 * 不正な値の場合は元の文字列をそのまま返す(表示が壊れないことを優先し、例外は投げない)。
 */
export function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) {
    return savedAt;
  }
  return SAVED_AT_FORMATTER.format(date);
}

/** カード上の要約(上位2カテゴリ)。AC-1 の「上位カテゴリ名程度の要約」に対応する。 */
function summarizeTopCategories(entry: HistoryEntry): string {
  const top = getTopCategories(entry.categoryScores, 2);
  if (top.length === 0) {
    return "上位カテゴリなし";
  }
  return top.map(({ category }) => CATEGORY_LABELS[category]).join("・");
}

interface HistoryCardProps {
  entry: HistoryEntry;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * 履歴一覧の1件分のカード(TICKET-0026)。
 * - AC-1: 日付・上位カテゴリ名程度の要約を表示する。
 * - AC-2: 「記録を見る」を明示して表示専用モードへ切り替える。
 * - AC-3: 削除は明示ボタンでの確認を挟んでから `onDelete` を呼ぶ(誤タップ防止、NFR-37 の趣旨)。
 * - AC-6: 削除ボタンには対象を特定できる `aria-label` を付与する。
 */
export function HistoryCard({ entry, onSelect, onDelete }: HistoryCardProps) {
  const [confirming, setConfirming] = useState(false);
  const formattedDate = formatSavedAt(entry.savedAt);
  const summary = summarizeTopCategories(entry);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{formattedDate}の記録</span>
          <span className="text-sm text-muted-foreground">上位の傾向: {summary}</span>
        </div>

        {!confirming && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-label={`${formattedDate}の履歴を削除`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden="true" />
            削除
          </Button>
        )}
      </div>

      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => onSelect(entry.id)}>
        記録を見る
        <ChevronRight aria-hidden="true" />
      </Button>

      {confirming && (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm">
          <p className="text-foreground">{formattedDate}の記録を削除しますか?元に戻せません。</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirming(false);
                onDelete(entry.id);
              }}
            >
              削除する
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
