"use client";

import { Check, Copy, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProvenanceLabel } from "@/components/common/ProvenanceLabel";
import { useMemoPrintCopy } from "@/lib/print/use-memo-print-copy";

interface SummaryMemoProps {
  summary: string;
}

/**
 * 「自由記述をAIで整理してメモを作る」モードの結果表示 + 印刷/コピー操作。
 *
 * 選択式モードの `PrepareMemo`(`features/prepare/components/PrepareMemo.tsx`)と同じ
 * 印刷/コピー機構を、単一の要約文字列向けに軽量化したもの。印刷は `PRINT_MODE_ATTRIBUTE`
 * (`@/components/common/printMemoMode`)を `<html>` に付与してから `window.print()` を呼び、
 * globals.css の `[data-prepare-memo-print]` 配下のみを表示する印刷スタイルシートを
 * `PrepareMemo` と共有する(画面上に同時に存在しうるのは常にどちらか一方のみのため安全)。
 * `afterprint` イベント(印刷ダイアログのキャンセルも含めて発火する)で属性を確実に除去する。
 *
 * コピーは要約文字列(単一の文字列)をそのまま Clipboard API で書き出す
 * (`PrepareMemo` の `buildPrepareMemoText` のような複数セクションの整形は不要)。
 *
 * 危機介入の定型文(`isCrisisResponse: true`)は呼び出し側(`AiSummarySection`)が
 * このコンポーネントへのパス自体を通さない(ラベル付き「メモ」として装飾しない)。
 */
export function SummaryMemo({ summary }: SummaryMemoProps) {
  const { copyState, handlePrint, handleCopy } = useMemoPrintCopy({ getCopyText: () => summary });

  return (
    <div className="flex flex-col gap-3">
      <div data-prepare-memo-print className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm">
        <ProvenanceLabel source="ai" />
        <p className="whitespace-pre-wrap text-foreground">{summary}</p>
      </div>

      <div className="flex flex-col gap-2 print:hidden">
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleCopy}>
          {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copyState === "copied" ? "コピーしました" : "コピーする"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handlePrint}>
          <Printer aria-hidden="true" />
          印刷する
        </Button>
      </div>
      {copyState === "error" && (
        <p className="text-xs text-destructive print:hidden">コピーに失敗しました。お使いのブラウザの設定をご確認ください。</p>
      )}
    </div>
  );
}
