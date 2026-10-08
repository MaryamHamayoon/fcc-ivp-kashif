"use client";

import { animate } from "motion/react";
import { reducedMotionNow, useReducedMotion } from "@/lib/motion";
import { useLayoutEffect, useRef } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Counts up to `value` on mount (900 ms, eased). Server markup and reduced-motion
 * users get the final number straight away; the count is purely visual.
 */
export function NumberTicker({ value, format = formatNumber, duration = 0.9, className }: { value: number; format?: (n: number) => string; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    // `reduce` is still unknown during hydration; the document already knows.
    if (!el || reduce || reducedMotionNow()) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = format(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduce, duration, format]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(value)}
    </span>
  );
}
