import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/result/prepare`・`/result/recommend`・`/result/summarize` で共通のハイドレーション待ち
 * スケルトン(方針: 画面読み込みは Skeleton で統一する)。3画面とも
 * `GhostBackLink` + `DisclaimerNotice` + メインコンテンツという同じ構成のラッパーを使うため、
 * 個別に定義せずここに集約する。
 */
export function ResultSubPageSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="読み込み中"
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </main>
  );
}
