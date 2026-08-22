"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

interface SettingsToggleRowProps {
  title: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  /** 有効時の説明文。 */
  enabledDescription: string;
  /** 無効時の説明文。 */
  disabledDescription: string;
}

/**
 * 設定画面のトグル行共通実装(TICKET-0027)。
 *
 * `CurrentLocationToggle` / `HistoryToggle` / `SupportInputMemoryToggle` の
 * 3コンポーネントが、タイトル・説明文以外は完全に同一のマークアップ・
 * ロジック(section クリック可能領域+タイトル+有効/無効(初期設定)+状態別説明+
 * `role="switch"` ボタン+`stopPropagation`)を持っていたため、この
 * コンポーネントへ集約した。ラベルidは `useId` で生成し `aria-labelledby` に
 * 接続する(同一画面に複数インスタンスが存在するため、ハードコードidだと衝突する)。
 */
export function SettingsToggleRow({ title, enabled, onToggle, enabledDescription, disabledDescription }: SettingsToggleRowProps) {
  const labelId = useId();

  return (
    <section
      className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
      onClick={() => onToggle(!enabled)}
    >
      <div className="flex flex-col gap-1">
        <span id={labelId} className="text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="text-sm font-medium text-foreground">{enabled ? "有効" : "無効(初期設定)"}</span>
        <span className="text-sm text-muted-foreground">{enabled ? enabledDescription : disabledDescription}</span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby={labelId}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(!enabled);
        }}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          enabled ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform",
            enabled && "translate-x-5",
          )}
        />
      </button>
    </section>
  );
}
