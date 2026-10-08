import { Skeleton } from "@/components/ui/skeleton";

/**
 * The log while the server assembles its facets: title, the two toolbar rows, then the pulse
 * and the rows. Mirrors `ActivityWorkspace` closely enough that nothing jumps when it arrives.
 */
export default function ActivityLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading activity…</span>

      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-[5.25rem] w-full rounded-xl" />

      <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="flex items-end gap-4 border-b px-3 pt-3 pb-2.5">
          <Skeleton className="h-8 w-40 shrink-0" />
          <Skeleton className="h-12 flex-1" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="h-3.5 w-12 shrink-0" />
              <Skeleton className="h-3.5 w-24 shrink-0" />
              <Skeleton className="h-3.5 min-w-0 flex-1" />
              <Skeleton className="hidden h-3.5 w-36 lg:block" />
              <Skeleton className="hidden h-3.5 w-16 lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
