import { type DateInput, type DateStyle, formatDateNY, toDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A `<time>` element in Washington time with the full stamp available on hover. */
export function DateText({ date, style = "short", fallback = "—", className }: { date?: DateInput | null; style?: DateStyle; fallback?: string; className?: string }) {
  if (date == null) return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  const d = toDate(date);
  return (
    <time dateTime={d.toISOString()} title={formatDateNY(d, "full")} className={className}>
      {formatDateNY(d, style)}
    </time>
  );
}
