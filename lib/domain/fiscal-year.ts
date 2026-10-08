/**
 * Federal fiscal year helpers (Oct 1 – Sep 30), evaluated on New York wall-clock time.
 * Pure functions; all inputs/outputs are UTC instants.
 */

export const NY_TZ = "America/New_York";

const dateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const dateTimeParts = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

function partsToRecord(parts: Intl.DateTimeFormatPart[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

/** Calendar date of an instant as seen in New York. */
export function nyParts(date: Date): { year: number; month: number; day: number } {
  const p = partsToRecord(dateParts.formatToParts(date));
  return { year: p.year ?? 0, month: p.month ?? 0, day: p.day ?? 0 };
}

/** Fiscal year of an instant: months Oct–Dec belong to the following calendar year's FY. */
export function fiscalYearOf(date: Date): number {
  const { year, month } = nyParts(date);
  return month >= 10 ? year + 1 : year;
}

/** UTC instant for a New York wall-clock time (handles DST). */
export function nyDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const seen = partsToRecord(dateTimeParts.formatToParts(new Date(guess)));
  const seenAsUtc = Date.UTC(seen.year ?? 0, (seen.month ?? 1) - 1, seen.day ?? 1, seen.hour ?? 0, seen.minute ?? 0, seen.second ?? 0, ms);
  // guess rendered as `seenAsUtc` in NY; shift by the difference to land on the requested wall clock.
  return new Date(guess + (guess - seenAsUtc));
}

/** Inclusive [Oct 1 00:00:00.000, Sep 30 23:59:59.999] in New York time. */
export function fiscalYearRange(fy: number): { start: Date; end: Date } {
  return { start: nyDate(fy - 1, 10, 1), end: nyDate(fy, 9, 30, 23, 59, 59, 999) };
}

/** 0 = October … 11 = September. */
export function fiscalMonthIndex(date: Date): number {
  const { month } = nyParts(date);
  return (month - 10 + 12) % 12;
}

export const FISCAL_MONTH_LABELS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"] as const;

/** Day-of-fiscal-year (1-based) and the year's length, using calendar days (DST-safe). */
export function fiscalYearProgress(date: Date): { fy: number; dayIndex: number; dayCount: number } {
  const fy = fiscalYearOf(date);
  const DAY = 86_400_000;
  const startDay = Date.UTC(fy - 1, 9, 1);
  const endDayExclusive = Date.UTC(fy, 9, 1);
  const { year, month, day } = nyParts(date);
  const today = Date.UTC(year, month - 1, day);
  return {
    fy,
    dayIndex: Math.round((today - startDay) / DAY) + 1,
    dayCount: Math.round((endDayExclusive - startDay) / DAY),
  };
}
