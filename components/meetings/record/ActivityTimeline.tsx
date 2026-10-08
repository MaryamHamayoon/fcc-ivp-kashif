"use client";

import { useReducedMotion } from "@/lib/motion";
import { DISPLAY_TZ, formatDateNY, relativeAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityEntryView } from "./activity-entries";
import { ActivityEntry } from "./ActivityEntry";

const yearOf = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TZ, year: "numeric" });

type DayGroup = { key: string; label: string; date: Date; items: ActivityEntryView[] };

/** Newest first, gathered into Washington-time days — the way a coordinator reads a file back. */
function groupByDay(entries: ActivityEntryView[]): DayGroup[] {
  const sorted = [...entries].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const groups: DayGroup[] = [];
  for (const entry of sorted) {
    const key = formatDateNY(entry.occurredAt, "short");
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(entry);
    else groups.push({ key, label: formatDateNY(entry.occurredAt, "weekday"), date: entry.occurredAt, items: [entry] });
  }
  return groups;
}

export type ActivityTimelineProps = {
  entries: ActivityEntryView[];
  now: Date;
  canResolve: boolean;
  onResolve: (entryId: string, note: string) => Promise<boolean>;
  /** The activity the record is currently waiting on; it takes the `#waiting` anchor the rail links to. */
  waitingActivityId?: string | null;
  /** The entry just posted from the composer — the only one that animates in. */
  revealId?: string | null;
  className?: string;
};

/** The record's story: day by day, newest first, with the aging of anything still open. */
export function ActivityTimeline({ entries, now, canResolve, onResolve, waitingActivityId, revealId, className }: ActivityTimelineProps) {
  const reduce = useReducedMotion() ?? false;
  const groups = groupByDay(entries);
  const thisYear = yearOf.format(now);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {groups.map((group) => (
        <section key={group.key} aria-label={group.key}>
          <h3 className="numeric flex items-baseline gap-2 border-b pb-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {group.label}
            {yearOf.format(group.date) === thisYear ? null : <span>{yearOf.format(group.date)}</span>}
            <span className="ml-auto text-[0.625rem] font-normal tracking-normal normal-case">{relativeAge(group.date, now)}</span>
          </h3>

          {/* The hairline threads the kind icons into one column. */}
          <ol className="relative divide-y divide-border/50 before:absolute before:top-5 before:bottom-5 before:left-4 before:w-px before:bg-border/60 before:content-['']">
            {group.items.map((entry) => (
              <ActivityEntry
                key={entry.id}
                entry={entry}
                now={now}
                anchor={entry.id === waitingActivityId ? "waiting" : undefined}
                canResolve={canResolve}
                onResolve={onResolve}
                reveal={!reduce && entry.id === revealId}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
