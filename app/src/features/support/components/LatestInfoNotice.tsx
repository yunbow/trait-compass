/** 最新情報確認の常時注記(自治体の二次利用許諾条件対応、DatasetFreshnessNoteの要約版)。 */
export function LatestInfoNotice() {
  return (
    <p role="note" className="rounded-lg border border-border bg-muted px-4 py-3 text-left text-xs text-muted-foreground">
      掲載している情報は、各データの取得・確認時点のものです。最新・正確な情報は、各自治体・機関等の公式サイトや窓口で必ずご確認ください。
    </p>
  );
}
