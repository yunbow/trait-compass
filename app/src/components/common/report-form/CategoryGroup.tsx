"use client";

interface ReportCategoryGroupProps<T extends string> {
  options: readonly { value: T; label: string }[];
  selectedValue: T | null;
  onSelect: (value: T) => void;
}

/**
 * 掲載情報の訂正・更新報告フォーム共通のカテゴリ選択(単一選択ボタン列)。
 * Phase 2 「2-10 ReportFormParts」。`FacilityReportForm` の `ReportCategoryGroup`
 * (選択肢は `ReportCategory`)と `ContentReportForm` の `CategoryGroup`(選択肢は
 * `PathwayReportCategory`/`SchoolReportCategory`/`GuideReportCategory` の3種)は
 * 選択肢の型のみが異なり、DOM・aria(`aria-pressed`)・文言は完全一致していたため、
 * `SingleChoiceButtonGroup` と同じ設計思想でジェネリックな `options` API に統一した。
 */
export function ReportCategoryGroup<T extends string>({ options, selectedValue, onSelect }: ReportCategoryGroupProps<T>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">何を訂正・更新しますか？</legend>
      <div className="grid gap-2">
        {options.map((option) => {
          const selected = selectedValue === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(option.value)}
              className={`rounded-lg border px-3 py-3 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${selected ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
