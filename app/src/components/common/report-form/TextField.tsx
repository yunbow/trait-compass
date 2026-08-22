"use client";

import { Input } from "@/components/ui/input";

interface ReportTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

/**
 * 掲載情報の訂正・更新報告フォーム共通の単一行テキスト入力(Phase 2 「2-10 ReportFormParts」)。
 *
 * もとは `FacilityReportForm`/`ContentReportForm` それぞれにローカル実装があり、
 * `FacilityReportForm` 側は `maxLength` を実際の `<input>` へ渡さない未使用バグを持っていた
 * (`ContentReportForm` 側は正しく渡していた)。この部品化にあたり `ContentReportForm` 側の
 * 仕様(`maxLength` を実際に効かせる)へ統一し、内部実装は `src/components/ui/input.tsx` の
 * `Input` を使う(2-9で新設)。
 */
export function ReportTextField({ label, value, onChange, maxLength }: ReportTextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <Input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
      />
    </label>
  );
}
