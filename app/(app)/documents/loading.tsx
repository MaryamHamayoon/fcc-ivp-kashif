import { Skeleton } from "@/components/ui/skeleton";

/**
 * The library while the server assembles its facets: header, the filter row, then rows.
 * Mirrors `LibraryWorkspace` closely enough that nothing jumps when the real thing arrives.
 */
export default function DocumentsLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading documents…</span>

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-80" />
        {[64, 72, 84, 76, 104, 56, 72].map((w) => (
          <Skeleton key={w} className="h-7 rounded-lg" style={{ width: w }} />
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <Skeleton className="h-9 rounded-none" />
        <div className="divide-y">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="size-7 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-[38%]" />
                <Skeleton className="h-3 w-[22%]" />
              </div>
              <Skeleton className="hidden h-4 w-24 sm:block" />
              <Skeleton className="hidden h-4 w-40 md:block" />
              <Skeleton className="hidden h-4 w-24 lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
