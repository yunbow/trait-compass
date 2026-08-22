"use client";

import type { KeyboardEvent } from "react";

export type ViewMode = "list" | "list-map" | "map";

const options: { value: ViewMode; label: string; shortLabel: string }[] = [
  { value: "list", label: "一覧のみ", shortLabel: "一覧" },
  { value: "list-map", label: "一覧と地図", shortLabel: "一覧＋地図" },
  { value: "map", label: "地図のみ", shortLabel: "地図" },
];

export function ViewModeToggle({ value, onChange, showLabel = true }: { value: ViewMode; onChange: (value: ViewMode) => void; showLabel?: boolean }) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = (index + direction + options.length) % options.length;
    onChange(options[next].value);
    document.getElementById(`view-mode-${options[next].value}`)?.focus();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {showLabel && <span id="view-mode-label" className="text-xs font-medium text-muted-foreground">表示方法</span>}
      <div
        role="radiogroup"
        {...(showLabel ? { "aria-labelledby": "view-mode-label" } : { "aria-label": "表示方法" })}
        className="grid w-[15.5rem] grid-cols-3 overflow-hidden rounded-md border border-border bg-background"
      >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`view-mode-${option.value}`}
            type="button"
            role="radio"
            aria-label={option.label}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex min-h-9 items-center justify-center gap-1 px-1.5 text-xs font-medium transition-colors sm:px-2 sm:text-sm ${index > 0 ? "border-l border-border" : ""} ${selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted"}`}
          >
            {selected && <span aria-hidden="true">✓</span>}
            <span className="sm:hidden">{option.shortLabel}</span>
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
