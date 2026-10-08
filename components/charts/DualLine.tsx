"use client";

import { scaleLinear, scalePoint } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { motion } from "motion/react";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { useChartDims } from "./useChartDims";

export type CadencePoint = { month: string; current: number; prior: number };

export type DualLineProps = {
  data: CadencePoint[];
  /** e.g. "FY26" */
  currentLabel: string;
  /** e.g. "FY25" */
  priorLabel: string;
  /** Accessible label for the whole chart, e.g. "Monthly meeting cadence". */
  label: string;
  className?: string;
};

const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 24, left: 30 };
const DEFAULT_WIDTH = 640;

/**
 * Monthly cadence: the current fiscal year drawn in the brand green with a gradient area
 * beneath, the prior year a dashed reference line. Responsive via
 * `useChartDims`; the whole chart is one `role="img"`, since the identical
 * numbers also live in the figure's data table.
 */
export function DualLine({ data, currentLabel, priorLabel, label, className }: DualLineProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const gradientId = `cadence-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const { ref, width: measured } = useChartDims();
  const width = measured || DEFAULT_WIDTH;
  const height = HEIGHT;

  const months = data.map((d) => d.month);
  const x = scalePoint<string>().domain(months).range([PAD.left, width - PAD.right]).padding(0.5);
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.current, d.prior)));
  const y = scaleLinear().domain([0, maxValue]).nice().range([height - PAD.bottom, PAD.top]);
  const yTicks = y.ticks(4);

  const currentLine = line<CadencePoint>()
    .x((d) => x(d.month) ?? 0)
    .y((d) => y(d.current))
    .curve(curveMonotoneX)(data);
  const priorLine = line<CadencePoint>()
    .x((d) => x(d.month) ?? 0)
    .y((d) => y(d.prior))
    .curve(curveMonotoneX)(data);
  const currentArea = area<CadencePoint>()
    .x((d) => x(d.month) ?? 0)
    .y0(y(0))
    .y1((d) => y(d.current))
    .curve(curveMonotoneX)(data);

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg role="img" aria-label={label} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={0} y={y(t)} dominantBaseline="central" className="numeric fill-muted-foreground" style={{ fontSize: 10 }}>
              {t}
            </text>
          </g>
        ))}

        {currentArea ? (
          <motion.path d={currentArea} fill={`url(#${gradientId})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={motionTransition({ duration: 0.5, delay: 0.3 })} />
        ) : null}
        {priorLine ? (
          <motion.path
            d={priorLine}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={1.75}
            strokeDasharray="4 3"
            strokeLinecap="round"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={motionTransition({ duration: 0.5 })}
          />
        ) : null}
        {currentLine ? (
          <motion.path
            d={currentLine}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={motionTransition({ duration: 0.8, ease: [0.22, 1, 0.36, 1] })}
          />
        ) : null}

        {data.map((d) => (
          <g key={d.month}>
            <circle cx={x(d.month) ?? 0} cy={y(d.prior)} r={2.5} fill="var(--card)" stroke="var(--muted-foreground)" strokeWidth={1.5} />
            <circle cx={x(d.month) ?? 0} cy={y(d.current)} r={3} fill="var(--chart-1)" />
          </g>
        ))}

        {data.map((d) => (
          <text key={d.month} x={x(d.month) ?? 0} y={height - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
            {d.month}
          </text>
        ))}
      </svg>

      <div className="mt-3 flex items-center justify-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: "var(--chart-1)" }} />
          {currentLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--muted-foreground)" }} />
          {priorLabel}
        </span>
      </div>
    </div>
  );
}
