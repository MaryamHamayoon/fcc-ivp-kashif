"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReachMeeting } from "@/lib/domain/reach";

/** How long the tour stays on each visit before it moves on by itself. */
export const STOP_MS = 7500;

export type TourControls = {
  active: boolean;
  /** The visits in the order told, as they stood when the tour began. */
  stops: readonly ReachMeeting[];
  /** The visit being told; `stops.length` is the summary. */
  index: number;
  paused: boolean;
  /** Begins at the first of these visits. With none, does nothing. */
  start(stops: readonly ReachMeeting[]): void;
  end(): void;
  /** Goes to a visit, or to the summary; anything beyond either end stops there. */
  go(index: number): void;
  next(): void;
  previous(): void;
  /** Holds the visit being told, or lets it run on for the time it had left. The summary has nothing to hold. */
  togglePause(): void;
};

/** A tour under way: its own copy of the visits, where it is, and how long the visit on screen has left to run. */
type Run = { stops: readonly ReachMeeting[]; index: number; paused: boolean; left: number };

const NO_STOPS: readonly ReachMeeting[] = [];

/** The run at `index`, kept between the first visit and the summary. A visit arrived at gets its full time. */
function moveTo(run: Run, index: number): Run {
  const at = Math.min(Math.max(0, Math.trunc(index)), run.stops.length);
  return Number.isNaN(at) || at === run.index ? run : { ...run, index: at, left: STOP_MS };
}

/**
 * The tour's clock: each visit for 7.5 s, then a summary that waits for the reader.
 * `start` keeps its own copy of the visits, so a filter changed mid-tour cannot reshuffle them.
 * Pause holds the visit on screen, and resuming runs only the time it had left; moving to another
 * visit, paused or not, gives that visit its full time. One timer runs at a time, in an effect,
 * so ending the tour or leaving the page clears it.
 */
export function useTour(): TourControls {
  const [run, setRun] = useState<Run | null>(null);
  /** When the visit on screen began counting down (`performance.now()`), or null while nothing counts. */
  const armedAt = useRef<number | null>(null);

  const stops = run?.stops ?? NO_STOPS;
  const index = run?.index ?? 0;
  const left = run?.left ?? STOP_MS;
  const counting = run !== null && !run.paused && run.index < run.stops.length;

  // Re-armed whenever the visit, its time left, or the tour itself changes; the summary arms nothing.
  useEffect(() => {
    if (!counting) return;
    armedAt.current = performance.now();
    const timer = setTimeout(() => setRun((r) => r && moveTo(r, r.index + 1)), left);
    return () => {
      clearTimeout(timer);
      armedAt.current = null;
    };
  }, [counting, stops, index, left]);

  const start = useCallback((visits: readonly ReachMeeting[]) => {
    if (visits.length > 0) setRun({ stops: visits.slice(), index: 0, paused: false, left: STOP_MS });
  }, []);
  const end = useCallback(() => setRun(null), []);
  const go = useCallback((to: number) => setRun((r) => r && moveTo(r, to)), []);
  const next = useCallback(() => setRun((r) => r && moveTo(r, r.index + 1)), []);
  const previous = useCallback(() => setRun((r) => r && moveTo(r, r.index - 1)), []);
  const togglePause = useCallback(() => {
    // The clock is read here rather than in the updater, which React may call twice.
    const armed = armedAt.current;
    const spent = armed === null ? 0 : performance.now() - armed;
    setRun((r) => {
      if (!r || r.index >= r.stops.length) return r;
      return r.paused ? { ...r, paused: false } : { ...r, paused: true, left: Math.max(0, r.left - spent) };
    });
  }, []);

  return useMemo(
    () => ({ active: run !== null, stops: run?.stops ?? NO_STOPS, index: run?.index ?? 0, paused: run?.paused ?? false, start, end, go, next, previous, togglePause }),
    [run, start, end, go, next, previous, togglePause],
  );
}
