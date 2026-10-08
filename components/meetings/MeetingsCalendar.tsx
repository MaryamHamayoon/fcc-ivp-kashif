"use client";

import { AlertTriangle, CalendarSearch, RefreshCw, SearchX } from "lucide-react";
import Link from "next/link";
import { useCallback, useId, useMemo, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { Flag } from "@/components/common/Flag";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { cn } from "@/lib/utils";
import { CalendarAgenda } from "./CalendarAgenda";
import { CandidateDates } from "./CandidateDates";
import { CalendarMonth, daysOf, nyDayKey } from "./CalendarMonth";
import { StatusPill } from "./StatusPill";

export type MeetingsCalendarProps = {
  items: MeetingListItem[];
  now: Date;
  isLoading?: boolean;
  isError?: boolean;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onRetry?: () => void;
  className?: string;
};

/** Earliest first; two meetings on one morning read in the order they happen. */
function byStart(a: MeetingListItem, b: MeetingListItem): number {
  const at = a.scheduledStart?.getTime() ?? 0;
  const bt = b.scheduledStart?.getTime() ?? 0;
  return at - bt || a.code.localeCompare(b.code);
}

/**
 * The program on a calendar: a Washington-time month beside a rolling agenda, with the
 * meetings nobody has agreed a date for kept in plain sight rather than dropped — an
 * undated visit is the one most likely to slip.
 */
export function MeetingsCalendar({ items, now, isLoading = false, isError = false, hasFilters = false, onClearFilters, onRetry, className }: MeetingsCalendarProps) {
  const monthHeadingId = useId();
  const trayHeadingId = useId();
  const todayKey = nyDayKey(now);
  const [view, setView] = useState(() => ({ year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) }));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, MeetingListItem[]>();
    for (const meeting of items) {
      for (const key of daysOf(meeting)) {
        const bucket = map.get(key);
        if (bucket) bucket.push(meeting);
        else map.set(key, [meeting]);
      }
    }
    for (const bucket of map.values()) bucket.sort(byStart);
    return map;
  }, [items]);

  const pending = useMemo(
    () =>
      items
        .filter((meeting) => meeting.scheduledStart === null)
        .sort((a, b) => (a.nextCandidate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.nextCandidate?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code)),
    [items],
  );

  const selectDay = useCallback((key: string) => {
    setSelectedDay(key);
    setView({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
  }, []);

  const goToday = useCallback(() => {
    setSelectedDay(null);
    setView({ year: Number(todayKey.slice(0, 4)), month: Number(todayKey.slice(5, 7)) });
  }, [todayKey]);

  if (isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        className={className}
        title="The calendar did not load."
        description="The connection dropped or the server is busy. Nothing has been lost — try again."
        action={
          onRetry ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCw aria-hidden />
              Try again
            </Button>
          ) : null
        }
      />
    );
  }

  if (!isLoading && items.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        className={className}
        title="No meetings match these filters."
        description={hasFilters ? "Widen the search, or clear the filters to see the whole program." : "Nothing has been logged for this view yet."}
        action={
          hasFilters && onClearFilters ? (
            <Button type="button" variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className={cn("grid items-start gap-4 xl:grid-cols-12", className)}>
      <CalendarMonth
        year={view.year}
        month={view.month}
        byDay={byDay}
        todayKey={todayKey}
        selectedDay={selectedDay}
        onSelectDay={selectDay}
        onMonthChange={(year, month) => setView({ year, month })}
        onToday={goToday}
        headingId={monthHeadingId}
        className="xl:col-span-8"
      />

      <div className="grid gap-4 xl:col-span-4">
        <CalendarAgenda byDay={byDay} todayKey={todayKey} now={now} selectedDay={selectedDay} onClearDay={() => setSelectedDay(null)} isLoading={isLoading} />

        <section aria-labelledby={trayHeadingId} className="overflow-hidden rounded-xl border border-dashed bg-card/60">
          <header className="flex items-center gap-2 border-b border-dashed px-4 py-3">
            <CalendarSearch className="size-4 text-muted-foreground" aria-hidden />
            <h3 id={trayHeadingId} className="text-[0.9375rem] font-semibold">
              Dates pending
            </h3>
            <span className="numeric ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">{isLoading ? "—" : pending.length}</span>
          </header>

          <div className="relative max-h-72 overflow-y-auto px-3 py-2">
            {isLoading ? (
              <div className="grid gap-2 py-1">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-11 w-full rounded-lg" />
                ))}
              </div>
            ) : pending.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">Every meeting in this view has a date.</p>
            ) : (
              <ul className="grid gap-1">
                {pending.map((meeting) => (
                  <li key={meeting.id}>
                    <Link
                      href={`/meetings/${meeting.id}`}
                      className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Flag code={meeting.countryCode} size={11} className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] font-medium">{meeting.orgShortName ?? meeting.orgName}</span>
                        <CandidateDates dates={meeting.candidateDates} max={2} className="block truncate text-xs" />
                      </span>
                      <StatusPill status={meeting.status} className="mt-0.5 text-[0.625rem]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
