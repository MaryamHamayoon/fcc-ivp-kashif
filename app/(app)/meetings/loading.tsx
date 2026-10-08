import { Skeleton } from "@/components/ui/skeleton";

/**
 * The meetings workspace while the server assembles the list: page header, the saved-view and
 * filter row, then the table's own rows. Mirrors `MeetingsWorkspace` closely enough that nothing
 * jumps when the real thing arrives. `Skeleton` drops its pulse under reduced motion.
 */
export default function MeetingsLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading meetings…</span>

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[88, 104, 72, 96, 80].map((w) => (
          <Skeleton key={w} className="h-8 rounded-full" style={{ width: w }} />
        ))}
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <Skeleton className="h-11 rounded-none" />
        <div className="divide-y">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-[42%]" />
                <Skeleton className="h-3 w-[26%]" />
              </div>
              <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
              <Skeleton className="hidden h-4 w-28 md:block" />
              <Skeleton className="size-9 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
