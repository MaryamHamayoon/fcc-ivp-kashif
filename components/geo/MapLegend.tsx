"use client";

import { Pause } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FORMAT_ORDER } from "@/lib/domain/reach";
import { FORMAT_LABELS } from "@/lib/domain/types";
import type { Ramp } from "@/lib/geo/map-palette";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { FormatGlyph } from "./FormatGlyph";

/** A mark with a ring at its edge: how a country with a meeting in the next 30 days looks when still. */
function SignalGlyph() {
  return (
    <svg width={11} height={11} viewBox="0 0 11 11" aria-hidden focusable="false" className="shrink-0">
      <circle cx={5.5} cy={5.5} r={2} fill="currentColor" />
      <circle cx={5.5} cy={5.5} r={4.75} fill="none" stroke="currentColor" strokeWidth={1.1} />
    </svg>
  );
}

/**
 * The map's key, on one quiet line: the choropleth's ramp between the window's own minimum and
 * maximum, the three formats told by shape, and — only while something is signaling — the
 * next 30 days with the control that stills them. That control is a toggle with one name, so
 * its state is `aria-pressed`, never a change of words; under reduced motion nothing moves and
 * the control is withdrawn.
 */
export function MapLegend({
  ramp,
  signaling,
  paused,
  onPausedChange,
  className,
}: {
  /** Null when the window holds no meetings: there is nothing to shade. */
  ramp: Ramp | null;
  signaling: boolean;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[0.6875rem] leading-none text-muted-foreground", className)}>
      {ramp ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="sr-only">
            Countries shaded by meetings, from {ramp.min} to {ramp.max}.
          </span>
          <span aria-hidden className="font-semibold text-foreground">
            Meetings
          </span>
          <span aria-hidden className="numeric">
            {ramp.min}
          </span>
          <span aria-hidden className="inline-flex overflow-hidden rounded-[2px] ring-1 ring-border">
            {ramp.colors.map((color) => (
              <span key={color} data-swatch className="block h-2 w-4" style={{ backgroundColor: color }} />
            ))}
          </span>
          <span aria-hidden className="numeric">
            {ramp.max}
          </span>
        </span>
      ) : null}

      <span className="inline-flex items-center gap-2.5">
        {FORMAT_ORDER.map((format) => (
          <span key={format} className="inline-flex items-center gap-1">
            <FormatGlyph format={format} size={9} />
            {FORMAT_LABELS[format]}
          </span>
        ))}
      </span>

      {signaling ? (
        <span className="inline-flex items-center gap-1">
          <SignalGlyph />
          Next 30 days
          {reduce === true ? null : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Pause the signals"
                    aria-pressed={paused}
                    onClick={() => onPausedChange(!paused)}
                    className={cn(
                      "pointer-events-auto -my-1 ml-0.5 inline-grid size-5 place-items-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      paused ? "bg-primary/10 text-primary" : "hover:bg-muted hover:text-foreground",
                    )}
                  />
                }
              >
                <Pause className="size-3" aria-hidden />
              </TooltipTrigger>
              <TooltipContent side="top">Pause the signals</TooltipContent>
            </Tooltip>
          )}
        </span>
      ) : null}
    </div>
  );
}
