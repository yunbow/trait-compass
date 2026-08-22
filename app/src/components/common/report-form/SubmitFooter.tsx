"use client";

import { Button } from "@/components/ui/button";

interface ReportSubmitFooterProps {
  disabled: boolean;
  onClick: () => void;
}

/**
 * 掲載情報の訂正・更新報告フォーム共通の sticky 送信フッター。Phase 2 「2-10 ReportFormParts」。
 * `FacilityReportForm`/`ContentReportForm` で完全一致していた実装をそのまま部品化した。
 */
export function ReportSubmitFooter({ disabled, onClick }: ReportSubmitFooterProps) {
  return (
    <div className="sticky bottom-3 z-10 -mx-2 flex flex-col gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-sm sm:mx-0 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">報告内容への個別の返信は行いません。必要に応じて掲載情報を確認します。</p>
      <Button type="button" disabled={disabled} onClick={onClick}>
        入力内容を確認する
      </Button>
    </div>
  );
}
