"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { hasSurveyProgress } from "@/features/survey/services/progress";

// localStorage はブラウザ外部から変化しうる同期ストアなので、setState を
// エフェクト内で呼ぶより useSyncExternalStore で読むのが素直(SSR/ハイドレーション安全)。
// 本コンポーネントの外から更新される契機は無いため subscribe は no-op でよい。
function subscribe() {
  return () => {};
}

function getServerSnapshot() {
  return false;
}

/**
 * localStorage に進行中の回答データがある場合のみ「前回の続きから」を表示する
 * クライアントコンポーネント(FR-015, AC-5, AC-6, AC-8)。
 *
 * サーバー・初回クライアントレンダリングは常に `getServerSnapshot` の false を返すため
 * ハイドレーション不整合は発生しない。クライアントでのマウント後は `getSnapshot` で
 * localStorage を検査した結果に切り替わる。
 */
export function ResumeBanner() {
  const hasProgress = useSyncExternalStore(subscribe, hasSurveyProgress, getServerSnapshot);

  if (!hasProgress) {
    return null;
  }

  return (
    <Button
      render={<Link href="/survey" />}
      nativeButton={false}
      variant="outline"
      size="lg"
      className="w-full max-w-xs"
    >
      前回の続きから
    </Button>
  );
}
