import { Skeleton } from "@/components/ui/skeleton";

/**
 * The directory while experts and organizations load: header, tab row, bureau chips and search,
 * then the card grid. `Skeleton` drops its pulse under reduced motion.
 */
export default function DirectoryLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-8">
      <span className="sr-only">Loading the directory…</span>

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-8 w-52 rounded-lg" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-72" />
        {[64, 72, 60, 80, 68, 76].map((w) => (
          <Skeleton key={w} className="h-7 rounded-full" style={{ width: w }} />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
