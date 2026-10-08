"use client";

import { Delta } from "@/components/dashboard/Delta";
import type { Figure } from "@/lib/domain/reports";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The year in four numbers, in one quiet card divided by hairlines. The dashboard's band owns
 * the loud version; here the figure, its movement and its basis sit in plain type.
 */
export function FigureRow({ figures, priorLabel, className }: { figures: Figure[]; priorLabel: string; className?: string }) {
  return (
    <ul aria-label="Key figures" className={cn("grid grid-cols-1 gap-px overflow-hidden rounded-2xl border bg-border shadow-soft sm:grid-cols-2 lg:grid-cols-4", className)}>
      {figures.map((figure) => (
        <li key={figure.id} data-figure={figure.id} className="flex flex-col gap-1.5 bg-card px-5 py-4">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="heading-display numeric text-[1.75rem] leading-none text-foreground">{formatNumber(figure.value)}</span>
            <span className="text-[0.8125rem] font-medium text-muted-foreground">{figure.label}</span>
          </p>
          <div className="flex min-h-5 items-center">
            {figure.prior === null ? <span className="text-[0.6875rem] text-muted-foreground">no {priorLabel} data</span> : <Delta value={figure.value} prior={figure.prior} priorLabel={priorLabel} tone="card" />}
          </div>
          <p className="text-[0.6875rem] leading-snug text-muted-foreground">{figure.note}</p>
        </li>
      ))}
    </ul>
  );
}
