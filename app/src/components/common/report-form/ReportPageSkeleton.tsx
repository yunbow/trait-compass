import { Skeleton } from "@/components/ui/skeleton";

/**
 * 掲載情報の報告ページ(/support/facility-report・/support/content-report)共通の
 * ローディングスケルトン。両ページの loading.tsx が完全同一だったため集約する。
 */
export function ReportPageSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="読み込み中"
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12"
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-10 w-full max-w-xs rounded-lg" />
      </div>
    </main>
  );
}
