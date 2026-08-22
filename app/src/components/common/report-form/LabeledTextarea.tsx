"use client";

import { Textarea } from "@/components/ui/textarea";

interface ReportLabeledTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

/**
 * 掲載情報の訂正・更新報告フォーム共通のラベル付き複数行入力(Phase 2 「2-10 ReportFormParts」)。
 * `FacilityReportForm`/`ContentReportForm` で完全一致していた実装をそのまま部品化した。
 */
export function ReportLabeledTextarea({ label, value, onChange, placeholder, maxLength }: ReportLabeledTextareaProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={3}
      />
      {maxLength && <span className="text-right text-xs font-normal text-muted-foreground">{value.length} / {maxLength}文字</span>}
    </label>
  );
}
