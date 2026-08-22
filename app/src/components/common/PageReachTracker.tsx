"use client";

import { useEffect } from "react";

import { trackPageReached } from "@/lib/analytics/client";
import type { TrackableScreen } from "@/lib/analytics/client";

interface PageReachTrackerProps {
  screen: TrackableScreen;
}

/**
 * 画面到達計測(TICKET-0034)。マウント時に一度だけ `trackPageReached(screen)` を呼び出す、
 * 何も描画しないクライアントコンポーネント。
 *
 * サーバーコンポーネントの画面(`app/page.tsx`, `app/support/results/page.tsx` 等)に挿し込んで
 * 使う。受け取るのは `screen`(閉じた union 型)のみで、スコア・自由記述・年齢・地域・共有URL
 * 内容(`#r=...`)など結果データには一切アクセスしない設計とする(NFR-31〜33)。
 */
export function PageReachTracker({ screen }: PageReachTrackerProps) {
  useEffect(() => {
    trackPageReached(screen);
  }, [screen]);

  return null;
}
