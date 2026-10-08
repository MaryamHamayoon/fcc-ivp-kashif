"use client";

import { ArrowLeft, CalendarClock, Star } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { Flag } from "@/components/common/Flag";
import { StatusDot } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY, relativeAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addDays, dayLabel } from "./CalendarMonth";

export type CalendarAgendaProps = {
  /** Meetings bucketed by Washington civil day, the same map the month grid reads. */
  byDay: ReadonlyMap<string, MeetingListItem[]>;
  todayKey: string;
  now: Date;
  /** When set, the agenda narrows to that one day. */
  selectedDay: string | null;
  onClearDay: () => void;
  /** How far ahead the rolling view looks. */
  days?: number;
  isLoading?: boolean;
  className?: string;
};

/**
 * What is actually coming, in the order it arrives. The month grid answers "when"; this
 * answers "what next" — a running list a coordinator can work down, or a single day when
 * one has been chosen on the grid.
 */
export function CalendarAgenda({ byDay, todayKey, now, selectedDay, onClearDay, days = 30, isLoading = false, className }: CalendarAgendaProps) {
  const headingId = useId();
  const keys = selectedDay ? [selectedDay] : Array.from({ length: days }, (_, index) => addDays(todayKey, index));
  const groups = keys.map((key) => ({ key, meetings: byDay.get(key) ?? [] })).filter((group) => group.meetings.length > 0);
  const total = groups.reduce((sum, group) => sum + group.meetings.length, 0);
  const heading = selectedDay ? dayLabel(selectedDay, "full") : `Next ${days} days`;

  return (
    <section aria-labelledby={headingId} className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-soft", className)}>
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">Agenda</p>
          <h3 id={headingId} className="mt-0.5 truncate text-[0.9375rem] font-semibold">
            {heading}
          </h3>
        </div>
        {selectedDay ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClearDay} className="shrink-0">
            <ArrowLeft aria-hidden />
            {`Next ${days} days`}
          </Button>
        ) : (
          <span className="numeric shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">{isLoading ? "—" : total}</span>
        )}
      </header>

      <div className="relative max-h-[36rem] flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <ul className="grid gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-10 w-full rounded-lg" />
              </li>
            ))}
          </ul>
        ) : groups.length === 0 ? (
          <p className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            <CalendarClock className="size-5" aria-hidden />
            {selectedDay ? "Nothing is scheduled on this day." : `Nothing is scheduled in the next ${days} days.`}
          </p>
        ) : (
          <ol className="grid gap-4">
            {groups.map((group) => (
              <li key={group.key}>
                <p className="numeric flex items-baseline gap-2 border-b pb-1 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  <span className={cn(group.key === todayKey && "text-primary")}>{dayLabel(group.key, "weekdayShort")}</span>
                  <span className="text-foreground">{dayLabel(group.key, "monthDay")}</span>
                  <span className="ml-auto font-normal normal-case">{relativeAge(new Date(`${group.key}T12:00:00Z`), now)}</span>
                </p>
                <ul className="mt-1.5 grid gap-1">
                  {group.meetings.map((meeting) => (
                    <li key={meeting.id}>
                      <Link
                        href={`/meetings/${meeting.id}`}
                        className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Flag code={meeting.countryCode} size={11} className="mt-1" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[0.8125rem] font-medium">{meeting.orgShortName ?? meeting.orgName}</span>
                            {meeting.ochAttending ? (
                              <>
                                <Star className="size-3 shrink-0 fill-gold text-gold" aria-hidden />
                                <span className="sr-only">OCH attending</span>
                              </>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{meeting.title}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="numeric text-[0.6875rem] text-muted-foreground">{meeting.scheduledStart ? formatDateNY(meeting.scheduledStart, "time") : "—"}</span>
                          <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
                            <StatusDot status={meeting.status} className="size-1.5" />
                            {STATUS_LABELS[meeting.status]}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
