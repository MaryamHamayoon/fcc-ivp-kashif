import { nyDate, nyParts } from "./fiscal-year";

/**
 * The date arithmetic behind the program-wide activity feed: which Washington day and week an
 * entry belongs to, what "the last 7 days" means, how entries fall into the weekly pulse, and
 * how a long list is paged. Pure functions; every instant in and out is UTC.
 */

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Civil dates ride as UTC midnights, so day arithmetic is exact and daylight saving cannot bend it. */
const keyOf = (utc: number) => {
  const d = new Date(utc);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

function utcOf(key: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new RangeError(`Not a day: ${key}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** The Washington calendar day an instant falls on, as `YYYY-MM-DD`. */
export function dayKeyOf(instant: Date): string {
  const { year, month, day } = nyParts(instant);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Washington midnight at the start of a civil day. */
function startOfDay(key: string): Date {
  const d = new Date(utcOf(key));
  return nyDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** The Monday that opens the Washington week an instant falls in. */
export function weekStartKey(instant: Date): string {
  const day = utcOf(dayKeyOf(instant));
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  return keyOf(day - sinceMonday * DAY_MS);
}

/** [Monday 00:00, the next Monday 00:00) in Washington, as instants. */
export function weekRange(week: string): { start: Date; end: Date } {
  return { start: startOfDay(week), end: startOfDay(keyOf(utcOf(week) + 7 * DAY_MS)) };
}

export const ACTIVITY_WINDOWS = ["today", "7d", "30d", "90d"] as const;
export type ActivityWindow = (typeof ACTIVITY_WINDOWS)[number];

const WINDOW_DAYS: Record<ActivityWindow, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

/** Where a window opens: today counts as one of its days, so "7d" is today and the six before. */
export function sinceFor(window: ActivityWindow, now: Date): Date {
  return startOfDay(keyOf(utcOf(dayKeyOf(now)) - (WINDOW_DAYS[window] - 1) * DAY_MS));
}

/** The last `count` weeks as Monday keys, oldest first, ending on the week `now` is in. */
export function pulseWeeks(now: Date, count: number): string[] {
  const current = utcOf(weekStartKey(now));
  return Array.from({ length: count }, (_, i) => keyOf(current - (count - 1 - i) * 7 * DAY_MS));
}

export type PulseWeek = { week: string; count: number };

/** How many of `instants` fall in each of `weeks`; anything outside them is not counted. */
export function bucketByWeek(instants: Date[], weeks: string[]): PulseWeek[] {
  const counts = new Map(weeks.map((week) => [week, 0]));
  for (const instant of instants) {
    const week = weekStartKey(instant);
    if (counts.has(week)) counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return weeks.map((week) => ({ week, count: counts.get(week) ?? 0 }));
}

const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/** "Aug 17 – 23", or "Aug 31 – Sep 6" when the week runs into the next month. */
export function weekLabel(week: string): string {
  const monday = new Date(utcOf(week));
  const sunday = new Date(utcOf(week) + 6 * DAY_MS);
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  return `${monthDay.format(monday)} – ${sameMonth ? sunday.getUTCDate() : monthDay.format(sunday)}`;
}

const monthName = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });

/** A month is four or five weeks wide; a name needs that much room before the next one begins. */
const TICK_ROOM = 4;

/**
 * The time axis under a run of weeks: the month's name on the first week that opens in it,
 * nothing under the rest. The strip usually starts mid-month; its first weeks stay bare unless
 * their month still has room to run, so two names never sit shoulder to shoulder.
 */
export function monthTicks(weeks: string[]): (string | null)[] {
  const months = weeks.map((week) => monthName.format(new Date(utcOf(week))));
  return months.map((month, i) => {
    if (i > 0) return month === months[i - 1] ? null : month;
    const next = months.findIndex((other) => other !== month);
    return next === -1 || next >= TICK_ROOM ? month : null;
  });
}

const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const dayLabelWithYear = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** "Today", "Yesterday", then "Thu, Aug 20" — with the year once it is not this one. */
export function dayHeading(key: string, now: Date): string {
  const today = dayKeyOf(now);
  if (key === today) return "Today";
  if (utcOf(today) - utcOf(key) === DAY_MS) return "Yesterday";
  return (key.slice(0, 4) === today.slice(0, 4) ? dayLabel : dayLabelWithYear).format(new Date(utcOf(key)));
}

export type DayGroup<T> = { key: string; label: string; items: T[] };

/** Consecutive entries gathered under the Washington day they happened on, in the order given. */
export function groupByDay<T extends { occurredAt: Date }>(items: T[], now: Date): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = dayKeyOf(item.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayHeading(key, now), items: [item] });
  }
  return groups;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** First, last and the pages either side of the current one; "gap" wherever pages are skipped. */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  // At either end, keep three in a row so the control does not change width from page to page.
  if (page <= 2) for (const p of [2, 3]) if (p <= pages) wanted.add(p);
  if (page >= pages - 1) for (const p of [pages - 1, pages - 2]) if (p >= 1) wanted.add(p);
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const [i, p] of sorted.entries()) {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && p - prev > 2) out.push("gap");
    out.push(p);
  }
  return out;
}
