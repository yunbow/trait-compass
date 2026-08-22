"use client";

import { Button } from "@/components/ui/button";

interface TagToggleGroupProps<T extends string> {
  options: readonly T[];
  selectedTags: T[];
  onToggle: (tag: T) => void;
  legend: string;
  description?: string;
  disabled?: boolean;
}

/**
 * タグ項目を複数選択する共通のカード型トグルグループ。
 * `SupportTagToggleGroup`(`@/features/support/components/SupportTagToggleGroup.tsx`)は
 * `SUPPORT_TAGS` を束縛したこのコンポーネントの薄いラッパーであり、任意のタグ配列を
 * 受け取れる本コンポーネントを用途に応じて共有する。
 */
export function TagToggleGroup<T extends string>({
  options,
  selectedTags,
  onToggle,
  legend,
  description,
  disabled = false,
}: TagToggleGroupProps<T>) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
      <legend className="px-1 text-base font-medium text-foreground">{legend}</legend>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <Button
              key={tag}
              type="button"
              variant={isSelected ? "default" : "outline"}
              size="sm"
              aria-pressed={isSelected}
              onClick={() => onToggle(tag)}
            >
              {tag}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
