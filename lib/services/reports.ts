import { ReportQuery, type ReportQueryInput } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { makeMeetingsRepo, type MeetingListItem } from "@/lib/db/repos/meetings";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { makeReportsRepo } from "@/lib/db/repos/reports";
import { fiscalYearOf } from "@/lib/domain/fiscal-year";
import { type PolicyUser, readableScope } from "@/lib/domain/policy";
import {
  applyReportFilters,
  type CountryRow,
  countriesReport,
  type CustomMeasure,
  customReport,
  type CustomRows,
  expertsReport,
  fiscalYearTally,
  participantsReport,
  programSummary,
  type ReportDataset,
  type ReportFilters,
  type ReportMeeting,
  type Summary,
  type Tally,
} from "@/lib/domain/reports";
import type { NamedCount } from "@/lib/domain/tallies";
import { type Brief, briefFor } from "@/lib/reports/brief-data";
import { FORMAT_LABELS, type Role, STATUS_LABELS } from "@/lib/domain/types";
import { assertCan } from "./access";

/**
 * Reports: one dataset per request, every report derived from it. The prior fiscal year is
 * loaded with the same filters, so each delta compares like with like; the export routes
 * build the same dataset from the same query, so what is exported is what was shown.
 */

export type ReportOption = { value: string; label: string; hint?: string };
export type ReportOptions = {
  regions: ReportOption[];
  countries: ReportOption[];
  topics: ReportOption[];
  bureaus: ReportOption[];
  leads: ReportOption[];
  /** The three most recent, current first. */
  fiscalYears: number[];
  currentFiscalYear: number;
};

/** Roles that carry meetings; anyone else would only pad the "Lead" filter. */
const LEAD_ROLES: readonly Role[] = ["admin", "coordinator", "regional_lead"];

/** Only the filter keys, and only the ones set, so `filters` reads as what the reader chose. */
export function reportFilters(query: ReportQueryInput): ReportFilters {
  const filters: ReportFilters = {};
  if (query.regionId) filters.regionId = query.regionId;
  if (query.countryCode) filters.countryCode = query.countryCode;
  if (query.topicId) filters.topicId = query.topicId;
  if (query.format) filters.format = query.format;
  if (query.bureauCode) filters.bureauCode = query.bureauCode;
  if (query.status?.length) filters.status = query.status;
  if (query.leadUserId) filters.leadUserId = query.leadUserId;
  return filters;
}

/**
 * Nobody the policy admits to reports is scoped today; the check stays so a future role with
 * a narrower scope cannot see past it by way of a report.
 */
function visibleTo(actor: PolicyUser) {
  const scope = readableScope(actor);
  return (m: MeetingListItem) => "all" in scope || m.experts.some((e) => e.staffId === scope.staffId);
}

export async function loadReportDataset(db: Db, query: ReportQueryInput, actor: PolicyUser, now = new Date()): Promise<ReportDataset> {
  assertCan(actor, "reports.read", { kind: "system" });
  const fy = query.fy ?? fiscalYearOf(now);
  const filters = reportFilters(query);
  const visible = visibleTo(actor);

  const meetingsRepo = makeMeetingsRepo(db);
  const [current, prior] = await Promise.all([meetingsRepo.forFiscalYear(fy, now), meetingsRepo.forFiscalYear(fy - 1, now)]);
  const meetings = applyReportFilters(current.filter(visible), filters);
  const priorMeetings = applyReportFilters(prior.filter(visible), filters);

  const reports = makeReportsRepo(db);
  const ids = (list: MeetingListItem[]) => list.map((m) => m.id);
  const [participants, priorParticipants, experts] = await Promise.all([reports.participantRows(ids(meetings)), reports.participantRows(ids(priorMeetings)), reports.expertRows(ids(meetings))]);

  return { fy, now, filters, meetings, priorMeetings, participants, priorParticipants, experts };
}

export type HistorySubject = { countryCode?: string; orgId?: string };

