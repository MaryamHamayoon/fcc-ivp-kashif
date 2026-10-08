"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Readiness } from "@/lib/domain/readiness";
import { cn } from "@/lib/utils";

/**
 * The ring alone, for a row that is already one link: a tooltip's trigger is a button, and a
 * button inside a link is two controls in one. The percentage is its accessible name.
 */
export function ReadinessGlyph({ percent: raw, size = 20, className }: { percent: number; size?: number; className?: string }) {
  const percent = Math.round(raw);
  const strokeWidth = 2.5;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, percent / 100));
  const tone = percent === 100 ? "stroke-ok" : percent >= 50 ? "stroke-primary" : "stroke-warn";

  return (
    <svg role="img" aria-label={`Readiness ${percent}%`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0", className)}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className="stroke-border" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - filled)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={cn("transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none", tone)}
      />
    </svg>
  );
}

/**
 * Readiness as a ring: six checks, filled in proportion. The percentage is in the
 * accessible name, so the tooltip only has to add what is still missing.
 */
export function ReadinessRing({ readiness, size = 20, className }: { readiness: Readiness; size?: number; className?: string }) {
  const percent = Math.round(readiness.percent);
  const missing = readiness.missing.map((item) => item.label).join(", ");

  return (
    <Tooltip>
      <TooltipTrigger className={cn("inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
        <ReadinessGlyph percent={percent} size={size} />
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">{percent}% ready</span>
        {missing ? <span className="block text-xs opacity-80">Still needed: {missing}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}
