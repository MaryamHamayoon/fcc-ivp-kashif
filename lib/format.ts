/**
 * Display formatting. Every date in IVP is shown in Washington time
 * (America/New_York) regardless of where the reader sits — the program runs
 * on the Commission's clock, and mixing zones is how visits get missed.
 */
export const DISPLAY_TZ = "America/New_York";

export type DateStyle = "short" | "long" | "day" | "time" | "month" | "monthday" | "weekday" | "full";

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { month: "short", day: "numeric", year: "numeric" },
  long: { month: "long", day: "numeric", year: "numeric" },
  day: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
  time: { hour: "numeric", minute: "2-digit" },
  month: { month: "short", year: "numeric" },
  monthday: { month: "short", day: "numeric" },
  weekday: { weekday: "short", month: "short", day: "numeric" },
  full: { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" },
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TZ, ...options });
    formatters.set(key, f);
  }
  return f;
}

/** ICU inserts narrow no-break spaces before AM/PM; normalize so strings compare and wrap predictably. */
const tidy = (s: string) => s.replace(/[  ]/g, " ");

export type DateInput = Date | string | number;

export function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateNY(value: DateInput, style: DateStyle = "short"): string {
  return formatNY(value, OPTIONS[style]);
}

/** Any other date shape, still in Washington time: "October 2026", "Tue", "Oct". */
export function formatNY(value: DateInput, options: Intl.DateTimeFormatOptions): string {
  return tidy(formatter(options).format(toDate(value)));
}

function monthDay(d: Date): string {
  return formatDateNY(d, "monthday");
}

function sameNyDay(a: Date, b: Date): boolean {
  return formatDateNY(a, "short") === formatDateNY(b, "short");
}

/**
 * "Aug 29, 2026 · 10:00–11:30 AM" for a same-day range, "Aug 29 – Sep 2, 2026"
 * across days, "Aug 29, 2026 · 10:00 AM" when there is no end.
 */
export function formatRange(start: DateInput, end?: DateInput | null): string {
  const s = toDate(start);
  if (end == null) return `${formatDateNY(s, "short")} · ${formatDateNY(s, "time")}`;
  const e = toDate(end);
  if (sameNyDay(s, e)) {
    const t1 = formatDateNY(s, "time");
    const t2 = formatDateNY(e, "time");
    const suffix = t1.slice(-3);
    const shared = suffix === t2.slice(-3);
    return `${formatDateNY(s, "short")} · ${shared ? t1.slice(0, -3) : t1}–${t2}`;
  }
  const sameYear = formatDateNY(s, "month").slice(-4) === formatDateNY(e, "month").slice(-4);
  return sameYear ? `${monthDay(s)} – ${formatDateNY(e, "short")}` : `${formatDateNY(s, "short")} – ${formatDateNY(e, "short")}`;
}

const numberFormat = new Intl.NumberFormat("en-US");

export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/** "1 meeting", "3 countries", "1,204 participants". */
export function countOf(n: number, word: string, plural = `${word}s`): string {
  return `${formatNumber(n)} ${n === 1 ? word : plural}`;
}

/** Calendar-day ordinal in Washington time, for "days between" arithmetic that ignores clock time. */
function nyDayOrdinal(d: Date): number {
  const parts = formatter({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Math.round(Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000);
}

const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "today", "yesterday", "3 days ago", "in 2 weeks" — coarse on purpose; exact stamps live in tooltips. */
export function relativeAge(value: DateInput, now: DateInput = new Date()): string {
  const diff = nyDayOrdinal(toDate(value)) - nyDayOrdinal(toDate(now));
  if (diff === 0) return "today";
  if (diff === -1) return "yesterday";
  if (diff === 1) return "tomorrow";
  const n = Math.abs(diff);
  const phrase = n < 7 ? unit(n, "day") : n < 30 ? unit(Math.round(n / 7), "week") : n < 365 ? unit(Math.round(n / 30), "month") : unit(Math.round(n / 365), "year");
  return diff < 0 ? `${phrase} ago` : `in ${phrase}`;
}

/** Initials for avatars: "Dana Whitfield" → "DW", "Cher" → "C". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * A written phone number as a `tel:` link. Ten digits are read as a US number; a leading "+"
 * keeps whatever country it names; an extension is left off, because a dialler would run it
 * into the number. Null when there is nothing to dial.
 */
export function telHref(phone: string): string | null {
  const main = phone.split(/\s*(?:ext\.?|x)\s*\d+\s*$/i)[0] ?? "";
  const digits = main.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (main.trim().startsWith("+")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:${digits}`;
}
