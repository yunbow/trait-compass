"use client";

interface ReportHoneypotFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * 掲載情報の訂正・更新報告フォーム共通のハニーポット項目(bot対策、実際のユーザーには
 * 見えない)。Phase 2 「2-10 ReportFormParts」。`FacilityReportForm`/`ContentReportForm` で
 * 完全一致していた実装をそのまま部品化した。
 */
export function ReportHoneypotField({ value, onChange }: ReportHoneypotFieldProps) {
  return (
    <input
      type="text"
      name="website"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="absolute -left-[9999px]"
      aria-hidden="true"
      tabIndex={-1}
      autoComplete="off"
    />
  );
}
