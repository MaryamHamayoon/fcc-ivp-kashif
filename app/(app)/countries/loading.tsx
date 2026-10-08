import { Skeleton } from "@/components/ui/skeleton";

/**
 * The countries index while every meeting is folded per country. Mirrors `CountriesTable`'s
 * five columns. `Skeleton` drops its pulse under reduced motion.
 */
export default function CountriesLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-8">
      <span className="sr-only">Loading countries…</span>

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-[30rem] max-w-full" />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <Skeleton className="h-11 rounded-none" />
        <div className="divide-y">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-6 shrink-0 rounded-sm" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="hidden h-3 w-28 sm:block" />
              <Skeleton className="ml-auto h-4 w-8" />
              <Skeleton className="hidden h-3 w-24 md:block" />
              <Skeleton className="hidden h-6 w-40 rounded-full lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
