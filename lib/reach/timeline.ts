import { nyDate, nyParts } from "@/lib/domain/fiscal-year";
import { lens, meetingName, type ReachFilters, type ReachMeeting, startMs } from "@/lib/domain/reach";
import {
  addNyDays,
  addNyMonths,
  agendaDayLabel,
  dayGrain,
  dayLabel,
  inSpan,
  nyDayNumber,
  nyDaysIn,
  nyMonthsIn,
  nyYearsIn,
  type Span,
  spanDays,
  startOfNyDay,
  startOfNyMonth,
  startOfNyWeek,
  tickLabel,
  type TimelineView,
  timelineView,
} from "@/lib/domain/reach-time";
import { FORMAT_LABELS, MEETING_STATUSES, STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY } from "@/lib/format";

/**
 * The timeline's geometry, worked out before anything is drawn: the view the
 * span and the height call for, its bands, ticks and notes, and where every mark, chip, agenda row
 * and "+N" sits. The component only paints it. Days are Washington days, and the scale gives every
 * one the same width, even the two a year that daylight saving makes 23 or 25 hours long.
 */

export type TimelineScale = {
  /** Pixels across for an instant. */
  x(t: Date): number;
  /** The instant at a pixel, held inside the span. */
  invert(px: number): Date;
  pxPerDay: number;
};

export function timelineScale(span: Span, left: number, right: number): TimelineScale {
  const first = nyDayNumber(span.from);
  const days = Math.max(1, spanDays(span));
  const pxPerDay = (right - left) / days;
  const dayLength = (start: Date) => addNyDays(start, 1).getTime() - start.getTime();
  return {
    pxPerDay,
    x(t) {
      const start = startOfNyDay(t);
      return left + (nyDayNumber(t) - first + (t.getTime() - start.getTime()) / dayLength(start)) * pxPerDay;
    },
    invert(px) {
      const at = Math.min(days, Math.max(0, (px - left) / pxPerDay));
      const whole = Math.floor(at);
      if (whole >= days) return span.to;
      const start = addNyDays(span.from, whole);
      return new Date(start.getTime() + (at - whole) * dayLength(start));
    },
  };
}

export type TimelineBand = { x: number; width: number; kind: "weekend" | "today" | "alternate" };
/** A tick on the axis; its label sits centered in a day's column, or just right of a month's start. */
export type TimelineTick = { x: number; labelX: number; anchor: "start" | "middle"; label: string | null; today: boolean };
export type TimelineMark = { meeting: ReachMeeting; cx: number; cy: number };
export type TimelineChip = { meeting: ReachMeeting; left: number; top: number; width: number };
/** The "+3" that opens a day with more chips than its column holds. */
export type TimelineMore = { day: Date; left: number; top: number; width: number; count: number };
export type AgendaDay = {
  day: Date;
  left: number;
  width: number;
  /** "Today · Mon, Sep 28": the day button, which toggles a one-day window. */
  label: string;
  today: boolean;
  rows: { meeting: ReachMeeting; top: number }[];
  more: { top: number; count: number } | null;
};

export type TimelineLayout = {
  view: TimelineView;
  scale: TimelineScale;
  /** The strip where the marks, chips and rows sit and the drag window runs. */
  left: number;
  right: number;
  top: number;
  base: number;
  /** A day's column in the day views; 0 when the timeline reads by week. */
  columnWidth: number;
  bands: TimelineBand[];
  years: { x: number; label: string }[];
  ticks: TimelineTick[];
  /** The lines between the agenda's days. */
  dividers: number[];
  today: { x: number; flip: boolean } | null;
  note: { x: number; y: number; text: string } | null;
  markSize: number;
  marks: TimelineMark[];
  chips: TimelineChip[];
  more: TimelineMore[];
  days: AgendaDay[];
};

export const TIMELINE_SIDE = 16;
/** The room above and below the strip, per view: the agenda's day buttons sit on top, the other views' axis below. */
const MARGINS: Record<TimelineView, { top: number; bottom: number }> = {
  weeks: { top: 8, bottom: 22 },
  days: { top: 8, bottom: 22 },
  agenda: { top: 21, bottom: 3 },
  compact: { top: 5, bottom: 17 },
};
export const CHIP_HEIGHT = 16;
const CHIP_GAP = 2;
const CHIP_WIDTH = 44;
export const ROW_HEIGHT = 15;
/** How far apart month labels must be; with the year, "Jan 2026" needs about this much. */
const MONTH_LABEL_ROOM = 48;
const MONTH_STEPS = [1, 2, 3, 6, 12];
const YEAR_LABEL_ROOM = 44;
/** A stretch past the last booking shorter than this needs no note. */
const NOTE_ROOM = 280;
const AVERAGE_MONTH_DAYS = 30.44;

