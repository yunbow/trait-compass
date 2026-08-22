import { AiThinkingIndicator } from "@/components/common/AiThinkingIndicator";
import { Button } from "@/components/ui/button";

/**
 * 掲載情報の訂正・更新報告フォーム共通の送信中ステップ。Phase 2 「2-10 ReportFormParts」。
 * `FacilityReportForm`/`ContentReportForm` で完全一致していた実装をそのまま部品化した
 * (props を持たない。送信中は操作不能なため状態はコンポーネント内で完結する)。
 */
export function ReportSendingStep() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-foreground">送信内容を確認</h2>
      <AiThinkingIndicator label="送信しています…" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled>
          修正する
        </Button>
        <Button type="button" disabled>
          送信しています…
        </Button>
      </div>
    </div>
  );
}
