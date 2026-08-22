import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ResultsTab } from "@/features/support/constants/results-tabs";

export interface CategoryTab {
  type: ResultsTab;
  href: string;
  count: number;
}

interface CategoryTabsProps {
  activeTab: ResultsTab;
  tabs: CategoryTab[];
}

/**
 * 結果分類のナビゲーション(FR-028)。呼び出し元で与えたタブのみを、`?tab=` クエリ付きリンクで
 * 切り替える(タブ切替にクライアント側 JS を必要としない)。
 */
export function CategoryTabs({ activeTab, tabs }: CategoryTabsProps) {
  return (
    <nav aria-label="支援情報の分類" className="border-b border-border pb-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {tabs.map((tab) => {
          const isActive = tab.type === activeTab;
          return (
            <Link
              key={tab.type}
              href={tab.href}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center justify-between gap-1 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive
                  ? "border border-primary bg-white text-primary shadow-sm dark:bg-card"
                  : "border border-border bg-white text-foreground shadow-sm hover:bg-muted dark:bg-card",
              )}
            >
              <span>{tab.type}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs",
                  isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
