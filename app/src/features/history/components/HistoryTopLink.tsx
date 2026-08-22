"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { listResults } from "@/features/history/services/history-store";

/**
 * トップ画面の「これまでの記録を見る」導線(TICKET-0026)。
 *
 * `ResumeBanner`(localStorage・`useSyncExternalStore`)とは異なり、履歴は IndexedDB
 * (非同期 API)にあるため、同じ同期ストア読み出しパターンは使えない。素直に
 * `useEffect` で1件でもあるか確認し、マウント前・確認中は何も表示しない
 * (SSR の初期状態と一致させ、ハイドレーション不整合を避ける)。
 */
export function HistoryTopLink() {
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listResults().then((results) => {
      if (!cancelled) {
        setHasHistory(results.length > 0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasHistory) {
    return null;
  }

  return (
    <Button
      render={<Link href="/history" />}
      nativeButton={false}
      variant="outline"
      size="lg"
      className="w-full max-w-xs"
    >
      これまでの記録を見る
    </Button>
  );
}
