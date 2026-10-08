import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "42 / 128": what is on screen against what matched — or just "128 meetings" when nothing is
 * paged. A polite live region, so a screen reader hears the count settle after each filter
 * without being interrupted by it.
 */
export function ResultCount({ shown, total, noun, isLoading = false, className }: { shown?: number; total: number; noun: string; isLoading?: boolean; className?: string }) {
  return (
    <div role="status" className={cn("numeric shrink-0 text-xs whitespace-nowrap text-muted-foreground", className)}>
      {isLoading ? (
        <>
          <span aria-hidden>— / —</span>
          <span className="sr-only">Loading {noun}</span>
        </>
      ) : shown === undefined ? (
        <>
          <span className="font-semibold text-foreground">{formatNumber(total)}</span> {noun}
        </>
      ) : (
        <>
          <span className="font-semibold text-foreground">{formatNumber(shown)}</span> / {formatNumber(total)}
          <span className="sr-only"> {noun}</span>
        </>
      )}
    </div>
  );
}
