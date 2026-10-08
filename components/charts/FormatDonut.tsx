"use client";

import { arc, pie, type PieArcDatum } from "d3-shape";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState } from "react";
import { NumberTicker } from "@/components/dashboard/NumberTicker";
import type { FormatShare } from "@/lib/domain/insights";
import type { MeetingFormat } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useSeen } from "./useSeen";

export type FormatDonutProps = {
  data: FormatShare[];
  /** Accessible name for the ring, e.g. "Meeting formats in FY26". */
  label: string;
  /** "FY26" and "FY25": the year drawn in the ring, and the one it is measured against. */
  currentLabel: string;
  priorLabel: string;
  className?: string;
};

/** A format keeps its color wherever it appears and however it ranks: color follows the entity. */
export const FORMAT_COLORS: Record<MeetingFormat, string> = {
  virtual: "var(--chart-1)",
  in_person: "var(--chart-2)",
  hybrid: "var(--chart-3)",
};

const SIZE = 224;
const CENTER = SIZE / 2;
const OUTER = 102;
const INNER = 80;
const LIFT = 6;
/** Last year's split: a hairline ring inside this year's, same order, same colors, held back. */
const GHOST_OUTER = 74;
const GHOST_INNER = 70;
const PAD = 0.028;
const EASE = [0.22, 1, 0.36, 1] as const;

type Slice = PieArcDatum<FormatShare>;
const atRest = arc<Slice>().cornerRadius(4).innerRadius(INNER).outerRadius(OUTER);
const lifted = arc<Slice>().cornerRadius(4).innerRadius(INNER).outerRadius(OUTER + LIFT);
const ghostArc = arc<Slice>().cornerRadius(2).innerRadius(GHOST_INNER).outerRadius(GHOST_OUTER);

const percent = (share: number) => `${Math.round(share * 100)}%`;
const meetings = (n: number) => `${formatNumber(n)} ${n === 1 ? "meeting" : "meetings"}`;

function movement(delta: number | null, priorLabel: string): string | null {
  if (delta === null) return null;
  if (delta === 0) return `unchanged from ${priorLabel}`;
  const size = Math.abs(delta);
  return `${delta > 0 ? "up" : "down"} ${size} ${size === 1 ? "point" : "points"} from ${priorLabel}`;
}

/** Direction is carried by the arrow, not by red and green: a format growing is not good or bad. */
function DeltaMark({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span className="inline-flex w-16 shrink-0 items-center justify-end gap-1 whitespace-nowrap text-[0.6875rem] text-muted-foreground">
      <Icon aria-hidden className="size-3" strokeWidth={2} />
      <span>
        <span className="numeric">{Math.abs(delta)}</span> pts
      </span>
    </span>
  );
}

/**
 * How the year's meetings were held. The ring is this year; the hairline inside it is last year
 * in the same order, so a format's arc can be read against its own shadow. Nothing is said by
 * color alone: every format is a row underneath with its meetings, its share and the move since
 * last year, and that row is also the control — point at it, tab to it or tap it, and the ring
 * lifts that format while the middle tells its story.
 */
