"use client";

import { motion } from "motion/react";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import type { NamedCount } from "@/lib/domain/tallies";
import { FORMAT_LABELS, type MeetingFormat } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export type SplitBarProps = {
  data: NamedCount[];
  /** Accessible label for the whole bar, e.g. "Meeting formats". */
  label: string;
  className?: string;
};

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
const FALLBACK_COLOR = "var(--chart-1)";

function isFormatKey(key: string): key is MeetingFormat {
  return key in FORMAT_LABELS;
}

/** A raw MeetingFormat key maps through FORMAT_LABELS; anything already labelled is used as given. */
function displayName(name: string): string {
  return isFormatKey(name) ? FORMAT_LABELS[name] : name;
}

/** One stacked horizontal bar (e.g. meeting formats) with a legend of names and shares below it. */
export function SplitBar({ data, label, className }: SplitBarProps) {
  const reduce = useReducedMotion();
  const total = Math.max(
    1,
    data.reduce((sum, d) => sum + d.count, 0),
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div role="img" aria-label={label} className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
        {data.map((d, i) => {
          const color = COLORS[i % COLORS.length] ?? FALLBACK_COLOR;
          return (
            <motion.div
              key={d.key}
              style={{ background: color }}
              initial={reduce ? false : { flexGrow: 0 }}
              animate={{ flexGrow: Math.max(d.count, 0.0001) }}
              transition={motionTransition({ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] })}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          );
        })}
      </div>
      {/* Real text, not swallowed by the img role above: names and shares are independently readable. */}
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {data.map((d, i) => {
          const color = COLORS[i % COLORS.length] ?? FALLBACK_COLOR;
          return (
            <li key={d.key} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
              <span className="text-foreground">{displayName(d.label)}</span>
              <span className="numeric text-muted-foreground">{Math.round((d.count / total) * 100)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
