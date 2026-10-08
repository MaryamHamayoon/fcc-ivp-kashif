import { Skeleton } from "@/components/ui/skeleton";

/**
 * A meeting record while the server loads it. Mirrors `[id]/layout.tsx` — breadcrumb, masthead
 * with the readiness ring and actions, the section tabs, then the body/rail split — so the page
 * settles into place rather than reflowing. `Skeleton` drops its pulse under reduced motion.
 */
export default function MeetingRecordLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex min-w-0 flex-col gap-6">
      <span className="sr-only">Loading the meeting record…</span>

      {/* Masthead */}
      <div className="space-y-4 rounded-3xl border bg-card p-6 shadow-soft">
        <Skeleton className="h-3 w-56" />
        <div className="flex flex-wrap items-start gap-5">
          <Skeleton className="size-14 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-8 w-[60%]" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton className="size-16 shrink-0 rounded-full" />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {[72, 68, 82, 74, 96, 76].map((w) => (
          <Skeleton key={w} className="h-8 rounded-lg" style={{ width: w }} />
        ))}
      </div>

      {/* Body + summary rail */}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
        <div className="min-w-0 space-y-5">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
