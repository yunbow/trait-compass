import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="読み込み中"
      className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12"
    >
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-40 rounded-full" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    </main>
  );
}
