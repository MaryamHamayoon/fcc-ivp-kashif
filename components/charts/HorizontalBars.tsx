"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "motion/react";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import type { NamedCount } from "@/lib/domain/tallies";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type HorizontalBarsProps = {
  data: NamedCount[];
  /** Accessible label for the group, e.g. "Meetings by region". */
  label: string;
  /** CSS color for every bar. */
  color?: string;
  className?: string;
};

/**
 * A ranked horizontal bar list (regions, bureaus, …). Bars render in the order
 * given — the service already sorts by count descending. Each bar is its own
 * `role="img"` ("Africa: 12") since the visible name + track is decorative;
 * the identical numbers also live in the figure's data table.
 */
export function HorizontalBars({ data, label, color = "var(--chart-1)", className }: HorizontalBarsProps) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...data.map((d) => d.count));
  const scale = scaleLinear().domain([0, max]).range([0, 100]).clamp(true);

  return (
    <div role="group" aria-label={label} className={cn("flex flex-col gap-3", className)}>
      {data.map((d, i) => {
        const pct = scale(d.count);
        return (
          <div key={d.key} role="img" aria-label={`${d.label}: ${formatNumber(d.count)}`} className="flex items-center gap-3">
            <span aria-hidden title={d.label} className="w-2/5 max-w-44 shrink-0 truncate text-sm text-foreground">
              {d.label}
            </span>
            <span aria-hidden className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.span
                className="absolute inset-y-0 left-0 origin-left rounded-full"
                style={{ background: color, width: `${pct}%` }}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={motionTransition({ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: i * 0.045 })}
              />
            </span>
            <span aria-hidden className="numeric w-10 shrink-0 text-right text-sm text-muted-foreground">
              {formatNumber(d.count)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
