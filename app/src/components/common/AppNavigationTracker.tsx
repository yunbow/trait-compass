"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { markAppNavigationOccurred } from "@/components/common/report-form/app-navigation-session";

/**
 * ルートレイアウトに常駐し、このタブでアプリ内のページ遷移が発生したことを記録する
 * (P0対応、`app-navigation-session.ts` 参照)。何も描画しない。
 *
 * ルートレイアウトはページ遷移をまたいで再マウントされないため、`usePathname()` の変化を
 * 検知するこの `useEffect` は「クライアント遷移が起きるたび」に発火する。初回マウント時
 * (このタブでの最初のページ)は遷移ではないため記録しない。
 */
export function AppNavigationTracker() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    markAppNavigationOccurred();
  }, [pathname]);

  return null;
}
