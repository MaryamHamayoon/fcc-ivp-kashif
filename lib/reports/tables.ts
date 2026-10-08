import { REPORT_LABELS, type ReportId } from "@/lib/api/schemas";
import type { CsvColumn, CsvValue } from "@/lib/csv";
import { nyParts } from "@/lib/domain/fiscal-year";
import { fyLabel } from "@/lib/domain/glance";
import { type BureauRow, CUSTOM_MEASURE_LABELS, CUSTOM_ROW_LABELS, type CustomMeasure, type CustomRows, type ReportDataset, type ReportMeeting, type TallyRow } from "@/lib/domain/reports";
import type { NamedCount } from "@/lib/domain/tallies";
import { EXPERT_STATUS_LABELS, FORMAT_LABELS, PARTICIPANT_CATEGORIES, PARTICIPANT_CATEGORY_LABELS, STATUS_LABELS } from "@/lib/domain/types";
import type { BuiltReports } from "@/lib/services/reports";

/**
 * Every report as one flat table: the shape the CSV and the workbook share, and the shape
 * "Show data" reads under a chart. Cells are plain values — the exporters and the screen
 * decide how a number or a date is written; `formats` says which columns are not counts.
 */

export type ReportCell = string | number | null;
/** How a numeric cell is shown and how Excel formats it; "year" keeps 2026 from becoming 2,026. */
export type CellFormat = "percent" | "decimal" | "year";
export type ReportTable = { name: string; columns: string[]; rows: ReportCell[][]; formats?: Record<number, CellFormat> };

const pad = (n: number) => String(n).padStart(2, "0");

