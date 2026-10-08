"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * How a figure moved against the year before. No red or green — the arrow carries the
 * direction, and a drop in engagements is not a failure a dashboard should shout about. The
 * sign is spoken as a word so a screen reader never has to guess at "−".
 */

const PILL = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold";

/** On the program band the pill is glass on green; on a card it is a quiet neutral. */
const TONE = {
  band: "border-band-border bg-band-surface text-band-foreground",
  card: "border-border bg-muted/60 text-foreground",
} as const;

export function Delta({ value, prior, priorLabel, tone = "band", className }: { value: number; prior: number; priorLabel: string; tone?: keyof typeof TONE; className?: string }) {
  const delta = value - prior;
  if (delta === 0) {
    return (
      <span className={cn(PILL, TONE[tone], className)}>
        <Minus className="size-3" aria-hidden />
        Same as {priorLabel}
      </span>
    );
  }
  const up = delta > 0;
  const amount = formatNumber(Math.abs(delta));
  return (
    <span className={cn(PILL, TONE[tone], className)}>
      {up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
      <span aria-hidden>
        {up ? "+" : "−"}
        {amount} vs {priorLabel}
      </span>
      <span className="sr-only">
        {up ? "up" : "down"} {amount} versus {priorLabel}
      </span>
    </span>
  );
}
