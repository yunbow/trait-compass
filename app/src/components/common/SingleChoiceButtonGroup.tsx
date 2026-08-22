"use client";

import { Button } from "@/components/ui/button";

interface SingleChoiceButtonGroupProps<T extends string> {
  options: readonly { value: T; label: string }[];
  selectedValue: T | null | undefined;
  onSelect: (value: T) => void;
  legend: string;
  /** legend のクラス名。既定は "text-xs font-medium text-foreground"。 */
  legendClassName?: string;
  disabled?: boolean;
}

/**
 * 単一選択のボタン列を持つ共通の選択グループ。`fieldset`+`legend`+`Button` 列で構成され、
 * 選択解除はなく、選択済みの値を再度押しても同じ値のままとなる。
 * `PreparePanel`/`RecommendHintSection` の「年齢」「相談する立場」等、および相談メモの
 * 追加単一選択項目(いつから困っているか・現在の生活・就労・就学状況・相談したい内容・
 * 希望する連絡方法)で共有する。
 */
export function SingleChoiceButtonGroup<T extends string>({
  options,
  selectedValue,
  onSelect,
  legend,
  legendClassName,
  disabled = false,
}: SingleChoiceButtonGroupProps<T>) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className={legendClassName ?? "text-xs font-medium text-foreground"}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={selectedValue === option.value ? "default" : "outline"}
            aria-pressed={selectedValue === option.value}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
