import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GhostBackLinkProps {
  href: string;
  children: string;
  className?: string;
}

/**
 * 画面上部に置く控えめな「戻る」リンクの共通見た目。TopReturnLink など、
 * 遷移先だけが異なる戻るリンクはこれをラップして作る。
 */
export function GhostBackLink({ href, children, className }: GhostBackLinkProps) {
  return (
    <Link
      href={href}
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
