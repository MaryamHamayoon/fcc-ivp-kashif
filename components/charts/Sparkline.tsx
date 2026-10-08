import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { useId } from "react";
import { cn } from "@/lib/utils";

export type SparklineProps = {
  data: number[];
  /** Accessible description, e.g. "Engagements by fiscal month". */
  label: string;
  width?: number;
  height?: number;
  /** CSS color for the line; the area fades from it. */
  stroke?: string;
  className?: string;
};

/** A tiny d3 line with a soft area beneath it and a dot on the latest point. */
export function Sparkline({ data, label, width = 64, height = 20, stroke = "var(--chart-1)", className }: SparklineProps) {
  const id = useId();
  const gradientId = `spark-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const points = data.length > 0 ? data : [0];
  const pad = 2;
  const x = scaleLinear()
    .domain([0, Math.max(points.length - 1, 1)])
    .range([pad, width - pad]);
  const y = scaleLinear()
    .domain([0, Math.max(...points, 1)])
    .range([height - pad, pad]);
  const linePath = line<number>()
    .x((_, i) => x(i))
    .y((d) => y(d))
    .curve(curveMonotoneX)(points);
  const areaPath = area<number>()
    .x((_, i) => x(i))
    .y0(height)
    .y1((d) => y(d))
    .curve(curveMonotoneX)(points);
  const lastIndex = points.length - 1;
  const last = points[lastIndex] ?? 0;

  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0 overflow-visible", className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
      {linePath ? <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /> : null}
      <circle cx={x(lastIndex)} cy={y(last)} r={2} fill={stroke} />
    </svg>
  );
}
