"use client";

import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { Flag } from "@/components/common/Flag";
import { StatusDot } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import { DISPLAY_TZ } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ------------------------- the Washington calendar ------------------------ */

/**
 * A calendar day is a civil date — "2026-08-31" — not an instant. Instants are converted
 * to Washington civil dates once, on the way in; every grid, key and label after that is
 * plain arithmetic, so daylight saving can never shift a meeting onto the wrong square.
 */
const DAY_MS = 86_400_000;

const nyDayParts = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** The Washington calendar day an instant falls on, as `YYYY-MM-DD`. */
export function nyDayKey(instant: Date): string {
  const parts = nyDayParts.formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

export const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Civil dates are stored as UTC midnights so day arithmetic is exact. */
function keyToUtc(key: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function utcToKey(time: number): string {
  const date = new Date(time);
  return dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export const addDays = (key: string, days: number) => utcToKey(keyToUtc(key) + days * DAY_MS);

/** Every civil day a meeting occupies — a two-day visit sits on both squares. */
export function daysOf(meeting: MeetingListItem): string[] {
  if (!meeting.scheduledStart) return [];
  const first = nyDayKey(meeting.scheduledStart);
  const last = nyDayKey(meeting.scheduledEnd ?? meeting.scheduledStart);
  const days = [first];
  for (let key = addDays(first, 1); key <= last && days.length < 14; key = addDays(key, 1)) days.push(key);
  return days;
}

const LABEL_STYLES = {
  weekdayShort: { weekday: "short" },
  monthDay: { month: "short", day: "numeric" },
  full: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
  monthYear: { month: "long", year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const labelFormatters = new Map<string, Intl.DateTimeFormat>();

/** Civil dates are already Washington days, so they are labelled in UTC — no second shift. */
export function dayLabel(key: string, style: keyof typeof LABEL_STYLES): string {
  let formatter = labelFormatters.get(style);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...LABEL_STYLES[style] });
    labelFormatters.set(style, formatter);
  }
  return formatter.format(new Date(keyToUtc(key))).replace(/[  ]/g, " ");
}

export const monthLabel = (year: number, month: number) => dayLabel(dayKey(year, month, 1), "monthYear");

/** Sunday-first, matching the federal calendar every OIA coordinator already reads. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The squares of one month, padded out to whole weeks. */
export function monthGrid(year: number, month: number): string[] {
  const first = Date.UTC(year, month - 1, 1);
  const offset = new Date(first).getUTCDay();
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((offset + length) / 7);
  return Array.from({ length: weeks * 7 }, (_, index) => utcToKey(first + (index - offset) * DAY_MS));
}

/* --------------------------------- chips ---------------------------------- */

/** A wash of the status colour behind foreground text — never colour alone, never below AA. */
const CHIP_TONE: Record<MeetingStatus, string> = {
  requested: "bg-status-requested/12 ring-status-requested/30",
  developing: "bg-status-developing/12 ring-status-developing/30",
  clearance: "bg-status-clearance/12 ring-status-clearance/30",
  confirmed: "bg-status-confirmed/12 ring-status-confirmed/30",
  completed: "bg-status-completed/12 ring-status-completed/30",
  closed: "bg-status-closed/12 ring-status-closed/30",
  on_hold: "bg-status-on-hold/12 ring-status-on-hold/30",
  cancelled: "bg-status-cancelled/12 ring-status-cancelled/30",
};

const MAX_CHIPS = 3;

/* ------------------------------ the month grid ---------------------------- */

export type CalendarMonthProps = {
  year: number;
  month: number;
  /** Meetings already bucketed by Washington civil day. */
  byDay: ReadonlyMap<string, MeetingListItem[]>;
  todayKey: string;
  selectedDay: string | null;
  onSelectDay: (key: string) => void;
  onMonthChange: (year: number, month: number) => void;
  onToday: () => void;
  headingId: string;
  className?: string;
};

/**
 * One month of the program. Each square carries up to three meetings and a count of the
 * rest; choosing a square hands the day to the agenda beside it, where the whole list
 * has room to be read.
 */
export function CalendarMonth({ year, month, byDay, todayKey, selectedDay, onSelectDay, onMonthChange, onToday, headingId, className }: CalendarMonthProps) {
  const grid = monthGrid(year, month);
  const prefix = `${year}-${pad(month)}`;
  const step = (delta: number) => {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    onMonthChange(next.getUTCFullYear(), next.getUTCMonth() + 1);
  };

  return (
    <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-soft", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h3 id={headingId} className="heading-display text-xl leading-none">
          {monthLabel(year, month)}
        </h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => step(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onToday}>
            Today
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => step(1)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </header>

      {/* The grid scrolls inside the card on a narrow screen; the page never scrolls sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Meetings in {monthLabel(year, month)}, Washington time</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((weekday) => (
                <th key={weekday} scope="col" className="border-b px-2 py-1.5 text-center text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: grid.length / 7 }, (_, week) => (
              <tr key={week}>
                {grid.slice(week * 7, week * 7 + 7).map((key) => {
                  const meetings = byDay.get(key) ?? [];
                  const shown = meetings.slice(0, MAX_CHIPS);
                  const overflow = meetings.length - shown.length;
                  const outside = !key.startsWith(prefix);
                  const today = key === todayKey;
                  const selected = key === selectedDay;
                  const weekend = new Date(keyToUtc(key)).getUTCDay() % 6 === 0;
                  const full = dayLabel(key, "full");

                  return (
                    <td
                      key={key}
                      data-day={key}
                      data-today={today || undefined}
                      data-outside={outside || undefined}
                      className={cn(
                        "h-24 border-r border-b p-1 align-top last:border-r-0",
                        weekend && "bg-muted/25",
                        // Days from the neighbouring month recede by ground, not by opacity:
                        // dimming the whole cell drops its date and chips below 4.5:1.
                        outside && "bg-muted/60",
                        selected && "bg-primary/5 ring-2 ring-primary/40 ring-inset",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectDay(key)}
                        aria-pressed={selected}
                        aria-label={`${full}${meetings.length > 0 ? `, ${meetings.length} ${meetings.length === 1 ? "meeting" : "meetings"}` : ", nothing scheduled"}`}
                        className={cn(
                          "numeric mb-0.5 flex size-6 items-center justify-center rounded-full text-[0.6875rem] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          today && "bg-accent text-accent-foreground ring-1 ring-brand/60",
                          !today && "text-muted-foreground",
                        )}
                      >
                        {Number(key.slice(-2))}
                      </button>

                      <ul className="grid gap-0.5">
                        {shown.map((meeting) => (
                          <li key={meeting.id}>
                            <Link
                              href={`/meetings/${meeting.id}`}
                              title={`${meeting.code} · ${meeting.title} · ${STATUS_LABELS[meeting.status]}`}
                              className={cn(
                                "flex items-center gap-1 rounded px-1 py-0.5 text-[0.625rem] leading-tight font-medium text-foreground ring-1 ring-inset transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                                CHIP_TONE[meeting.status],
                              )}
                            >
                              <Flag code={meeting.countryCode} size={8} />
                              <span className="min-w-0 flex-1 truncate">{meeting.orgShortName ?? meeting.orgName}</span>
                              {meeting.ochAttending ? <Star className="size-2.5 shrink-0 fill-gold text-gold" aria-hidden /> : null}
                              <StatusDot status={meeting.status} className="size-1.5" />
                            </Link>
                          </li>
                        ))}
                      </ul>

                      {overflow > 0 ? (
                        <button
                          type="button"
                          onClick={() => onSelectDay(key)}
                          className="numeric mt-0.5 w-full rounded px-1 text-left text-[0.625rem] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          +{overflow} more
                        </button>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
