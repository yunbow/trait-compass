import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BackLinkButtonProps {
  href: string;
  children: string;
  className?: string;
  variant?: "outline" | "ghost";
}

/**
 * 画面間を戻るためのリンク型ボタン。履歴操作ではなく href を明示して、直接アクセス時も
 * 遷移先が安定するようにする。
 */
export function BackLinkButton({ href, children, className, variant = "outline" }: BackLinkButtonProps) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size: "lg" }), className)}>
      <ArrowLeft aria-hidden="true" />
      {children}
    </Link>
  );
}
