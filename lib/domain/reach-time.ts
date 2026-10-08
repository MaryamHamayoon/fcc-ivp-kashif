import { formatDateNY, formatNY, formatRange } from "@/lib/format";
import { nyDate, nyParts } from "./fiscal-year";

/**
 * The map's calendar. Every range, day, week and month is counted in Washington time, the
 * program's clock, whatever zone the reader's browser is in: a visit at 11:30 PM on December 31
 * in Washington belongs to that year even for a reader in Tokyo. Nothing here reads the local
 * clock (no getDate, getDay or getFullYear, and no d3-time, which counts in the reader's zone).
 * Pure functions; every instant in and out is UTC.
 */

export const DAY_MS = 86_400_000;

/** A stretch of time that includes `from` and stops just before `to`. */
export type Span = { from: Date; to: Date };

export const inSpan = (t: Date, span: Span): boolean => t.getTime() >= span.from.getTime() && t.getTime() < span.to.getTime();

export const RANGE_KEYS = ["all", "last", "this", "next365", "next30", "next7"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  all: "All",
  last: "Last year",
  this: "This year",
  next365: "Next 365 days",
  next30: "Next 30 days",
  next7: "Next 7 days",
};

export const isRangeKey = (value: unknown): value is RangeKey => typeof value === "string" && (RANGE_KEYS as readonly string[]).includes(value);

/** Washington midnight at the start of the day `d` falls on. */
export function startOfNyDay(d: Date): Date {
  const { year, month, day } = nyParts(d);
  return nyDate(year, month, day);
}

/** Washington midnight `n` calendar days after the day `d` falls on; a daylight-saving day still counts as one. */
export function addNyDays(d: Date, n: number): Date {
  const { year, month, day } = nyParts(d);
  return nyDate(year, month, day + n);
}

/** The Sunday that opens the Washington week `d` falls in. */
export function startOfNyWeek(d: Date): Date {
  const { year, month, day } = nyParts(d);
  return nyDate(year, month, day - new Date(Date.UTC(year, month - 1, day)).getUTCDay());
}

export function startOfNyMonth(d: Date): Date {
  const { year, month } = nyParts(d);
  return nyDate(year, month, 1);
}

/** The first of the month `n` months after the month `d` falls in. */
export function addNyMonths(d: Date, n: number): Date {
  const { year, month } = nyParts(d);
  return nyDate(year, month + n, 1);
}

export function startOfNyYear(d: Date): Date {
  return nyDate(nyParts(d).year, 1, 1);
}

