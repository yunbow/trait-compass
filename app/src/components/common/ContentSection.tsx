import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ContentSectionProps {
  /**
   * 目次アンカーの id。`<section id>` に設定し、見出しには `${anchorId}-heading` を振って
   * `aria-labelledby` で結ぶ(/terms・/help で既に使われている命名規約に合わせる)。
   */
  anchorId: string;
  title: string;
  /** 見出し左のアイコン(lucide を `aria-hidden="true"` 付きで渡す)。 */
  icon?: ReactNode;
  /** "accent": 注意喚起・要約用の primary 配色。既定は "default"(bg-card)。 */
  tone?: "default" | "accent";
  children: ReactNode;
}

const TONE_CLASS = {
  default: "border-border bg-card",
  accent: "border-primary/25 bg-primary/5",
} as const;

/**
 * 情報系ページの本文セクション(カード)。見出しと本文を `aria-labelledby` で結ぶ配線と
 * `scroll-mt-6`(目次から飛んだときの上余白)を1箇所に集約する。
 *
 * ヒーロー見出し(`InfoPageShell` の `<header>`)は同じ primary 配色でも余白・角丸・
 * タイポグラフィが別物のため、tone="accent" で兼用しないこと。
 */
export function ContentSection({ anchorId, title, icon, tone = "default", children }: ContentSectionProps) {
  const headingId = `${anchorId}-heading`;
  const heading = (
    <h2 id={headingId} className="text-base font-semibold text-foreground">
      {title}
    </h2>
  );

  return (
    <section
      id={anchorId}
      aria-labelledby={headingId}
      className={cn("scroll-mt-6 rounded-xl border p-4 sm:p-5", TONE_CLASS[tone])}
    >
      {icon ? <div className="flex items-center gap-2">{icon}{heading}</div> : heading}
      {children}
    </section>
  );
}