const STATUS_RANK = new Map<string, number>(MEETING_STATUSES.map((status, i) => [status, i]));
const startOf = (m: ReachMeeting) => new Date(startMs(m));

/** The range's dated meetings through the filters, in the order they stack: by date, then by status. */
export function timelineMeetings(meetings: readonly ReachMeeting[], filters: ReachFilters, range: Span): ReachMeeting[] {
  return lens(meetings, filters, range).sort((a, b) => startMs(a) - startMs(b) || (STATUS_RANK.get(a.status) ?? 0) - (STATUS_RANK.get(b.status) ?? 0));
}

function groupBy(meetings: readonly ReachMeeting[], key: (m: ReachMeeting) => number): Map<number, ReachMeeting[]> {
  const groups = new Map<number, ReachMeeting[]>();
  for (const m of meetings) {
    const k = key(m);
    const group = groups.get(k);
    if (group) group.push(m);
    else groups.set(k, [m]);
  }
  return groups;
}

function isWeekend(day: Date): boolean {
  const { year, month, day: date } = nyParts(day);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export type TimelineInput = {
  span: Span;
  width: number;
  height: number;
  /** The range's meetings, as `timelineMeetings` orders them. */
  meetings: readonly ReachMeeting[];
  now: Date;
  /** The program's last dated meeting, whatever the filters: where the calendar runs out. */
  lastBooked: Date | null;
};

/** The whole drawing for a range at a size, or null for a box too small to read. */
export function timelineLayout({ span, width, height, meetings, now, lastBooked }: TimelineInput): TimelineLayout | null {
  if (width < 50 || height < 30) return null;
  const view = timelineView(span, height);
  const byDay = dayGrain(span);
  const left = TIMELINE_SIDE;
  const right = width - TIMELINE_SIDE;
  const top = MARGINS[view].top;
  const base = height - MARGINS[view].bottom;
  const scale = timelineScale(span, left, right);
  const columnWidth = byDay ? scale.pxPerDay : 0;
  const days = byDay ? nyDaysIn(span) : [];
  const today = nyDayNumber(now);
  const layout: TimelineLayout = { view, scale, left, right, top, base, columnWidth, bands: [], years: [], ticks: [], dividers: [], today: null, note: null, markSize: 0, marks: [], chips: [], more: [], days: [] };

  // Quiet structure: weekends and today by day; alternate months, or alternate years past 400 days.
  if (byDay) {
    for (const d of days) {
      const isToday = nyDayNumber(d) === today;
      if (isToday || isWeekend(d)) layout.bands.push({ x: scale.x(d), width: columnWidth, kind: isToday ? "today" : "weekend" });
    }
    if (view === "agenda") layout.dividers = days.slice(1).map((d) => Math.round(scale.x(d)) + 0.5);
  } else if (spanDays(span) > 400) {
    nyYearsIn(span).forEach((y, i) => {
      const x0 = Math.max(left, scale.x(y));
      const x1 = Math.min(right, scale.x(nyDate(nyParts(y).year + 1, 1, 1)));
      if (i % 2 === 1) layout.bands.push({ x: x0, width: x1 - x0, kind: "alternate" });
      if (view !== "compact" && x1 - x0 > YEAR_LABEL_ROOM) layout.years.push({ x: x0 + 6, label: String(nyParts(y).year) });
    });
  } else {
    for (let m = startOfNyMonth(span.from); m.getTime() < span.to.getTime(); m = addNyMonths(m, 1)) {
      if (nyParts(m).month % 2 !== 0) continue;
      const x0 = Math.max(left, scale.x(m));
      layout.bands.push({ x: x0, width: Math.min(right, scale.x(addNyMonths(m, 1))) - x0, kind: "alternate" });
    }
  }

  // The axis: every day in the day views; months otherwise, labeled as often as they fit.
  if (view !== "agenda") {
    if (byDay) {
      layout.ticks = days.map((d) => ({ x: scale.x(d), labelX: scale.x(d) + columnWidth / 2, anchor: "middle", label: dayLabel(d, columnWidth, now), today: nyDayNumber(d) === today }));
    } else {
      const perMonth = scale.pxPerDay * AVERAGE_MONTH_DAYS;
      const step = MONTH_STEPS.find((k) => k * perMonth >= MONTH_LABEL_ROOM) ?? 12;
      let first = true;
      for (const m of nyMonthsIn(span)) {
        const labeled = (nyParts(m).month - 1) % step === 0;
        if (!labeled && perMonth < 8) continue;
        layout.ticks.push({ x: scale.x(m), labelX: scale.x(m) + 3, anchor: "start", label: labeled ? tickLabel(m, first) : null, today: false });
        if (labeled) first = false;
      }
    }
  }

  if (!byDay && inSpan(now, span)) {
    const x = scale.x(now);
    layout.today = { x, flip: x - left < 44 };
  }

  // Say plainly where the calendar runs out, rather than leave a blank stretch to be read as a gap.
  const middle = (top + base) / 2;
  if (view === "weeks" && lastBooked && lastBooked.getTime() < span.to.getTime() && right - scale.x(lastBooked) > NOTE_ROOM) {
    layout.note = { x: (Math.max(left, scale.x(lastBooked)) + right) / 2, y: middle, text: `Nothing booked after ${formatDateNY(lastBooked, "short")}` };
  } else if ((view === "weeks" || view === "days") && meetings.length === 0) {
    layout.note = { x: (left + right) / 2, y: middle, text: "Nothing scheduled in these days" };
  }

  if (view === "days") placeChips(layout, meetings);
  else if (view === "agenda") placeAgenda(layout, meetings, days, now);
  else placeMarks(layout, meetings, byDay, view === "compact");
  return layout;
}

/**
 * One mark per meeting, stacked from the axis up in its week (its day in a short range). The
 * marks take the largest size at which the busiest week still fits, spilling into a second column
 * before they shrink, so one meeting is never stretched to fill a column.
 */
function placeMarks(layout: TimelineLayout, meetings: readonly ReachMeeting[], byDay: boolean, compact: boolean) {
  const { scale, left, right, top, base } = layout;
  const groups = groupBy(meetings, (m) => (byDay ? startOfNyDay(startOf(m)) : startOfNyWeek(startOf(m))).getTime());
  const deepest = Math.max(1, ...[...groups.values()].map((g) => g.length));
  const column = scale.pxPerDay * (byDay ? 1 : 7);
  const room = base - top - (compact ? 4 : 8);
  let size = 3;
  let gap = 0.75;
  let rows = 1;
  for (let s = compact ? 6 : 9; s >= 3; s -= 0.5) {
    const g = Math.min(2, s / 4);
    const cols = Math.max(1, Math.floor((column - 1 + g) / (s + g)));
    size = s;
    gap = g;
    rows = Math.max(1, Math.floor((room + g) / (s + g)));
    if (cols * rows >= deepest) break;
  }
  layout.markSize = size;
  for (const [key, group] of groups) {
    const start = new Date(key);
    const center = (scale.x(start) + scale.x(addNyDays(start, byDay ? 1 : 7))) / 2;
    const used = Math.ceil(group.length / rows);
    group.forEach((meeting, k) => {
      const cx = center + (Math.floor(k / rows) - (used - 1) / 2) * (size + gap);
      layout.marks.push({ meeting, cx: Math.max(left + size / 2, Math.min(right - size / 2, cx)), cy: base - 3 - (k % rows) * (size + gap) - size / 2 });
    });
  }
}

/** One chip per meeting in its day's column, from the axis up; a day with more than fit ends in "+N". */
function placeChips(layout: TimelineLayout, meetings: readonly ReachMeeting[]) {
  const { scale, columnWidth, top, base } = layout;
  const width = Math.min(columnWidth - 6, CHIP_WIDTH);
  const cap = Math.max(1, Math.floor((base - top - 4) / (CHIP_HEIGHT + CHIP_GAP)));
  for (const [key, group] of groupBy(meetings, (m) => startOfNyDay(startOf(m)).getTime())) {
    const day = new Date(key);
    const left = scale.x(day) + (columnWidth - width) / 2;
    const over = group.length > cap;
    (over ? group.slice(0, cap - 1) : group).forEach((meeting, k) => layout.chips.push({ meeting, left, top: base - 3 - (k + 1) * (CHIP_HEIGHT + CHIP_GAP) + CHIP_GAP, width }));
    if (over) layout.more.push({ day, left, top: base - 3 - cap * (CHIP_HEIGHT + CHIP_GAP) + CHIP_GAP, width, count: group.length - cap + 1 });
  }
}

/** A column per day under its day button, rows in time order, and "+N more" past the room. */
function placeAgenda(layout: TimelineLayout, meetings: readonly ReachMeeting[], days: readonly Date[], now: Date) {
  const { scale, columnWidth, top, base } = layout;
  const cap = Math.max(1, Math.floor((base - top) / ROW_HEIGHT));
  const groups = groupBy(meetings, (m) => startOfNyDay(startOf(m)).getTime());
  layout.days = days.map((day) => {
    const group = groups.get(day.getTime()) ?? [];
    const over = group.length > cap;
    return {
      day,
      left: scale.x(day) + 3,
      width: columnWidth - 6,
      label: agendaDayLabel(day, now),
      today: nyDayNumber(day) === nyDayNumber(now),
      rows: (over ? group.slice(0, cap - 1) : group).map((meeting, k) => ({ meeting, top: top + k * ROW_HEIGHT })),
      more: over ? { top: top + (cap - 1) * ROW_HEIGHT, count: group.length - cap + 1 } : null,
    };
  });
}

/* --------------------------------- window --------------------------------- */

const clampTo = (t: Date, range: Span): Date => new Date(Math.min(range.to.getTime(), Math.max(range.from.getTime(), t.getTime())));

/** The Washington midnight nearest an instant. */
function nearestNyDay(t: Date): Date {
  const start = startOfNyDay(t);
  const next = addNyDays(start, 1);
  return t.getTime() - start.getTime() < next.getTime() - t.getTime() ? start : next;
}

/** A drag in a day view, snapped to whole days when it ends: never empty, never outside the range. */
export function snapWindow(window: Span, range: Span): Span {
  const from = clampTo(nearestNyDay(window.from), range);
  const to = clampTo(nearestNyDay(window.to), range);
  if (to.getTime() > from.getTime()) return { from, to };
  const after = addNyDays(from, 1);
  return after.getTime() <= range.to.getTime() ? { from, to: after } : { from: addNyDays(range.to, -1), to: range.to };
}

/** The same date `n` months on, or that month's last day when it is shorter. */
function addNyMonthsKeepingDay(d: Date, n: number): Date {
  const { year, month, day } = nyParts(d);
  const last = new Date(Date.UTC(year, month + n, 0)).getUTCDate();
  return nyDate(year, month + n, Math.min(day, last));
}

export type WindowEdge = "from" | "to";

/**
 * One key press on a window slider. The arrow keys move the edge a day in
 * the day views and a week otherwise, Page Up and Page Down a month, and Home and End to the
 * range's ends. An edge never passes the other: the window keeps at least a day. Null for any
 * other key.
 */
export function stepWindow(window: Span, edge: WindowEdge, key: string, range: Span, byDay: boolean): Span | null {
  const at = edge === "from" ? window.from : window.to;
  const unit = byDay ? 1 : 7;
  const moves: Record<string, () => Date> = {
    ArrowLeft: () => addNyDays(at, -unit),
    ArrowDown: () => addNyDays(at, -unit),
    ArrowRight: () => addNyDays(at, unit),
    ArrowUp: () => addNyDays(at, unit),
    PageDown: () => addNyMonthsKeepingDay(at, -1),
    PageUp: () => addNyMonthsKeepingDay(at, 1),
    Home: () => range.from,
    End: () => range.to,
  };
  const move = moves[key];
  if (!move) return null;
  const next = move().getTime();
  if (edge === "from") {
    const latest = addNyDays(window.to, -1).getTime();
    return { from: new Date(Math.min(latest, Math.max(range.from.getTime(), next))), to: window.to };
  }
  const earliest = addNyDays(window.from, 1).getTime();
  return { from: window.from, to: new Date(Math.max(earliest, Math.min(range.to.getTime(), next))) };
}

/** The last day a window includes: the day before its end, or the day it stops in partway. */
export function lastDay(window: Span): Date {
  const start = startOfNyDay(window.to);
  return start.getTime() === window.to.getTime() ? addNyDays(start, -1) : start;
}

/* --------------------------------- fading --------------------------------- */

export type Fade = "in" | "out" | "dim";

/**
 * How a meeting stands on the timeline: in the window at full strength, outside it faded, and
 * dimmed further while another country is lit or selected (`focus`). A visit counts as lit when
 * the lit country is any of its countries.
 */
export function fadeOf(m: ReachMeeting, window: Span, focus: string | null): Fade {
  if (focus && !m.countries.includes(focus)) return "dim";
  return m.start && inSpan(m.start, window) ? "in" : "out";
}

const OPACITY: Record<Fade, number> = { in: 1, out: 0.25, dim: 0.14 };

/** A mark's strength, for marks that carry no text: a proposed date is drawn at half strength. */
export const markOpacity = (m: ReachMeeting, fade: Fade): number => (fade === "in" && m.proposed ? 0.5 : OPACITY[fade]);

/* ---------------------------------- names --------------------------------- */

/** An agenda row's name starts with what the row shows, its time and country (WCAG 2.5.3), then names the meeting as its chip does. */
export const rowName = (m: ReachMeeting, nameOf: (cca2: string) => string): string => `${formatDateNY(startOf(m), "time")}, ${meetingName(m, nameOf)}`;

/** A mark's tooltip, three lines: countries and date; organization and time; format and status. */
export function markTip(m: ReachMeeting, nameOf: (cca2: string) => string): [string, string, string] {
  const start = startOf(m);
  const countries = m.countries.length > 0 ? m.countries.map(nameOf).join(", ") : "United States";
  return [
    `${countries} · ${formatDateNY(start, "short")}${m.proposed ? " (proposed)" : ""}`,
    `${m.orgName} · ${formatDateNY(start, "time")} ET`,
    `${FORMAT_LABELS[m.format]} · ${STATUS_LABELS[m.status]}`,
  ];
}
