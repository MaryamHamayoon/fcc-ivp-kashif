import { FISCAL_MONTH_LABELS, fiscalMonthIndex, fiscalYearOf } from "./fiscal-year";
import type { MeetingFormat, MeetingStatus } from "./types";

/** Counting helpers behind every dashboard figure and the FY tallies. */

export type NamedCount = { key: string; label: string; count: number };

export type TallyMeeting = {
  id: string;
  fiscalYear: number;
  status: MeetingStatus;
  format: MeetingFormat;
  regionName: string;
  countryName: string;
  countryCode: string;
  topics: string[];
  bureaus: string[];
  participantTotal: number;
  scheduledStart: Date | null;
};

/** Statuses that count as engagements held (or locked in) for tallies. */
export const COUNTED_STATUSES: readonly MeetingStatus[] = ["confirmed", "completed", "closed"];

export function countBy<T>(items: T[], key: (item: T) => string | string[] | null, label: (k: string) => string = (k) => k): NamedCount[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k == null) continue;
    for (const kk of Array.isArray(k) ? k : [k]) map.set(kk, (map.get(kk) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([k, count]) => ({ key: k, label: label(k), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Meetings held per fiscal month (Oct…Sep) for `fy` and the year before it. */
export function monthlyCadence(meetings: TallyMeeting[], fy: number): { month: string; current: number; prior: number }[] {
  const current = new Array<number>(12).fill(0);
  const prior = new Array<number>(12).fill(0);
  for (const m of meetings) {
    if (!m.scheduledStart || !COUNTED_STATUSES.includes(m.status)) continue;
    const y = fiscalYearOf(m.scheduledStart);
    const idx = fiscalMonthIndex(m.scheduledStart);
    if (y === fy) current[idx] = (current[idx] ?? 0) + 1;
    else if (y === fy - 1) prior[idx] = (prior[idx] ?? 0) + 1;
  }
  return FISCAL_MONTH_LABELS.map((month, i) => ({ month, current: current[i] ?? 0, prior: prior[i] ?? 0 }));
}
