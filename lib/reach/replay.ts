import { addNyDays, DAY_MS, type RangeKey, type Span, spanDays } from "@/lib/domain/reach-time";
import { formatNY } from "@/lib/format";

/**
 * Replay sweeps a moving 30-day window across a range so a reader can watch a year, or the whole
 * program, arrive meeting by meeting. It exists only for ranges of 90 days or more — anything
 * shorter is already one glance. Every function here is pure; `components/reach/useReplay` is the
 * only place that owns a clock.
 */

/** The width of the window Replay sweeps. */
export const REPLAY_DAYS = 30;

/** Replay exists only for ranges at least this many days long. */
export const REPLAY_MIN_DAYS = 90;

/** Whether a span is long enough for Replay to offer. */
export function canReplay(span: Span): boolean {
  return spanDays(span) >= REPLAY_MIN_DAYS;
}

/** How long the window takes to sweep the whole span: 12 to 36 seconds, in ms. */
export function replayMs(span: Span): number {
  const seconds = (spanDays(span) - REPLAY_DAYS) / 14;
  return Math.max(12, Math.min(36, seconds)) * 1000;
}

/**
 * The 30-day window at `progress` (0 at the span's start, 1 at its end); progress outside 0..1 is
 * clamped. This is the moving replay's clock: continuous milliseconds, not a calendar count, so a
 * frame can land anywhere inside a day.
 */
export function replayWindow(span: Span, progress: number): Span {
  const clamped = Math.min(1, Math.max(0, progress));
  const travel = span.to.getTime() - span.from.getTime() - REPLAY_DAYS * DAY_MS;
  const from = span.from.getTime() + clamped * travel;
  return { from: new Date(from), to: new Date(from + REPLAY_DAYS * DAY_MS) };
}

/** How many weekly steps reduced motion takes to cross the span. */
export function replaySteps(span: Span): number {
  return Math.ceil((spanDays(span) - REPLAY_DAYS) / 7);
}

/**
 * Reduced motion's window for `step` (0-based, one step per week): 30 days from a week-aligned
 * start, never reaching past the span's end. The last step, `replaySteps(span)`, ends exactly at
 * `span.to`, however many days that leaves it.
 */
export function replayStepWindow(span: Span, step: number): Span {
  const from = addNyDays(span.from, step * 7);
  const to = addNyDays(from, REPLAY_DAYS);
  return { from, to: to.getTime() > span.to.getTime() ? span.to : to };
}

/** What the caption says while a range replays. */
export const REPLAY_LABELS: Record<RangeKey, string> = {
  all: "Replaying every meeting",
  last: "Replaying last year",
  this: "Replaying this year",
  next365: "Replaying the next 365 days",
  next30: "Replaying",
  next7: "Replaying",
};

/** The Washington month at the window's middle: "Mar 2026". */
export function replayMonth(window: Span): string {
  const middle = new Date((window.from.getTime() + window.to.getTime()) / 2);
  return formatNY(middle, { month: "short", year: "numeric" });
}
