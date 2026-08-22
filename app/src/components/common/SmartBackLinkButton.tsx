"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useSmartBackClickHandler } from "@/components/common/report-form/useSmartBackClickHandler";
import { cn } from "@/lib/utils";

interface SmartBackLinkButtonProps {
  /** `history.back()` が使えない場合(直接アクセス・ブックマーク等)の遷移先。 */
  fallbackHref: string;
  children: string;
  className?: string;
  variant?: "outline" | "ghost";
}

/**
 * `BackLinkButton` と同じ見た目のまま、ブラウザ履歴があれば `history.back()` で戻る
 * ボタン型リンク(P0対応)。用途は `SmartBackLink` と同じ(report-form 系ページの空状態・
 * 「戻る」操作、`useSmartBackClickHandler` 参照)。
 */
export function SmartBackLinkButton({ fallbackHref, children, className, variant = "outline" }: SmartBackLinkButtonProps) {
  const handleClick = useSmartBackClickHandler();

  return (
    <Link href={fallbackHref} onClick={handleClick} className={cn(buttonVariants({ variant, size: "lg" }), className)}>
      <ArrowLeft aria-hidden="true" />
      {children}
    </Link>
  );
}
