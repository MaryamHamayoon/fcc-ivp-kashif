"use client";

import { motion } from "motion/react";
import { Sparkline } from "@/components/charts/Sparkline";
import { motionTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Delta } from "./Delta";
import { NumberTicker } from "./NumberTicker";

/**
 * One figure on the program band: the number, the word for what it counts, how
 * it moved against last year, and — in the smallest type on the card — how it is
 * measured, so nobody has to ask what "countries" means.
 */
export type BandStatProps = {
  /** Stable name for this figure ("engagements", "countries", …); surfaced as `data-stat` for end-to-end tests. */
  id: string;
  value: number;
  /** The word beside the number: "engagements", "countries", "in the next 30 days". */
  unit: string;
  /** One line on how the figure is counted. */
  note: string;
  /** Same figure a year earlier; null when there is nothing meaningful to compare. */
  prior?: number | null;
  priorLabel?: string;
  series: number[];
  seriesLabel: string;
  /** Position in the entrance stagger, and whether the stagger should run at all. */
  index: number;
  stagger: boolean;
  className?: string;
};

export function BandStat({ id, value, unit, note, prior = null, priorLabel = "last year", series, seriesLabel, index, stagger, className }: BandStatProps) {
  // Under reduced motion the card still starts where the server drew it and simply lands at
  // once; branching the initial style on the preference would make the client disagree with
  // the server's markup.
  return (
    <motion.li
      data-stat={id}
      className={cn("rounded-md border border-band-border bg-band-surface p-4 md:p-5", className)}
      initial={stagger ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition({ duration: 0.42, delay: stagger ? index * 0.06 : 0, ease: [0.22, 1, 0.36, 1] })}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span data-stat-figure="" className="heading-display text-[2.5rem] leading-none text-band-foreground">
            <NumberTicker value={value} className="proportional-nums" />
          </span>
          <span className="text-[0.9375rem] font-medium text-band-muted">{unit}</span>
        </p>
        <Sparkline data={series} label={seriesLabel} stroke="#ffffff" className="mt-1 opacity-80" />
      </div>
      {/* The row keeps its height with or without a comparison, so every note sits on one baseline. */}
      <div className="mt-3 flex min-h-5 items-center">{prior !== null ? <Delta value={value} prior={prior} priorLabel={priorLabel} /> : null}</div>
      <p className="mt-2 text-[0.75rem] leading-snug text-band-muted">{note}</p>
    </motion.li>
  );
}
