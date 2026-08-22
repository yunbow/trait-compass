"use client";

import { Button } from "@/components/ui/button";

interface ReportErrorStepProps {
  isRateLimited: boolean;
  onRetry: () => void;
  onLeave: () => void;
}

/**
 * 掲載情報の訂正・更新報告フォーム共通の送信エラーステップ。Phase 2 「2-10 ReportFormParts」。
 * `FacilityReportForm`/`ContentReportForm` で完全一致していた実装をそのまま部品化した。
 */
export function ReportErrorStep({ isRateLimited, onRetry, onLeave }: ReportErrorStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground">送信できませんでした</h2>
      <p className="text-sm text-muted-foreground">
        {isRateLimited
          ? "短時間に多くの送信がありました。しばらく時間をおいてからお試しください。"
          : "送信できませんでした。通信状況をご確認のうえ、もう一度お試しください。"}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onRetry}>
          もう一度試す
        </Button>
        <Button type="button" onClick={onLeave}>
          検索結果に戻る
        </Button>
      </div>
    </div>
  );
}
