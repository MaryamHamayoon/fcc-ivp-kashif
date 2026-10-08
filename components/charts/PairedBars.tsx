"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "motion/react";
import { formatNumber } from "@/lib/format";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type PairedRow = { key: string; label: string; planned: number; actual: number };

export type PairedBarsProps = {
  data: PairedRow[];
  /** Accessible label for the group, e.g. "Participants by category". */
  label: string;
  plannedLabel?: string;
  actualLabel?: string;
  className?: string;
};

const PLANNED = "var(--chart-2)";
const ACTUAL = "var(--chart-1)";

/**
 * Two thin bars per row — what was planned above what actually came — with a legend so the
 * pairing is never colour alone. Each row is one `role="img"` sentence; the figure's data
 * table carries the same numbers.
 */
export function PairedBars({ data, label, plannedLabel = "Planned", actualLabel = "Actual", className }: PairedBarsProps) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...data.flatMap((d) => [d.planned, d.actual]));
  const scale = scaleLinear().domain([0, max]).range([0, 100]).clamp(true);

  return (
    <div role="group" aria-label={label} className={cn("flex flex-col gap-3", className)}>
      <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-4 rounded-full" style={{ background: PLANNED, opacity: 0.55 }} />
          {plannedLabel}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-4 rounded-full" style={{ background: ACTUAL }} />
          {actualLabel}
        </li>
      </ul>
      <div className="flex flex-col gap-2.5">
        {data.map((d, i) => (
          <div
            key={d.key}
            role="img"
            aria-label={`${d.label}: ${formatNumber(d.planned)} ${plannedLabel.toLowerCase()}, ${formatNumber(d.actual)} ${actualLabel.toLowerCase()}`}
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,5fr)] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]"
          >
            <span aria-hidden title={d.label} className="truncate text-sm text-foreground">
              {d.label}
            </span>
            <span aria-hidden className="flex flex-col gap-1">
              <Bar pct={scale(d.planned)} value={d.planned} color={PLANNED} opacity={0.55} index={i} animate={!reduce} />
              <Bar pct={scale(d.actual)} value={d.actual} color={ACTUAL} opacity={1} index={i} animate={!reduce} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ pct, value, color, opacity, index, animate }: { pct: number; value: number; color: string; opacity: number; index: number; animate: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <motion.span
          className="absolute inset-y-0 left-0 origin-left rounded-full"
          style={{ background: color, opacity, width: `${pct}%` }}
          initial={animate ? { scaleX: 0 } : false}
          animate={{ scaleX: 1 }}
          transition={motionTransition({ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: index * 0.045 })}
        />
      </span>
      <span className="numeric w-10 shrink-0 text-right text-[0.75rem] text-muted-foreground">{formatNumber(value)}</span>
    </span>
  );
}
