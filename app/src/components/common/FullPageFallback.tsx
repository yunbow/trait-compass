import type { ReactNode } from "react";

import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";

interface FullPageFallbackProps {
  title: string;
  description: string;
  /** やり直し導線等の任意アクション。省略時は表示しない(CoverageFallbackでは渡さない、意図的差別化)。 */
  action?: ReactNode;
}

/**
 * 検索条件不正・D1未接続時等の全画面空状態表示(TICKET-0015/TICKET-0029共通)。
 * `SupportResultsFallback`/`CoverageFallback` の実装差分は「やり直し導線
 * (action)の有無」「title/descriptionをpropsで受けるかハードコードか」のみだったため、
 * DOM構造(`<main>`ラッパー・`DisclaimerNotice`・h1・p)をこのコンポーネントへ集約する。
 * 非診断の免責(NFR-52)は省略不可のため、actionの有無に関わらず必ず表示する。
 */
export function FullPageFallback({ title, description, action }: FullPageFallbackProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 py-12 text-center"
    >
      <DisclaimerNotice variant="compact" />
      <h1 className="text-base font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      {action}
    </main>
  );
}
