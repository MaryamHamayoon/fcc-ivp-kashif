import { Skeleton } from "@/components/ui/skeleton";
import { DETAILS_WIDTH, EDGE, FILTERS_WIDTH, reachLayout, STRIP_HEIGHT } from "@/lib/reach/layout";

const { padding } = reachLayout({ width: 1440, tucked: false });

/**
 * The full screen's chrome as skeletons over the water color: while the server gathers the
 * meetings, then until the page has hydrated and knows the window's width. CSS alone places them,
 * so they are right before any script runs: below 1280 px (`xl`) the panels' skeletons stay away
 * and the timeline's is the tucked strip.
 */
export function ReachSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="fixed inset-0 overflow-hidden bg-[var(--map-water)]">
      <span className="sr-only">Loading the map…</span>
      <Skeleton className="absolute rounded-md" style={{ top: EDGE, left: EDGE, right: EDGE, height: STRIP_HEIGHT }} />
      <Skeleton className="absolute hidden rounded-md xl:block" style={{ left: EDGE, top: padding.top, bottom: padding.bottom, width: FILTERS_WIDTH }} />
      <Skeleton className="absolute hidden rounded-md xl:block" style={{ right: EDGE, top: padding.top, bottom: padding.bottom, width: DETAILS_WIDTH }} />
      <Skeleton className="absolute h-16 rounded-md xl:h-[172px]" style={{ left: EDGE, right: EDGE, bottom: EDGE }} />
    </div>
  );
}
