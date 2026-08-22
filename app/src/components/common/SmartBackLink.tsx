"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { useSmartBackClickHandler } from "@/components/common/report-form/useSmartBackClickHandler";
import { cn } from "@/lib/utils";

interface SmartBackLinkProps {
  /** `history.back()` が使えない場合(直接アクセス・ブックマーク等)の遷移先。 */
  fallbackHref: string;
  children: string;
  className?: string;
}

/**
 * `GhostBackLink` と同じ見た目のまま、ブラウザ履歴があれば `history.back()` で戻る
 * 「戻る」リンク(P0対応)。`/support/facility-report`・`/support/content-report` 等の
 * 報告ページで、前画面(検索結果)の検索条件を URL に埋め込まずに「検索結果に戻る」を
 * 実現するために使う(`useSmartBackClickHandler` 参照)。
 */
export function SmartBackLink({ fallbackHref, children, className }: SmartBackLinkProps) {
  const handleClick = useSmartBackClickHandler();

  return (
    <Link
      href={fallbackHref}
      onClick={handleClick}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "w-fit self-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground",
        className,
      )}
    >
      ← {children}
    </Link>
  );
}
