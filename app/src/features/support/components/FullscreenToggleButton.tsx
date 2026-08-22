import { Maximize2, Minimize2 } from "lucide-react";

interface FullscreenToggleButtonProps {
  fullscreen: boolean;
  onToggle: () => void;
  expandLabel: string;
  collapseLabel?: string;
}

export const FULLSCREEN_OVERLAY_CLASSNAME =
  "fixed inset-0 z-50 h-full bg-background p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]";

export function FullscreenToggleButton({
  fullscreen,
  onToggle,
  expandLabel,
  collapseLabel = "元のサイズに戻す",
}: FullscreenToggleButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={fullscreen}
      onClick={onToggle}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium shadow-sm hover:bg-muted dark:bg-card"
    >
      {fullscreen ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
      {fullscreen ? collapseLabel : expandLabel}
    </button>
  );
}