export function FormatDonut({ data, label, currentLabel, priorLabel, className }: FormatDonutProps) {
  const reduce = useReducedMotion();
  const maskId = `formats-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { ref: watch, seen } = useSeen();
  const [hovered, setHovered] = useState<MeetingFormat | null>(null);
  const [focused, setFocused] = useState<MeetingFormat | null>(null);
  const [pinned, setPinned] = useState<MeetingFormat | null>(null);
  /** The total counts up once, as the ring comes into view; coming back to it from a format, it simply stands. */
  const [visited, setVisited] = useState(false);

  const activeKey = hovered ?? focused ?? pinned;
  const active = data.find((d) => d.key === activeKey) ?? null;
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const compared = data.some((d) => d.priorShare !== null);

  const angles = pie<FormatShare>().sort(null).padAngle(PAD);
  const ring = angles.value((d) => d.count)(data);
  const ghost = compared ? angles.value((d) => d.priorShare ?? 0)(data) : [];

  const point = (key: MeetingFormat | null) => {
    setHovered(key);
    if (key) setVisited(true);
  };
  const pin = (key: MeetingFormat) => setPinned((current) => (current === key ? null : key));

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div ref={watch} className="relative max-w-full" style={{ width: SIZE, height: SIZE }}>
        <svg role="img" aria-label={label} viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full overflow-visible">
          <defs>
            {/* One clockwise sweep from twelve o'clock uncovers both rings together. */}
            <mask id={maskId} maskUnits="userSpaceOnUse" x={-16} y={-16} width={SIZE + 32} height={SIZE + 32}>
              <motion.circle
                cx={CENTER}
                cy={CENTER}
                r={88}
                fill="none"
                stroke="#fff"
                strokeWidth={60}
                pathLength={1}
                strokeDasharray="1 1"
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
                initial={reduce ? false : { strokeDashoffset: 1 }}
                animate={{ strokeDashoffset: seen ? 0 : 1 }}
                transition={motionTransition({ duration: 1.1, ease: EASE, delay: 0.15 })}
              />
            </mask>
          </defs>
          {/* The mask is measured in the svg's own space, so it wraps the centering group. */}
          <g mask={`url(#${maskId})`} className="print:[mask:none]">
            <g transform={`translate(${CENTER} ${CENTER})`}>
              {ghost.map((slice) =>
                slice.value > 0 ? (
                  <path
                    key={slice.data.key}
                    d={ghostArc(slice) ?? undefined}
                    fill={FORMAT_COLORS[slice.data.key]}
                    opacity={activeKey && activeKey !== slice.data.key ? 0.14 : 0.42}
                    className="transition-opacity duration-200"
                  />
                ) : null,
              )}
              {ring.map((slice) => {
                if (slice.value === 0) return null;
                const isActive = activeKey === slice.data.key;
                return (
                  <motion.path
                    key={slice.data.key}
                    data-format={slice.data.key}
                    data-active={activeKey ? String(isActive) : undefined}
                    fill={FORMAT_COLORS[slice.data.key]}
                    className="cursor-pointer"
                    initial={false}
                    animate={{ d: (isActive ? lifted : atRest)(slice) ?? "", opacity: activeKey && !isActive ? 0.3 : 1 }}
                    transition={motionTransition({ duration: 0.28, ease: EASE })}
                    onMouseEnter={() => point(slice.data.key)}
                    onMouseLeave={() => point(null)}
                    onClick={() => pin(slice.data.key)}
                  />
                );
              })}
            </g>
          </g>
        </svg>

        {/* The rows below say all of this to assistive technology; the middle is for the eye. */}
        <div data-testid="donut-center" aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {active ? (
            <>
              <span className="heading-display text-[1.875rem] leading-none tabular-nums text-foreground">{percent(active.share)}</span>
              <span className="mt-1.5 text-[0.8125rem] font-medium leading-tight text-foreground">{active.label}</span>
              <span className="mt-1 text-xs leading-snug tabular-nums text-muted-foreground">{meetings(active.count)}</span>
              <span className="text-xs leading-snug tabular-nums text-muted-foreground">{formatNumber(active.participants)} participants</span>
            </>
          ) : (
            <>
              {visited || !seen ? (
                <span className="heading-display text-[2.125rem] leading-none tabular-nums text-foreground">{formatNumber(total)}</span>
              ) : (
                <NumberTicker value={total} className="heading-display text-[2.125rem] leading-none text-foreground" />
              )}
              <span className="mt-1.5 text-xs text-muted-foreground">meetings in {currentLabel}</span>
            </>
          )}
        </div>
      </div>

      <ul className="mt-4 flex w-full flex-col gap-0.5">
        {data.map((d) => {
          const moved = movement(d.deltaPoints, priorLabel);
          return (
            <li key={d.key}>
              <button
                type="button"
                aria-label={`${d.label}: ${meetings(d.count)}, ${percent(d.share)} of ${currentLabel}${moved ? `, ${moved}` : ""}`}
                aria-pressed={pinned === d.key}
                onMouseEnter={() => point(d.key)}
                onMouseLeave={() => point(null)}
                onFocus={() => {
                  setFocused(d.key);
                  setVisited(true);
                }}
                onBlur={() => setFocused(null)}
                onClick={() => pin(d.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  activeKey === d.key && "bg-muted/70",
                )}
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: FORMAT_COLORS[d.key] }} />
                <span className="min-w-0 flex-1 truncate text-foreground">{d.label}</span>
                <span className="numeric text-[0.8125rem] text-muted-foreground">{formatNumber(d.count)}</span>
                <span className="numeric w-10 text-right text-[0.8125rem] font-medium text-foreground">{percent(d.share)}</span>
                <DeltaMark delta={d.deltaPoints} />
              </button>
            </li>
          );
        })}
      </ul>

      {compared ? (
        <p className="mt-2 w-full px-2 text-[0.6875rem] leading-snug text-muted-foreground">
          Outer ring {currentLabel}, inner ring {priorLabel}. Change is in percentage points.
        </p>
      ) : null}
    </div>
  );
}
