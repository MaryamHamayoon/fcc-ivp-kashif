"use client";

import { motion } from "motion/react";
import { useId, useState } from "react";
import { ChartFigure } from "@/components/charts/ChartFigure";
import { useChartDims } from "@/components/charts/useChartDims";
import type { Timeline } from "@/lib/domain/dossier";
import { STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY, formatNumber } from "@/lib/format";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import { AXIS_HEIGHT, LANE_HEIGHT, layoutTimeline, NARROW, PAD_RIGHT, type TimelineMark } from "./timeline";
import { TimelineList } from "./TimelineList";

const DEFAULT_WIDTH = 760;
const LABEL_CHARS = 18;
const EASE = [0.22, 1, 0.36, 1] as const;

const truncate = (name: string) => (name.length > LABEL_CHARS ? `${name.slice(0, LABEL_CHARS - 1)}…` : name);
const people = (n: number) => `${formatNumber(n)} ${n === 1 ? "participant" : "participants"}`;
const statusVar = (status: string) => `var(--status-${status.replace("_", "-")})`;

function sentence(mark: TimelineMark): string {
  const m = mark.meeting;
  return `${m.title}, ${m.date ? formatDateNY(m.date, "short") : "not yet scheduled"}, ${people(m.participants)}, ${STATUS_LABELS[m.status]}`;
}

export type EngagementTimelineProps = {
  timeline: Timeline;
  now: Date;
  /** Who the timeline is about — "Kenya", "Ofcom" — for the figure's spoken description. */
  subject: string;
  className?: string;
};

/**
 * The dossier's signature piece: every meeting as a mark on a fiscal-year axis, one lane per
 * topic, sized by how many people came, coloured by status. Hover or focus a mark for the
 * meeting; Enter or a click opens its record. Narrow screens get the same rows as a list.
 */
export function EngagementTimeline({ timeline, now, subject, className }: EngagementTimelineProps) {
  const { ref, width: measured } = useChartDims();
  const reduce = useReducedMotion();
  const tipId = useId();
  const [active, setActive] = useState<number | null>(null);

  const laneName = new Map(timeline.lanes.map((l) => [l.id, l.name]));
  const rows = [...timeline.meetings]
    .sort((a, b) => (b.date?.getTime() ?? Infinity) - (a.date?.getTime() ?? Infinity))
    .map((m) => [m.date ? formatDateNY(m.date, "short") : "Not yet scheduled", m.title, laneName.get(m.laneId) ?? "Other", m.participants, STATUS_LABELS[m.status]]);
  const span = timeline.firstFy === timeline.lastFy ? `in FY${String(timeline.firstFy).slice(2)}` : `from FY${String(timeline.firstFy).slice(2)} to FY${String(timeline.lastFy).slice(2)}`;
  const description = `${formatNumber(timeline.meetings.length)} ${timeline.meetings.length === 1 ? "meeting" : "meetings"} with ${subject} ${span}, across ${timeline.lanes.length} topic ${timeline.lanes.length === 1 ? "lane" : "lanes"}. Each mark is a meeting, placed by date and sized by participants.`;

  const narrow = measured > 0 && measured < NARROW;
  const width = measured || DEFAULT_WIDTH;
  const layout = layoutTimeline({ timeline, width, now });
  const shown = active !== null ? layout.marks[active] : undefined;

  return (
    <ChartFigure title="Engagement timeline" level={2} note="Marks sized by participants" description={description} table={{ columns: ["Date", "Meeting", "Topic", "Participants", "Status"], rows }} className={className}>
      <div ref={ref} className="relative w-full">
        {timeline.meetings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No engagements to plot yet.</p>
        ) : narrow ? (
          <TimelineList timeline={timeline} />
        ) : (
          <>
            <svg width="100%" height={layout.height} viewBox={`0 0 ${width} ${layout.height}`} className="block overflow-visible">
              {layout.bands.map((band, i) => (
                <g key={band.fy} aria-hidden>
                  <rect x={band.x0} y={AXIS_HEIGHT} width={Math.max(0, band.x1 - band.x0)} height={layout.rows.length * LANE_HEIGHT} fill={i % 2 === 1 ? "var(--muted)" : "transparent"} opacity={0.55} />
                  <text x={(band.x0 + band.x1) / 2} y={AXIS_HEIGHT - 8} textAnchor="middle" className="numeric fill-muted-foreground" style={{ fontSize: 10.5, fontWeight: 600 }}>
                    {band.label}
                  </text>
                </g>
              ))}
              {layout.undated ? (
                <g aria-hidden>
                  <line x1={layout.undated.x0} x2={layout.undated.x0} y1={AXIS_HEIGHT} y2={layout.height - 6} stroke="var(--border)" strokeDasharray="2 3" />
                  <text x={(layout.undated.x0 + layout.undated.x1) / 2} y={AXIS_HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                    Unscheduled
                  </text>
                </g>
              ) : null}
              {layout.rows.map((row, i) => (
                <g key={row.lane.id} aria-hidden>
                  {i > 0 ? <line x1={0} x2={width - PAD_RIGHT} y1={row.y - LANE_HEIGHT / 2} y2={row.y - LANE_HEIGHT / 2} stroke="var(--border)" /> : null}
                  <text x={0} y={row.y} dominantBaseline="central" className="fill-foreground" style={{ fontSize: 12 }}>
                    <title>{row.lane.name}</title>
                    {truncate(row.lane.name)}
                  </text>
                </g>
              ))}
              {layout.today !== null ? (
                <g aria-hidden>
                  <line x1={layout.today} x2={layout.today} y1={AXIS_HEIGHT - 3} y2={layout.height - 6} stroke="var(--foreground)" strokeDasharray="3 3" opacity={0.45} />
                  <text x={layout.today} y={layout.height - 0} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>
                    Today
                  </text>
                </g>
              ) : null}
              {layout.marks.map((mark, i) => (
                <a
                  key={mark.meeting.id}
                  href={`/meetings/${mark.meeting.id}`}
                  tabIndex={0}
                  aria-label={sentence(mark)}
                  aria-describedby={active === i ? tipId : undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive((current) => (current === i ? null : current))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((current) => (current === i ? null : current))}
                  className="cursor-pointer outline-none [&:focus-visible>circle:last-child]:stroke-ring"
                >
                  <circle cx={mark.cx} cy={mark.cy} r={Math.max(12, mark.r + 4)} fill="transparent" pointerEvents="all" />
                  <motion.circle
                    cx={mark.cx}
                    cy={mark.cy}
                    initial={reduce ? false : { r: 0 }}
                    animate={{ r: mark.r }}
                    transition={motionTransition({ delay: Math.min(i, 30) * 0.02, duration: 0.4, ease: EASE })}
                    style={{ fill: statusVar(mark.meeting.status) }}
                    stroke="var(--card)"
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                </a>
              ))}
            </svg>
            <div role="tooltip" id={tipId} hidden={!shown} className="pointer-events-none absolute z-10 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md" style={shown ? { left: `${(shown.cx / width) * 100}%`, top: shown.cy - shown.r - 8 } : undefined}>
              {shown ? (
                <>
                  <span className="block font-semibold text-foreground">{shown.meeting.title}</span>
                  <span className="block text-muted-foreground">
                    {shown.meeting.date ? formatDateNY(shown.meeting.date, "short") : "Not yet scheduled"} · {people(shown.meeting.participants)} · {STATUS_LABELS[shown.meeting.status]}
                  </span>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </ChartFigure>
  );
}
