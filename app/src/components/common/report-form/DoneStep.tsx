"use client";

import { Button } from "@/components/ui/button";

interface ReportDoneStepProps {
  onLeave: () => void;
}

/**
 * 掲載情報の訂正・更新報告フォーム共通の送信完了ステップ。Phase 2 「2-10 ReportFormParts」。
 * `FacilityReportForm`/`ContentReportForm` で完全一致していた実装をそのまま部品化した。
 */
export function ReportDoneStep({ onLeave }: ReportDoneStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground">ご報告ありがとうございました</h2>
      <p className="text-sm text-muted-foreground">
        内容を確認し、必要に応じて掲載情報を更新します。確認や反映には時間がかかる場合があります。この報告によって掲載情報がすぐに変更されるものではありません。また、報告内容について個別にご連絡することはできません。
      </p>
      <div className="flex justify-end">
        <Button type="button" onClick={onLeave}>
          検索結果に戻る
        </Button>
      </div>
    </div>
  );
}
