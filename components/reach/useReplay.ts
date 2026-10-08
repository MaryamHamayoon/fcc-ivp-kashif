"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Span } from "@/lib/domain/reach-time";
import { replayMs, replaySteps, replayStepWindow, replayWindow } from "@/lib/reach/replay";

/** What the timeline gets from Replay: whether it is running, its current window, and how to drive it. */
export type ReplayControls = {
  playing: boolean;
  window: Span | null;
  start: () => void;
  pause: () => Span | null;
  stop: () => void;
};

/**
 * Replay's clock. Moving mode runs a `requestAnimationFrame` loop that sweeps `span` in
 * `replayMs(span)`, each frame advancing by at most 100ms of real time so a stalled tab never
 * jumps. Reduced motion instead steps a week at a time on a timer, once every
 * `replayMs(span) / replaySteps(span)` ms. Neither mode touches the URL or the camera — this hook
 * only tracks the window, and the screen decides what a pause or the end means for its own state.
 */
export function useReplay({ span, reduce, onEnd }: { span: Span; reduce: boolean; onEnd?: () => void }): ReplayControls {
  const [playing, setPlaying] = useState(false);
  const [win, setWin] = useState<Span | null>(null);

  // Latest props, read from event handlers and clock callbacks rather than closed over, so a
  // stable `start` always sweeps the span and mode current when it is called.
  const spanRef = useRef(span);
  const reduceRef = useRef(reduce);
  const onEndRef = useRef(onEnd);
  const windowRef = useRef<Span | null>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    spanRef.current = span;
  }, [span]);
  useEffect(() => {
    reduceRef.current = reduce;
  }, [reduce]);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  const setWindow = useCallback((next: Span | null) => {
    windowRef.current = next;
    setWin(next);
  }, []);

  const clearClocks = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Stops without reporting anything: the tour starting, or the range changing underneath it. */
  const stop = useCallback(() => {
    clearClocks();
    setPlaying(false);
    setWindow(null);
  }, [clearClocks, setWindow]);

  /** Stops where it is and hands back that window, for the screen to keep as its own. */
  const pause = useCallback((): Span | null => {
    if (!playing) return null;
    clearClocks();
    const stopped = windowRef.current;
    setPlaying(false);
    setWindow(null);
    return stopped;
  }, [playing, clearClocks, setWindow]);

  /** Reaching the end on its own: unlike `pause`, the screen gets no window back to keep. */
  const finish = useCallback(() => {
    clearClocks();
    setPlaying(false);
    setWindow(null);
    onEndRef.current?.();
  }, [clearClocks, setWindow]);

  const start = useCallback(() => {
    clearClocks();
    const activeSpan = spanRef.current;
    setWindow(replayWindow(activeSpan, 0));
    setPlaying(true);

    if (reduceRef.current) {
      const steps = replaySteps(activeSpan);
      const interval = replayMs(activeSpan) / steps;
      let step = 0;
      timerRef.current = setInterval(() => {
        step += 1;
        if (step > steps) {
          finish();
          return;
        }
        setWindow(replayStepWindow(activeSpan, step));
      }, interval);
      return;
    }

    const duration = replayMs(activeSpan);
    let progress = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last === null) {
        // The first frame only sets the clock's baseline; there is no prior frame to measure from.
        last = now;
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      progress += Math.min(100, now - last) / duration;
      last = now;
      if (progress >= 1) {
        finish();
        return;
      }
      setWindow(replayWindow(activeSpan, progress));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [clearClocks, finish, setWindow]);

  // A different range invalidates whatever Replay was doing with the old one. `playing` and
  // `window` are reset the React-documented way — compared and applied during render, not in an
  // effect — so this render already reads as stopped rather than lagging a render behind.
  const spanKey = `${span.from.getTime()}-${span.to.getTime()}`;
  const [resetFor, setResetFor] = useState(spanKey);
  if (resetFor !== spanKey) {
    setResetFor(spanKey);
    setPlaying(false);
    setWin(null);
  }

  // The clock is a real side effect outside React, so its cancellation still belongs in an
  // effect: once when the range actually changes (the previous instance's cleanup, ahead of the
  // next) and once more on unmount.
  useEffect(() => clearClocks, [spanKey, clearClocks]);

  return { playing, window: win, start, pause, stop };
}