/** A dossier's engagement history: every meeting, any year, newest first. */
export async function loadHistory(db: Db, subject: HistorySubject, actor: PolicyUser, now = new Date()): Promise<ReportMeeting[]> {
  assertCan(actor, "reports.read", { kind: "system" });
  const rows = await makeMeetingsRepo(db).forHistory(subject, now);
  return rows.filter(visibleTo(actor));
}

export type BuiltReports = {
  summary: Summary;
  tally: Tally;
  participants: ReturnType<typeof participantsReport>;
  experts: ReturnType<typeof expertsReport>;
  countries: CountryRow[];
  tracker: ReportMeeting[];
  custom: NamedCount[];
  customChoice: { rows: CustomRows; measure: CustomMeasure };
};

/** All seven reports from one dataset; cheap enough to build together, and the tabs switch without a request. */
export function buildReports(ds: ReportDataset, rows: CustomRows, measure: CustomMeasure): BuiltReports {
  return {
    summary: programSummary(ds),
    tally: fiscalYearTally(ds),
    participants: participantsReport(ds),
    experts: expertsReport(ds),
    countries: countriesReport(ds),
    tracker: ds.meetings,
    custom: customReport(ds, rows, measure),
    customChoice: { rows, measure },
  };
}

/** The filter bar's choices — the meetings list's own, plus the three most recent fiscal years. */
export async function reportOptions(db: Db, actor: PolicyUser, now = new Date()): Promise<ReportOptions> {
  assertCan(actor, "reports.read", { kind: "system" });
  const reference = makeReferenceRepo(db);
  const [regions, countries, topics, bureaus, users] = await Promise.all([reference.regions(), reference.countries(), reference.topics(), reference.bureaus(), reference.users()]);
  const currentFiscalYear = fiscalYearOf(now);
  return {
    regions: regions.map((region) => ({ value: region.id, label: region.name })),
    countries: countries.map((country) => ({ value: country.cca2, label: country.name, hint: country.region.name })),
    topics: topics.map((topic) => ({ value: topic.id, label: topic.name })),
    bureaus: bureaus.map((bureau) => ({ value: bureau.code, label: bureau.name, hint: bureau.code })),
    leads: users.filter((user) => LEAD_ROLES.includes(user.role)).map((user) => ({ value: user.id, label: user.name })),
    fiscalYears: [currentFiscalYear, currentFiscalYear - 1, currentFiscalYear - 2],
    currentFiscalYear,
  };
}

/** What a report covers, in one line, naming things as the filter bar does: "Region: Africa · Status: Completed, Closed". */
export function describeFilters(filters: ReportFilters, options: ReportOptions): string {
  const name = (list: ReportOption[], value: string) => list.find((o) => o.value === value)?.label ?? value;
  const parts: string[] = [];
  if (filters.regionId) parts.push(`Region: ${name(options.regions, filters.regionId)}`);
  if (filters.countryCode) parts.push(`Country: ${name(options.countries, filters.countryCode)}`);
  if (filters.topicId) parts.push(`Topic: ${name(options.topics, filters.topicId)}`);
  if (filters.format) parts.push(`Format: ${FORMAT_LABELS[filters.format]}`);
  if (filters.bureauCode) parts.push(`Bureau: ${name(options.bureaus, filters.bureauCode)}`);
  if (filters.status?.length) parts.push(`Status: ${filters.status.map((s) => STATUS_LABELS[s]).join(", ")}`);
  if (filters.leadUserId) parts.push(`Lead: ${name(options.leads, filters.leadUserId)}`);
  return parts.length ? parts.join(" · ") : "All meetings";
}

/** The one-page executive brief for a fiscal year: the unfiltered dataset, summarised. */
export async function loadBrief(db: Db, fy: number, actor: PolicyUser, now = new Date()): Promise<Brief> {
  const ds = await loadReportDataset(db, { ...ReportQuery.parse({}), fy }, actor, now);
  return briefFor(ds, buildReports(ds, "topic", "meetings"));
}