/** A whole-day number for the Washington date `d` falls on, for day counts that ignore the clock. */
export function nyDayNumber(d: Date): number {
  const { year, month, day } = nyParts(d);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

/** How many calendar days a span covers. */
export const spanDays = (span: Span): number => nyDayNumber(span.to) - nyDayNumber(span.from);

const NEXT_DAYS = { next365: 365, next30: 30, next7: 7 } as const;

/**
 * The span a range button stands for. All runs from the month of the first dated meeting to the
 * end of the month of the last (this year when nothing is dated); Last year and This year are
 * January to December; the Next ranges start at 00:00 in Washington today.
 */
export function rangeSpan(key: RangeKey, now: Date, dated: readonly Date[] = []): Span {
  const { year } = nyParts(now);
  switch (key) {
    case "all": {
      if (dated.length === 0) return rangeSpan("this", now);
      const times = dated.map((d) => d.getTime());
      const first = times.reduce((a, b) => Math.min(a, b));
      const last = times.reduce((a, b) => Math.max(a, b));
      return { from: startOfNyMonth(new Date(first)), to: addNyMonths(new Date(last), 1) };
    }
    case "last":
      return { from: nyDate(year - 1, 1, 1), to: nyDate(year, 1, 1) };
    case "this":
      return { from: nyDate(year, 1, 1), to: nyDate(year + 1, 1, 1) };
    default:
      return { from: startOfNyDay(now), to: addNyDays(now, NEXT_DAYS[key]) };
  }
}

export type TimelineView = "weeks" | "days" | "agenda" | "compact";

/** Whether a span reads a day at a time (32 days or fewer) rather than a week at a time. */
export const dayGrain = (span: Span): boolean => spanDays(span) <= 32;

/** Longer than 32 days reads by week, 9 to 32 by day, 8 or fewer as an agenda; a strip under 80 px gets compact marks. */
export function timelineView(span: Span, height: number): TimelineView {
  if (height < 80) return "compact";
  const days = spanDays(span);
  if (days <= 8) return "agenda";
  return days <= 32 ? "days" : "weeks";
}

/** Washington midnights from the day `from` falls on, up to `to`. */
export function nyDaysIn(span: Span): Date[] {
  const out: Date[] = [];
  for (let d = startOfNyDay(span.from); d.getTime() < span.to.getTime(); d = addNyDays(d, 1)) out.push(d);
  return out;
}

/** Month starts at or after `from` and before `to`: the timeline's ticks. */
export function nyMonthsIn(span: Span): Date[] {
  const out: Date[] = [];
  let m = startOfNyMonth(span.from);
  if (m.getTime() < span.from.getTime()) m = addNyMonths(m, 1);
  for (; m.getTime() < span.to.getTime(); m = addNyMonths(m, 1)) out.push(m);
  return out;
}

/** Year starts from the year `from` falls in, up to `to`: for banding alternate years. */
export function nyYearsIn(span: Span): Date[] {
  const out: Date[] = [];
  for (let y = startOfNyYear(span.from); y.getTime() < span.to.getTime(); y = nyDate(nyParts(y).year + 1, 1, 1)) out.push(y);
  return out;
}

/** "October 2026". */
export const monthLabel = (d: Date): string => formatNY(d, { month: "long", year: "numeric" });

/** Upcoming meetings group by calendar week, Sunday to Saturday, then by month. */
export function groupLabel(date: Date, now: Date): string {
  const weeks = Math.round((nyDayNumber(startOfNyWeek(date)) - nyDayNumber(startOfNyWeek(now))) / 7);
  if (weeks === 0) return "This week";
  if (weeks === 1) return "Next week";
  return monthLabel(date);
}

/** "Jan 1 – Dec 31, 2026", "Dec 1, 2026 – Jan 31, 2027", or "Mon, Sep 28, 2026" for a single day. */
export function rangeText(span: Span): string {
  const last = new Date(span.to.getTime() - 1);
  if (nyDayNumber(span.from) === nyDayNumber(last)) return `${formatDateNY(span.from, "weekday")}, ${nyParts(span.from).year}`;
  return formatRange(span.from, last);
}

/** The window as a fact: "This year · Jan 1 – Dec 31, 2026", or only the dates once the reader has narrowed it. */
export const windowText = (range: RangeKey, span: Span, narrowed: boolean): string => (narrowed ? rangeText(span) : `${RANGE_LABELS[range]} · ${rangeText(span)}`);

/** A day column's label, as room allows: "Tue, Sep 29"; "Tue 29" or "Oct 1"; "29" or "Oct". Today reads "Today" once there is room. */
export function dayLabel(day: Date, columnWidth: number, now: Date): string {
  if (columnWidth >= 38 && nyDayNumber(day) === nyDayNumber(now)) return "Today";
  if (columnWidth >= 90) return formatDateNY(day, "weekday");
  const date = nyParts(day).day;
  if (columnWidth >= 38) return date === 1 ? formatDateNY(day, "monthday") : `${formatNY(day, { weekday: "short" })} ${date}`;
  return date === 1 ? formatNY(day, { month: "short" }) : String(date);
}

/** The agenda's day button: "Today · Mon, Sep 28", or "Tue, Sep 29". */
export function agendaDayLabel(day: Date, now: Date): string {
  const text = formatDateNY(day, "weekday");
  return nyDayNumber(day) === nyDayNumber(now) ? `Today · ${text}` : text;
}

/** A month tick: the year rides on January and on the first tick. */
export const tickLabel = (month: Date, isFirst: boolean): string => (isFirst || nyParts(month).month === 1 ? formatDateNY(month, "month") : formatNY(month, { month: "short" }));

/** "today", "tomorrow", "in 12 days", "yesterday", "3 days ago": exact calendar days, where `relativeAge` rounds to weeks. */
export function dayDistance(date: Date, now: Date): string {
  const n = nyDayNumber(date) - nyDayNumber(now);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
