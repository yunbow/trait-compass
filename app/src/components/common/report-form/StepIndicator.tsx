interface ReportStepIndicatorProps {
  current: 1 | 2;
}

/**
 * 掲載情報の訂正・更新報告フォーム(`FacilityReportForm`/`ContentReportForm`)共通の
 * 2ステップ進行状況インジケーター。両フォームで完全一致していた実装(`role="progressbar"` を
 * 含むaria属性・DOM構造・文言)をそのまま部品化した(Phase 2 「2-10 ReportFormParts」)。
 */
export function ReportStepIndicator({ current }: ReportStepIndicatorProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-primary">{current} / 2　{current === 1 ? "報告内容" : "送信前の確認"}</p>
      <div role="progressbar" aria-label="報告の進行状況" aria-valuemin={1} aria-valuemax={2} aria-valuenow={current} className="flex gap-1">
        <span className="h-1 flex-1 rounded-full bg-primary" />
        <span className={`h-1 flex-1 rounded-full ${current === 2 ? "bg-primary" : "bg-muted"}`} />
      </div>
    </div>
  );
}
