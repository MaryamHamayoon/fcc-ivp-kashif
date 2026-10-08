import Link from "next/link";
import { DateText } from "@/components/common/DateText";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { Timeline } from "@/lib/domain/dossier";
import { fyLabel } from "@/lib/domain/glance";

/**
 * The timeline as a list, for narrow screens: one group per fiscal year, newest first, each
 * meeting with its date, topic lane and status. The same rows the chart's data table shows.
 */
export function TimelineList({ timeline }: { timeline: Timeline }) {
  const laneName = new Map(timeline.lanes.map((l) => [l.id, l.name]));
  const years = [...new Set(timeline.meetings.map((m) => m.fiscalYear))].sort((a, b) => b - a);
  const sorted = [...timeline.meetings].sort((a, b) => (b.date?.getTime() ?? Infinity) - (a.date?.getTime() ?? Infinity));

  return (
    <div className="space-y-4">
      {years.map((fy) => (
        <section key={fy} aria-labelledby={`timeline-fy-${fy}`}>
          <h3 id={`timeline-fy-${fy}`} className="mb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {fyLabel(fy)}
          </h3>
          <ol className="divide-y overflow-hidden rounded-xl border bg-card">
            {sorted
              .filter((m) => m.fiscalYear === fy)
              .map((m) => (
                <li key={m.id}>
                  <Link href={`/meetings/${m.id}`} className="flex items-center justify-between gap-3 px-3 py-2 transition hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <DateText date={m.date} fallback="Not yet scheduled" /> · {laneName.get(m.laneId) ?? "Other"}
                      </span>
                    </span>
                    <StatusBadge status={m.status} />
                  </Link>
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
