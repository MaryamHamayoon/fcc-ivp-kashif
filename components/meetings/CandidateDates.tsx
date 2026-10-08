import { DISPLAY_TZ, formatDateNY } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CandidateDate = { id: string; start: Date; end: Date | null; status: string; proposedBy: string };

const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TZ, month: "short", day: "numeric" });

/**
 * What the date cell says before anyone has said yes: "TBD · Aug 26, Aug 27 proposed".
 * Only dates still on the table count — declined and withdrawn ones are history.
 */
export function CandidateDates({ dates, max = 3, className }: { dates: CandidateDate[]; max?: number; className?: string }) {
  const open = dates.filter((d) => d.status === "proposed").sort((a, b) => a.start.getTime() - b.start.getTime());
  if (open.length === 0) return <span className={cn("text-muted-foreground", className)}>TBD</span>;

  const shown = open.slice(0, max);
  const overflow = open.length - shown.length;
  const text = `TBD · ${shown.map((d) => monthDay.format(d.start)).join(", ")}${overflow > 0 ? ` +${overflow}` : ""} proposed`;
  const title = open.map((d) => formatDateNY(d.start, "day")).join(" · ");

  return (
    <span title={title} className={cn("text-muted-foreground", className)}>
      {text}
    </span>
  );
}
