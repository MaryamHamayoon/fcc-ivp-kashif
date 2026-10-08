"use client";

import { type KeyboardEvent, useRef, useState } from "react";
import { monthTicks, type PulseWeek, weekLabel } from "@/lib/domain/activity-feed";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const entries = (n: number) => (n === 0 ? "no entries" : `${formatNumber(n)} ${n === 1 ? "entry" : "entries"}`);

/**
 * The program's rhythm: one bar per week, as tall as the entries logged in it, over a month axis.
 * It is drawn from the filters in force, so it answers "when was this busy" for whatever the
 * reader has narrowed to — and each bar is a control: press it and the log below keeps to that
 * week, press it again and it lets go. The strip is one stop in the tab order; the arrow keys
 * travel the weeks. The line on the left says in words what the pointer, or the focus, is on.
 */
export function ActivityPulse({ pulse, selected, onSelect, className }: { pulse: PulseWeek[]; selected: string | null; onSelect: (week: string | null) => void; className?: string }) {
  const bars = useRef<(HTMLButtonElement | null)[]>([]);
  const [pointed, setPointed] = useState<string | null>(null);
  /** The week the arrow keys last landed on; until they move, a reader arrives on the picked week, or on this one. */
  const [roved, setRoved] = useState<string | null>(null);

  const max = Math.max(1, ...pulse.map((w) => w.count));
  const total = pulse.reduce((sum, w) => sum + w.count, 0);
  const shown = pulse.find((w) => w.week === (pointed ?? selected)) ?? null;
  const ticks = monthTicks(pulse.map((w) => w.week));

  const indexOf = (week: string | null) => (week === null ? -1 : pulse.findIndex((w) => w.week === week));
  const stop = [indexOf(roved), indexOf(selected), pulse.length - 1].find((i) => i >= 0) ?? 0;

  function travel(event: KeyboardEvent<HTMLDivElement>) {
    const from = bars.current.findIndex((bar) => bar === document.activeElement);
    if (from < 0) return;
    const to = event.key === "ArrowLeft" ? from - 1 : event.key === "ArrowRight" ? from + 1 : event.key === "Home" ? 0 : event.key === "End" ? pulse.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    const week = pulse[Math.min(pulse.length - 1, Math.max(0, to))];
    if (!week) return;
    setRoved(week.week);
    bars.current[indexOf(week.week)]?.focus();
  }

  return (
    <div className={cn("flex flex-col gap-2 border-b px-3 pt-3 pb-1.5 sm:flex-row sm:items-start sm:gap-4", className)}>
      {/* On a phone the words sit above the bars, which need the whole width to be pressed. */}
      <p aria-hidden className="flex shrink-0 items-baseline justify-between gap-2 text-xs leading-snug text-muted-foreground sm:h-12 sm:w-40 sm:flex-col sm:items-start sm:justify-end sm:gap-0">
        <span className="font-medium text-foreground">{shown ? weekLabel(shown.week) : `Last ${pulse.length} weeks`}</span>
        <span className="tabular-nums">{entries(shown ? shown.count : total)}</span>
      </p>

      <div className="min-w-0 flex-1">
        <div role="group" aria-label={`Entries per week, last ${pulse.length} weeks`} onKeyDown={travel} className="flex h-12 items-end gap-[3px]">
          {pulse.map((w, i) => {
            const isSelected = selected === w.week;
            const dimmed = selected !== null && !isSelected;
            return (
              <button
                key={w.week}
                ref={(el) => {
                  bars.current[i] = el;
                }}
                type="button"
                tabIndex={i === stop ? 0 : -1}
                aria-label={`${weekLabel(w.week)}: ${entries(w.count)}`}
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : w.week)}
                onMouseEnter={() => setPointed(w.week)}
                onMouseLeave={() => setPointed(null)}
                onFocus={() => setPointed(w.week)}
                onBlur={() => setPointed(null)}
                className="group/bar flex h-full min-w-0 flex-1 items-end rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "block w-full rounded-t-[3px] transition-[background-color,opacity] duration-150",
                    w.count === 0 ? "bg-border" : isSelected ? "bg-primary" : "bg-primary/45 group-hover/bar:bg-primary group-focus-visible/bar:bg-primary",
                    dimmed && "opacity-45",
                  )}
                  // A quiet week still leaves a mark on the baseline, so the row of weeks reads as unbroken.
                  style={{ height: w.count === 0 ? 2 : `${Math.max(8, (w.count / max) * 100)}%` }}
                />
              </button>
            );
          })}
        </div>

        {/* The axis: the same columns as the bars, a month's name where it begins. */}
        <div aria-hidden className="mt-1 flex h-3.5 gap-[3px] text-[0.625rem] leading-none text-muted-foreground">
          {ticks.map((tick, i) => (
            <span key={pulse[i]?.week ?? i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
              {tick}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
