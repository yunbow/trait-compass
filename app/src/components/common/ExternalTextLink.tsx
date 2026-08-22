import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

interface ExternalTextLinkProps {
  href: string;
  children: string;
  /** レイアウト都合の追加クラスのみ(例: フレックス列で幅を詰める `w-fit`)。配色・下線は変えない。 */
  className?: string;
}

/**
 * 外部サイトへのテキストリンク(新しいタブで開く)。アイコン・`rel="noopener noreferrer"`・
 * スクリーンリーダー向けの「(新しいタブで開く)」を1箇所に集約する(/about・/privacy・
 * SiteFooterNav の8箇所が同一実装だった)。
 * 出典表示(`SourceCredit`)・危機相談窓口(`CrisisFooter`)の外部リンクは見た目・文脈が
 * 別物のため、ここに寄せない。
 */
export function ExternalTextLink({ href, children, className }: ExternalTextLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {children} <ExternalLink aria-hidden="true" className="size-3" />
      <span className="sr-only">（新しいタブで開く）</span>
    </a>
  );
}