/** A calendar date as Washington sees it, in the form every spreadsheet sorts correctly. */
export function isoDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const { year, month, day } = nyParts(typeof date === "string" ? new Date(date) : date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

function cell(value: CsvValue): ReportCell {
  if (value == null) return null;
  if (value instanceof Date) return isoDate(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

/** The tracker: the meetings list with every column leadership asks for, in the order they ask. */
export function trackerColumns(): CsvColumn<ReportMeeting>[] {
  return [
    { header: "IVP code", value: (m) => m.code },
    { header: "Meeting", value: (m) => m.title },
    { header: "Fiscal year", value: (m) => m.fiscalYear },
    { header: "Status", value: (m) => STATUS_LABELS[m.status] },
    { header: "Date", value: (m) => isoDate(m.scheduledStart) },
    { header: "End", value: (m) => isoDate(m.scheduledEnd) },
    { header: "Format", value: (m) => FORMAT_LABELS[m.format] },
    { header: "Region", value: (m) => m.regionName },
    { header: "Country", value: (m) => m.countryName },
    { header: "Other countries", value: (m) => m.countryCodes.filter((code) => code !== m.countryCode).join("; ") },
    { header: "Organization", value: (m) => m.orgName },
    { header: "Lead", value: (m) => m.leadName ?? "" },
    { header: "Topics", value: (m) => m.topics.map((t) => t.name).join("; ") },
    { header: "Experts", value: (m) => m.experts.map((e) => `${e.name} (${EXPERT_STATUS_LABELS[e.status]})`).join("; ") },
    { header: "Delegation size", value: (m) => m.delegationSize },
    { header: "Participants", value: (m) => m.participantTotal },
    { header: "OCH attending", value: (m) => m.ochAttending },
    { header: "Requested on", value: (m) => isoDate(m.requestedAt) },
  ];
}

/** The tracker as a table — the meetings given, in the order given. */
export function trackerTable(meetings: ReportMeeting[], name: string = REPORT_LABELS.tracker): ReportTable {
  const columns = trackerColumns();
  const fiscalYear = columns.findIndex((c) => c.header === "Fiscal year");
  return { name, columns: columns.map((c) => c.header), rows: meetings.map((m) => columns.map((c) => cell(c.value(m)))), formats: { [fiscalYear]: "year" } };
}

const tallyCells = (r: TallyRow): ReportCell[] => [r.label, r.meetings, r.countries, r.participants, r.inPerson, r.virtual, r.hybrid, r.priorMeetings];

/** Tally rows by any grouping — months, regions, topics — with an optional total at the foot. */
export function tallyTable(name: string, firstColumn: string, rows: TallyRow[], total: TallyRow | null, fy: number): ReportTable {
  return {
    name,
    columns: [firstColumn, "Meetings", "Countries", "Participants", "In person", "Virtual", "Hybrid", `${fyLabel(fy - 1)} meetings`],
    rows: [...rows.map(tallyCells), ...(total ? [tallyCells(total)] : [])],
  };
}

/** Bureaus and offices: how often they were asked, how often they said yes, and how quickly. */
export function bureausTable(bureaus: BureauRow[]): ReportTable {
  return {
    name: REPORT_LABELS.experts,
    columns: ["Bureau", "Code", "Meetings", "Experts", "Requested", "Confirmed", "Declined", "Confirmed rate", "Median response (business days)"],
    rows: bureaus.map((b) => [b.bureauName, b.bureauCode, b.meetings, b.experts, b.requested, b.confirmed, b.declined, b.confirmedRate, b.medianResponseDays]),
    formats: { 7: "percent", 8: "decimal" },
  };
}

type CountryLike = { countryName: string; countryCode: string; regionName: string; engagements: number; participants: number; firstAt: Date | string | null; lastAt: Date | string | null; topics: string[] };

/** Countries engaged, with when the relationship began and was last active. Dates may already be ISO strings. */
export function countriesTable(countries: CountryLike[]): ReportTable {
  return {
    name: REPORT_LABELS.countries,
    columns: ["Country", "Code", "Region", "Engagements", "Participants", "First engaged", "Last engaged", "Top topics"],
    rows: countries.map((c) => [c.countryName, c.countryCode, c.regionName, c.engagements, c.participants, isoDate(c.firstAt), isoDate(c.lastAt), c.topics.join("; ")]),
  };
}

/** The custom report: whatever rows against whatever measure the reader chose. */
export function customTable(rows: CustomRows, measure: CustomMeasure, data: NamedCount[]): ReportTable {
  return {
    name: `${CUSTOM_ROW_LABELS[rows]} × ${CUSTOM_MEASURE_LABELS[measure]}`,
    columns: [CUSTOM_ROW_LABELS[rows], CUSTOM_MEASURE_LABELS[measure]],
    rows: data.map((c) => [c.label, c.count]),
  };
}

export function tableFor(report: ReportId, built: BuiltReports, ds: ReportDataset): ReportTable {
  switch (report) {
    case "summary":
      return {
        name: REPORT_LABELS.summary,
        columns: ["Figure", fyLabel(ds.fy), fyLabel(ds.fy - 1), "Basis"],
        rows: built.summary.figures.map((f) => [f.label, f.value, f.prior, f.note]),
      };
    case "tally":
      return tallyTable(REPORT_LABELS.tally, "Month", built.tally.months, built.tally.total, ds.fy);
    case "participants": {
      const { rows, totals, plannedTotal, actualTotal } = built.participants;
      return {
        name: REPORT_LABELS.participants,
        columns: ["IVP code", "Date", "Country", "Organization", "Status", ...PARTICIPANT_CATEGORIES.flatMap((c) => [`${PARTICIPANT_CATEGORY_LABELS[c]} planned`, `${PARTICIPANT_CATEGORY_LABELS[c]} actual`]), "Planned", "Actual"],
        rows: [
          ...rows.map((r) => [r.code, isoDate(r.date), r.countryName, r.orgName, STATUS_LABELS[r.status], ...PARTICIPANT_CATEGORIES.flatMap((c) => [r.byCategory[c].planned, r.byCategory[c].actual]), r.planned, r.actual]),
          ["Total", null, null, null, null, ...totals.flatMap((t) => [t.planned, t.actual]), plannedTotal, actualTotal],
        ],
      };
    }
    case "experts":
      return bureausTable(built.experts.bureaus);
    case "countries":
      return countriesTable(built.countries);
    case "tracker":
      return trackerTable(built.tracker);
    case "custom":
      return customTable(built.customChoice.rows, built.customChoice.measure, built.custom);
  }
}
