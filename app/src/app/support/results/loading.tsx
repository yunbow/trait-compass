import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="読み込み中"
      className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-8 sm:py-12"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </main>
  );
}
