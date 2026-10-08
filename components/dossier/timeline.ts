import { scaleSqrt, scaleTime } from "d3-scale";
import type { Timeline, TimelineLane, TimelineMeeting } from "@/lib/domain/dossier";
import { fiscalYearRange } from "@/lib/domain/fiscal-year";
import { fyLabel } from "@/lib/domain/glance";

/**
 * Where everything on the engagement timeline goes: fiscal-year bands across, one lane per
 * topic down, a mark per meeting sized by its participants. Pure arithmetic over a width, so
 * the chart, its tests and its tooltip agree on every pixel.
 */

export const LANE_HEIGHT = 32;
export const LABEL_WIDTH = 132;
export const AXIS_HEIGHT = 22;
export const UNDATED_WIDTH = 84;
export const PAD_RIGHT = 8;
export const PAD_BOTTOM = 6;
export const RADIUS: readonly [number, number] = [3.5, 9];
/** Below this width the lanes stack into a list instead. */
export const NARROW = 560;

export type TimelineBand = { fy: number; label: string; x0: number; x1: number };
export type TimelineRow = { lane: TimelineLane; y: number };
export type TimelineMark = { meeting: TimelineMeeting; cx: number; cy: number; r: number };
export type TimelineLayout = {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  bands: TimelineBand[];
  rows: TimelineRow[];
  /** Dated marks first, earliest to latest, then the unscheduled. */
  marks: TimelineMark[];
  /** Where today falls, or null when the axis does not reach it. */
  today: number | null;
  /** The column at the right edge for meetings without a date. */
  undated: { x0: number; x1: number } | null;
};

export function layoutTimeline({ timeline, width, now }: { timeline: Timeline; width: number; now: Date }): TimelineLayout {
  const hasUndated = timeline.meetings.some((m) => m.date === null);
  const plotLeft = LABEL_WIDTH;
  const plotRight = width - PAD_RIGHT - (hasUndated ? UNDATED_WIDTH : 0);
  const start = fiscalYearRange(timeline.firstFy).start;
  const end = fiscalYearRange(timeline.lastFy).end;
  const x = scaleTime().domain([start, end]).range([plotLeft, plotRight]);

  const bands: TimelineBand[] = [];
  for (let fy = timeline.firstFy; fy <= timeline.lastFy; fy++) {
    const range = fiscalYearRange(fy);
    bands.push({ fy, label: fyLabel(fy), x0: x(range.start), x1: x(range.end) });
  }

  const rows = timeline.lanes.map((lane, i): TimelineRow => ({ lane, y: AXIS_HEIGHT + i * LANE_HEIGHT + LANE_HEIGHT / 2 }));
  const rowY = new Map(rows.map((row) => [row.lane.id, row.y]));
  const yOf = (m: TimelineMeeting) => rowY.get(m.laneId) ?? AXIS_HEIGHT + LANE_HEIGHT / 2;

  const most = Math.max(1, ...timeline.meetings.map((m) => m.participants));
  const r = scaleSqrt().domain([0, most]).range(RADIUS).clamp(true);

  const dated = timeline.meetings.filter((m) => m.date !== null).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  const marks: TimelineMark[] = dated.map((m) => ({ meeting: m, cx: x(m.date!), cy: yOf(m), r: r(m.participants) }));

  const undated = hasUndated ? { x0: plotRight, x1: width - PAD_RIGHT } : null;
  if (undated) {
    // Unscheduled meetings share a column; those in one lane spread across it so none hides another.
    const perLane = new Map<string, TimelineMeeting[]>();
    for (const m of timeline.meetings) if (m.date === null) perLane.set(m.laneId, [...(perLane.get(m.laneId) ?? []), m]);
    for (const group of perLane.values()) {
      group.forEach((m, k) => marks.push({ meeting: m, cx: undated.x0 + (UNDATED_WIDTH * (k + 1)) / (group.length + 1), cy: yOf(m), r: r(m.participants) }));
    }
  }

  const at = now.getTime();
  const today = at >= start.getTime() && at <= end.getTime() ? x(now) : null;

  return { width, height: AXIS_HEIGHT + rows.length * LANE_HEIGHT + PAD_BOTTOM, plotLeft, plotRight, bands, rows, marks, today, undated };
}
