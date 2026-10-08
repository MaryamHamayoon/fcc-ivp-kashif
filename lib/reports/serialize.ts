import type { BrieferRow, BureauRow, CategoryFigure, CountryRow, CustomMeasure, CustomRows, ParticipantReportRow, ReportDataset, ReportFilters, Summary, Tally } from "@/lib/domain/reports";
import type { NamedCount } from "@/lib/domain/tallies";
import type { BuiltReports } from "@/lib/services/reports";
import { type ReportTable, trackerTable } from "./tables";

/**
 * The reports page is rendered on the server and hands the client one plain object: every
 * report, with its dates as ISO strings, so nothing crosses the wire that JSON cannot carry.
 */

export type Iso = string;

export type ParticipantsPayload = {
  rows: (Omit<ParticipantReportRow, "date"> & { date: Iso | null })[];
  totals: CategoryFigure[];
  plannedTotal: number;
  actualTotal: number;
};

export type CountryPayloadRow = Omit<CountryRow, "firstAt" | "lastAt"> & { firstAt: Iso | null; lastAt: Iso | null };

export type ReportsPayload = {
  fy: number;
  nowIso: Iso;
  filters: ReportFilters;
  /** Meetings in the filters, all statuses — zero means the page shows its empty state. */
  meetingCount: number;
  summary: Summary;
  tally: Tally;
  participants: ParticipantsPayload;
  experts: { bureaus: BureauRow[]; briefers: BrieferRow[] };
  countries: CountryPayloadRow[];
  /** The tracker is a table already; the page renders it as one, each row linked by the id beside it. */
  tracker: ReportTable;
  trackerIds: string[];
  custom: { rows: CustomRows; measure: CustomMeasure; data: NamedCount[] };
};

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export function serializeReports(built: BuiltReports, ds: ReportDataset): ReportsPayload {
  return {
    fy: ds.fy,
    nowIso: ds.now.toISOString(),
    filters: ds.filters,
    meetingCount: ds.meetings.length,
    summary: built.summary,
    tally: built.tally,
    participants: { ...built.participants, rows: built.participants.rows.map((row) => ({ ...row, date: iso(row.date) })) },
    experts: built.experts,
    countries: built.countries.map((row) => ({ ...row, firstAt: iso(row.firstAt), lastAt: iso(row.lastAt) })),
    tracker: trackerTable(built.tracker),
    trackerIds: built.tracker.map((m) => m.id),
    custom: { ...built.customChoice, data: built.custom },
  };
}
