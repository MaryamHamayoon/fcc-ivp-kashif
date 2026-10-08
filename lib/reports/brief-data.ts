import { fyLabel } from "@/lib/domain/glance";
import type { CategoryFigure, Figure, ReportDataset } from "@/lib/domain/reports";
import type { NamedCount } from "@/lib/domain/tallies";
import type { MeetingStatus } from "@/lib/domain/types";
import type { BuiltReports } from "@/lib/services/reports";

/**
 * The executive brief: one page a director reads in a minute. Everything on it is already
 * computed for the reports; this file only chooses, caps and orders.
 */

export type BriefNext = { meetingId: string; code: string; date: Date; countryName: string; orgName: string; status: MeetingStatus };
export type BriefStuck = { meetingId: string; code: string; title: string; who: string; days: number };

export type Brief = {
  fy: number;
  fyLabel: string;
  priorLabel: string;
  generatedAt: Date;
  headline: string;
  /** Meetings on file for the year, all statuses; zero means there is nothing to brief. */
  meetingCount: number;
  figures: Figure[];
  where: { countries: NamedCount[]; regions: NamedCount[] };
  what: NamedCount[];
  /** Up to five, soonest first, inside the next thirty days. */
  next: BriefNext[];
  /** Up to five, longest wait first. */
  stuck: BriefStuck[];
  participants: CategoryFigure[];
  formats: NamedCount[];
};

export const BRIEF_LIST_LIMIT = 5;
export const BRIEF_RANK_LIMIT = 6;
const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

/** Statuses with a date still ahead of them; a held, finished or cancelled meeting is not "next". */
const AHEAD: readonly MeetingStatus[] = ["requested", "developing", "clearance", "confirmed"];

export function briefFor(ds: ReportDataset, built: BuiltReports): Brief {
  const { summary } = built;
  const horizon = ds.now.getTime() + WINDOW_DAYS * DAY_MS;

  const next = ds.meetings
    .filter((m) => m.scheduledStart !== null && AHEAD.includes(m.status) && m.scheduledStart.getTime() >= ds.now.getTime() && m.scheduledStart.getTime() <= horizon)
    .sort((a, b) => a.scheduledStart!.getTime() - b.scheduledStart!.getTime())
    .slice(0, BRIEF_LIST_LIMIT)
    .map((m): BriefNext => ({ meetingId: m.id, code: m.code, date: m.scheduledStart!, countryName: m.countryName, orgName: m.orgName, status: m.status }));

  const stuck = ds.meetings
    .filter((m) => m.waiting !== null)
    .sort((a, b) => b.waiting!.businessDays - a.waiting!.businessDays || a.code.localeCompare(b.code, "en"))
    .slice(0, BRIEF_LIST_LIMIT)
    .map((m): BriefStuck => ({ meetingId: m.id, code: m.code, title: m.title, who: m.waiting!.label, days: m.waiting!.businessDays }));

  return {
    fy: ds.fy,
    fyLabel: fyLabel(ds.fy),
    priorLabel: fyLabel(ds.fy - 1),
    generatedAt: ds.now,
    headline: summary.headline,
    meetingCount: ds.meetings.length,
    figures: summary.figures,
    where: { countries: summary.countries.slice(0, BRIEF_RANK_LIMIT), regions: summary.regions.slice(0, BRIEF_RANK_LIMIT) },
    what: summary.topics.slice(0, BRIEF_RANK_LIMIT),
    next,
    stuck,
    participants: summary.participantsByCategory.filter((c) => c.planned > 0 || c.actual > 0),
    formats: summary.formats.filter((f) => f.count > 0),
  };
}
