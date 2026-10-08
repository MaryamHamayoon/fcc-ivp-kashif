import { businessDaysBetween } from "./business-days";
import { FISCAL_MONTH_LABELS, fiscalMonthIndex, fiscalYearOf } from "./fiscal-year";
import { glanceHeadline, type GlanceTense } from "./glance";
import { COUNTED_STATUSES, countBy, type NamedCount } from "./tallies";
import { type ExpertStatus, FORMAT_LABELS, MEETING_FORMATS, type MeetingFormat, type MeetingStatus, PARTICIPANT_CATEGORIES, PARTICIPANT_CATEGORY_LABELS, type ParticipantCategory, STATUS_LABELS } from "./types";

/**
 * Every report the program publishes, as a pure function of the records. Nothing here is
 * stored or re-typed: the inputs are the meetings list for a fiscal year plus two thin row
 * sets (participants by category, experts by bureau), and each report is derived from them
 * on request. The Excel tally tabs the office kept by hand are these functions, run.
 *
 * One rule runs through all of it: a meeting counts once it is confirmed, completed or
 * closed. Requested, developing, on-hold and cancelled meetings are work in progress, and
 * leadership is never shown them as engagements held.
 */

/* --------------------------------- inputs ---------------------------------- */

/** What a report needs to know about one meeting; the repository's list item satisfies it. */
export type ReportMeeting = {
  id: string;
  code: string;
  title: string;
  status: MeetingStatus;
  format: MeetingFormat;
  regionId: string;
  regionName: string;
  countryCode: string;
  countryName: string;
  /** Primary first, then any others the delegation represents. */
  countryCodes: string[];
  orgId: string | null;
  orgName: string;
  orgShortName: string | null;
  leadUserId: string | null;
  leadName: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  topics: { id: string; name: string }[];
  experts: { staffId: string; name: string; bureauCode: string | null; status: ExpertStatus }[];
  /** The meeting's own headcount, used when no category rows exist for it. */
  participantTotal: number;
  fiscalYear: number;
  delegationSize: number | null;
  ochAttending: boolean;
  requestedAt: Date;
  /** Who the meeting waits on and for how long, when it is stuck — the brief's "needs attention". */
  waiting: { label: string; businessDays: number } | null;
};

/** One meeting × one category: how many were expected, and how many came once known. */
export type ParticipantRow = { meetingId: string; category: ParticipantCategory; planned: number; actual: number | null };

/** One expert on one meeting, with the bureau that lent them and how long they took to answer. */
export type ExpertRow = {
  meetingId: string;
  staffId: string;
  name: string;
  bureauCode: string | null;
  bureauName: string | null;
  status: ExpertStatus;
  requestedAt: Date | null;
  respondedAt: Date | null;
};

/** The meetings list's own filter vocabulary, so a report's URL reads like a meetings URL. */
export type ReportFilters = {
  regionId?: string;
  countryCode?: string;
  topicId?: string;
  format?: MeetingFormat;
  bureauCode?: string;
  status?: MeetingStatus[];
  leadUserId?: string;
};

/** Everything one fiscal year's reports are computed from, already narrowed by the filters. */
export type ReportDataset = {
  fy: number;
  now: Date;
  filters: ReportFilters;
  meetings: ReportMeeting[];
  priorMeetings: ReportMeeting[];
  participants: ParticipantRow[];
  priorParticipants: ParticipantRow[];
  experts: ExpertRow[];
};

/* ------------------------------- shared rules ------------------------------- */

export const isCounted = (m: { status: MeetingStatus }): boolean => COUNTED_STATUSES.includes(m.status);

export function applyReportFilters<T extends ReportMeeting>(items: T[], f: ReportFilters): T[] {
  return items.filter(
    (m) =>
      (!f.regionId || m.regionId === f.regionId) &&
      (!f.countryCode || m.countryCodes.includes(f.countryCode)) &&
      (!f.topicId || m.topics.some((t) => t.id === f.topicId)) &&
      (!f.format || m.format === f.format) &&
      (!f.bureauCode || m.experts.some((e) => e.bureauCode === f.bureauCode)) &&
      (!f.status?.length || f.status.includes(m.status)) &&
      (!f.leadUserId || m.leadUserId === f.leadUserId),
  );
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const distinctCountries = (ms: ReportMeeting[]): number => new Set(ms.flatMap((m) => m.countryCodes)).size;
const byCountThenLabel = (a: NamedCount, b: NamedCount) => b.count - a.count || a.label.localeCompare(b.label, "en");

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Undated meetings sort last; two on the same day keep their code order. */
const byDate = (a: ReportMeeting, b: ReportMeeting) => (a.scheduledStart?.getTime() ?? Infinity) - (b.scheduledStart?.getTime() ?? Infinity) || a.code.localeCompare(b.code, "en");

/** Category rows keyed by meeting, read once per report. */
type Ledger = Map<string, ParticipantRow[]>;

function ledgerOf(rows: ParticipantRow[]): Ledger {
  const map: Ledger = new Map();
  for (const row of rows) {
    const list = map.get(row.meetingId);
    if (list) list.push(row);
    else map.set(row.meetingId, [row]);
  }
  return map;
}

/** What a row says came: the actual count once recorded, the plan until then. */
const known = (row: ParticipantRow): number => row.actual ?? row.planned;

/** People at one meeting — by category rows when there are any, else the meeting's own total. */
function peopleAt(m: ReportMeeting, ledger: Ledger): { planned: number; actual: number } {
  const rows = ledger.get(m.id);
  if (!rows || rows.length === 0) return { planned: m.participantTotal, actual: m.participantTotal };
  return { planned: sum(rows.map((r) => r.planned)), actual: sum(rows.map(known)) };
}

export function participantTotals(rows: ParticipantRow[], ids: Set<string>): { planned: number; actual: number } {
  const mine = rows.filter((r) => ids.has(r.meetingId));
  return { planned: sum(mine.map((r) => r.planned)), actual: sum(mine.map(known)) };
}

/** Names for ids, gathered from whichever meetings mention them. */
function namesOf(meetings: ReportMeeting[]) {
  const topics = new Map<string, string>();
  const regions = new Map<string, string>();
  const countries = new Map<string, string>();
  for (const m of meetings) {
    for (const t of m.topics) topics.set(t.id, t.name);
    regions.set(m.regionId, m.regionName);
    countries.set(m.countryCode, m.countryName);
  }
  return { topics, regions, countries };
}

/* ------------------------------ program summary ----------------------------- */

export type Figure = { id: "engagements" | "countries" | "participants" | "completed"; label: string; value: number; prior: number | null; note: string };
export type CategoryFigure = { category: ParticipantCategory; label: string; planned: number; actual: number };
export type Summary = {
  headline: string;
  figures: Figure[];
  participantsByCategory: CategoryFigure[];
  formats: NamedCount[];
  topics: NamedCount[];
  regions: NamedCount[];
  bureaus: NamedCount[];
  cadence: { month: string; current: number; prior: number }[];
  countries: NamedCount[];
};

function figuresOf(meetings: ReportMeeting[], ledger: Ledger) {
  const counted = meetings.filter(isCounted);
  return {
    engagements: counted.length,
    countries: distinctCountries(counted),
    participants: sum(counted.map((m) => peopleAt(m, ledger).actual)),
    completed: counted.filter((m) => m.status === "completed" || m.status === "closed").length,
  };
}

function categoryFigures(rows: ParticipantRow[], ids: Set<string>): CategoryFigure[] {
  const mine = rows.filter((r) => ids.has(r.meetingId));
  return PARTICIPANT_CATEGORIES.map((category) => {
    const ofKind = mine.filter((r) => r.category === category);
    return { category, label: PARTICIPANT_CATEGORY_LABELS[category], planned: sum(ofKind.map((r) => r.planned)), actual: sum(ofKind.map(known)) };
  });
}

/** Distinct meetings per bureau, from the expert rows of the meetings given. */
function bureauCounts(experts: ExpertRow[], ids: Set<string>): NamedCount[] {
  const meetingsBy = new Map<string, Set<string>>();
  const names = new Map<string, string>();
  for (const e of experts) {
    if (!ids.has(e.meetingId) || !e.bureauCode) continue;
    names.set(e.bureauCode, e.bureauName ?? e.bureauCode);
    const set = meetingsBy.get(e.bureauCode) ?? new Set<string>();
    set.add(e.meetingId);
    meetingsBy.set(e.bureauCode, set);
  }
  return [...meetingsBy].map(([key, set]) => ({ key, label: names.get(key) ?? key, count: set.size })).sort(byCountThenLabel);
}

function cadenceOf(current: ReportMeeting[], prior: ReportMeeting[]) {
  const cur = new Array<number>(12).fill(0);
  const pri = new Array<number>(12).fill(0);
  for (const m of current) if (m.scheduledStart) cur[fiscalMonthIndex(m.scheduledStart)] = (cur[fiscalMonthIndex(m.scheduledStart)] ?? 0) + 1;
  for (const m of prior) if (m.scheduledStart) pri[fiscalMonthIndex(m.scheduledStart)] = (pri[fiscalMonthIndex(m.scheduledStart)] ?? 0) + 1;
  return FISCAL_MONTH_LABELS.map((month, i) => ({ month, current: cur[i] ?? 0, prior: pri[i] ?? 0 }));
}

export function programSummary(ds: ReportDataset): Summary {
  const ledger = ledgerOf(ds.participants);
  const names = namesOf([...ds.meetings, ...ds.priorMeetings]);
  const counted = ds.meetings.filter(isCounted);
  const countedIds = new Set(counted.map((m) => m.id));
  const priorCounted = ds.priorMeetings.filter(isCounted);

  const now = figuresOf(ds.meetings, ledger);
  const prior = ds.priorMeetings.length > 0 ? figuresOf(ds.priorMeetings, ledgerOf(ds.priorParticipants)) : null;
  const today = fiscalYearOf(ds.now);
  const tense: GlanceTense = ds.fy < today ? "past" : ds.fy > today ? "future" : "current";

  const figures: Figure[] = [
    { id: "engagements", label: "Engagements", value: now.engagements, prior: prior?.engagements ?? null, note: "Confirmed, completed or closed" },
    { id: "countries", label: "Countries", value: now.countries, prior: prior?.countries ?? null, note: "Distinct, secondary countries included" },
    { id: "participants", label: "Participants", value: now.participants, prior: prior?.participants ?? null, note: "Actual where recorded, else planned" },
    { id: "completed", label: "Completed", value: now.completed, prior: prior?.completed ?? null, note: "Completed or closed" },
  ];

  return {
    headline: glanceHeadline({ engagements: now.engagements, countries: now.countries, participants: now.participants, fiscalYear: ds.fy, tense, scoped: false }),
    figures,
    participantsByCategory: categoryFigures(ds.participants, countedIds),
    formats: MEETING_FORMATS.map((format) => ({ key: format, label: FORMAT_LABELS[format], count: counted.filter((m) => m.format === format).length })),
    topics: countBy(counted, (m) => m.topics.map((t) => t.id), (id) => names.topics.get(id) ?? id),
    regions: countBy(counted, (m) => m.regionId, (id) => names.regions.get(id) ?? id),
    bureaus: bureauCounts(ds.experts, countedIds),
    cadence: cadenceOf(counted, priorCounted),
    countries: countBy(counted, (m) => m.countryCodes, (code) => names.countries.get(code) ?? code),
  };
}

/* ----------------------------- fiscal-year tally ---------------------------- */

export type TallyRow = { label: string; meetings: number; countries: number; participants: number; inPerson: number; virtual: number; hybrid: number; priorMeetings: number };
export type Tally = { months: TallyRow[]; total: TallyRow; byRegion: TallyRow[]; byTopic: TallyRow[] };

function tallyRow(label: string, ms: ReportMeeting[], prior: ReportMeeting[], ledger: Ledger): TallyRow {
  return {
    label,
    meetings: ms.length,
    countries: distinctCountries(ms),
    participants: sum(ms.map((m) => peopleAt(m, ledger).actual)),
    inPerson: ms.filter((m) => m.format === "in_person").length,
    virtual: ms.filter((m) => m.format === "virtual").length,
    hybrid: ms.filter((m) => m.format === "hybrid").length,
    priorMeetings: prior.length,
  };
}

/** Rows for every group with a current meeting, heaviest first; a meeting under two topics counts under both. */
function groupedRows(current: ReportMeeting[], prior: ReportMeeting[], ledger: Ledger, keysOf: (m: ReportMeeting) => [string, string][]): TallyRow[] {
  const groups = new Map<string, { label: string; current: ReportMeeting[]; prior: ReportMeeting[] }>();
  const place = (m: ReportMeeting, side: "current" | "prior") => {
    for (const [key, label] of keysOf(m)) {
      let group = groups.get(key);
      if (!group) {
        group = { label, current: [], prior: [] };
        groups.set(key, group);
      }
      group[side].push(m);
    }
  };
  for (const m of current) place(m, "current");
  for (const m of prior) place(m, "prior");
  return [...groups.values()]
    .filter((g) => g.current.length > 0)
    .map((g) => tallyRow(g.label, g.current, g.prior, ledger))
    .sort((a, b) => b.meetings - a.meetings || a.label.localeCompare(b.label, "en"));
}

export function fiscalYearTally(ds: ReportDataset): Tally {
  const ledger = ledgerOf(ds.participants);
  const counted = ds.meetings.filter(isCounted);
  const priorCounted = ds.priorMeetings.filter(isCounted);
  const inMonth = (i: number) => (m: ReportMeeting) => m.scheduledStart !== null && fiscalMonthIndex(m.scheduledStart) === i;
  return {
    months: FISCAL_MONTH_LABELS.map((label, i) => tallyRow(label, counted.filter(inMonth(i)), priorCounted.filter(inMonth(i)), ledger)),
    total: tallyRow("Total", counted, priorCounted, ledger),
    byRegion: groupedRows(counted, priorCounted, ledger, (m) => [[m.regionId, m.regionName]]),
    byTopic: groupedRows(counted, priorCounted, ledger, (m) => m.topics.map((t) => [t.id, t.name])),
  };
}

/* -------------------------------- participants ------------------------------ */

export type ParticipantReportRow = {
  meetingId: string;
  code: string;
  date: Date | null;
  countryName: string;
  orgName: string;
  status: MeetingStatus;
  byCategory: Record<ParticipantCategory, { planned: number; actual: number | null }>;
  planned: number;
  /** Null until at least one category has been counted after the fact. */
  actual: number | null;
};

export function participantsReport(ds: ReportDataset): { rows: ParticipantReportRow[]; totals: CategoryFigure[]; plannedTotal: number; actualTotal: number } {
  const ledger = ledgerOf(ds.participants);
  const counted = ds.meetings.filter(isCounted).sort(byDate);
  const rows = counted.map((m): ParticipantReportRow => {
    const mine = ledger.get(m.id) ?? [];
    const anyActual = mine.some((r) => r.actual !== null);
    const byCategory = Object.fromEntries(
      PARTICIPANT_CATEGORIES.map((category) => {
        const ofKind = mine.filter((r) => r.category === category);
        return [category, { planned: sum(ofKind.map((r) => r.planned)), actual: ofKind.some((r) => r.actual !== null) ? sum(ofKind.map(known)) : null }];
      }),
    ) as ParticipantReportRow["byCategory"];
    return {
      meetingId: m.id,
      code: m.code,
      date: m.scheduledStart,
      countryName: m.countryName,
      orgName: m.orgName,
      status: m.status,
      byCategory,
      planned: mine.length > 0 ? sum(mine.map((r) => r.planned)) : m.participantTotal,
      actual: anyActual ? sum(mine.map(known)) : null,
    };
  });
  return {
    rows,
    totals: categoryFigures(ds.participants, new Set(counted.map((m) => m.id))),
    plannedTotal: sum(rows.map((r) => r.planned)),
    actualTotal: sum(rows.map((r) => r.actual ?? r.planned)),
  };
}

/* ----------------------------- experts & bureaus ---------------------------- */

export type BureauRow = {
  bureauCode: string;
  bureauName: string;
  meetings: number;
  experts: number;
  requested: number;
  confirmed: number;
  declined: number;
  /** Confirmed over asked; null until someone has been asked. */
  confirmedRate: number | null;
  /** Median business days from request to answer, over answered requests; null until one is answered. */
  medianResponseDays: number | null;
};
export type BrieferRow = { staffId: string; name: string; bureauCode: string | null; engagements: number; confirmed: number };

/** A request that has been put to someone, whatever they said. */
const ASKED: readonly ExpertStatus[] = ["requested", "confirmed", "declined"];

export function expertsReport(ds: ReportDataset): { bureaus: BureauRow[]; briefers: BrieferRow[] } {
  const ids = new Set(ds.meetings.filter(isCounted).map((m) => m.id));
  const rows = ds.experts.filter((e) => ids.has(e.meetingId));

  const byBureau = new Map<string, ExpertRow[]>();
  for (const e of rows) {
    if (!e.bureauCode) continue;
    const list = byBureau.get(e.bureauCode) ?? [];
    list.push(e);
    byBureau.set(e.bureauCode, list);
  }
  const bureaus = [...byBureau]
    .map(([bureauCode, list]): BureauRow => {
      const asked = list.filter((e) => ASKED.includes(e.status)).length;
      const confirmed = list.filter((e) => e.status === "confirmed").length;
      const answers = list.filter((e) => e.requestedAt && e.respondedAt).map((e) => businessDaysBetween(e.requestedAt!, e.respondedAt!));
      return {
        bureauCode,
        bureauName: list.find((e) => e.bureauName)?.bureauName ?? bureauCode,
        meetings: new Set(list.map((e) => e.meetingId)).size,
        experts: new Set(list.map((e) => e.staffId)).size,
        requested: asked,
        confirmed,
        declined: list.filter((e) => e.status === "declined").length,
        confirmedRate: asked > 0 ? confirmed / asked : null,
        medianResponseDays: median(answers),
      };
    })
    .sort((a, b) => b.meetings - a.meetings || a.bureauName.localeCompare(b.bureauName, "en"));

  // A briefer's engagements are the meetings they were asked for, whatever they answered;
  // the confirmed column says how many they actually took.
  const byStaff = new Map<string, ExpertRow[]>();
  for (const e of rows) {
    if (!ASKED.includes(e.status)) continue;
    const list = byStaff.get(e.staffId) ?? [];
    list.push(e);
    byStaff.set(e.staffId, list);
  }
  const briefers = [...byStaff]
    .map(([staffId, list]): BrieferRow => ({
      staffId,
      name: list[0]!.name,
      bureauCode: list.find((e) => e.bureauCode)?.bureauCode ?? null,
      engagements: new Set(list.map((e) => e.meetingId)).size,
      confirmed: new Set(list.filter((e) => e.status === "confirmed").map((e) => e.meetingId)).size,
    }))
    .sort((a, b) => b.engagements - a.engagements || b.confirmed - a.confirmed || a.name.localeCompare(b.name, "en"));

  return { bureaus, briefers };
}

/* ---------------------------------- countries ------------------------------- */

export type CountryRow = {
  countryCode: string;
  countryName: string;
  regionName: string;
  engagements: number;
  participants: number;
  firstAt: Date | null;
  lastAt: Date | null;
  /** Up to three, by how often they came up. */
  topics: string[];
};

export function countriesReport(ds: ReportDataset): CountryRow[] {
  const ledger = ledgerOf(ds.participants);
  const names = namesOf([...ds.meetings, ...ds.priorMeetings]);
  const groups = new Map<string, { regionName: string; meetings: ReportMeeting[] }>();
  for (const m of ds.meetings.filter(isCounted)) {
    for (const code of m.countryCodes) {
      const group = groups.get(code) ?? { regionName: m.regionName, meetings: [] };
      if (code === m.countryCode) group.regionName = m.regionName;
      group.meetings.push(m);
      groups.set(code, group);
    }
  }
  return [...groups]
    .map(([countryCode, group]): CountryRow => {
      const dates = group.meetings.flatMap((m) => (m.scheduledStart ? [m.scheduledStart.getTime()] : []));
      return {
        countryCode,
        countryName: names.countries.get(countryCode) ?? countryCode,
        regionName: group.regionName,
        engagements: group.meetings.length,
        participants: sum(group.meetings.map((m) => peopleAt(m, ledger).actual)),
        firstAt: dates.length > 0 ? new Date(Math.min(...dates)) : null,
        lastAt: dates.length > 0 ? new Date(Math.max(...dates)) : null,
        topics: countBy(group.meetings, (m) => m.topics.map((t) => t.id), (id) => names.topics.get(id) ?? id)
          .slice(0, 3)
          .map((t) => t.label),
      };
    })
    .sort((a, b) => b.engagements - a.engagements || a.countryName.localeCompare(b.countryName, "en"));
}

/* ----------------------------------- custom --------------------------------- */

export const CUSTOM_ROWS = ["country", "region", "topic", "format", "bureau", "month", "status", "lead"] as const;
export type CustomRows = (typeof CUSTOM_ROWS)[number];
export const CUSTOM_MEASURES = ["meetings", "participantsPlanned", "participantsActual", "countries"] as const;
export type CustomMeasure = (typeof CUSTOM_MEASURES)[number];

export const CUSTOM_ROW_LABELS: Record<CustomRows, string> = {
  country: "Country",
  region: "Region",
  topic: "Topic",
  format: "Format",
  bureau: "Bureau",
  month: "Fiscal month",
  status: "Status",
  lead: "Lead",
};

export const CUSTOM_MEASURE_LABELS: Record<CustomMeasure, string> = {
  meetings: "Meetings",
  participantsPlanned: "Participants (planned)",
  participantsActual: "Participants (actual)",
  countries: "Countries",
};

/**
 * One dimension against one measure. Months keep their fiscal order with zeros in place, so a
 * quiet month is visible as a gap; every other dimension is ranked heaviest first.
 */
export function customReport(ds: ReportDataset, rows: CustomRows, measure: CustomMeasure): NamedCount[] {
  const ledger = ledgerOf(ds.participants);
  const names = namesOf([...ds.meetings, ...ds.priorMeetings]);
  const counted = ds.meetings.filter(isCounted);

  const bureausOf = new Map<string, [string, string][]>();
  for (const e of ds.experts) {
    if (!e.bureauCode) continue;
    const list = bureausOf.get(e.meetingId) ?? [];
    if (!list.some(([code]) => code === e.bureauCode)) list.push([e.bureauCode, e.bureauName ?? e.bureauCode]);
    bureausOf.set(e.meetingId, list);
  }

  const keysOf = (m: ReportMeeting): [string, string][] => {
    switch (rows) {
      case "country":
        return m.countryCodes.map((code) => [code, names.countries.get(code) ?? code]);
      case "region":
        return [[m.regionId, m.regionName]];
      case "topic":
        return m.topics.map((t) => [t.id, t.name]);
      case "format":
        return [[m.format, FORMAT_LABELS[m.format]]];
      case "bureau":
        return bureausOf.get(m.id) ?? [];
      case "month": {
        if (!m.scheduledStart) return [];
        const index = fiscalMonthIndex(m.scheduledStart);
        return [[String(index), FISCAL_MONTH_LABELS[index] ?? String(index)]];
      }
      case "status":
        return [[m.status, STATUS_LABELS[m.status]]];
      case "lead":
        return [[m.leadUserId ?? "unassigned", m.leadName ?? "Unassigned"]];
    }
  };

  const groups = new Map<string, { label: string; meetings: ReportMeeting[] }>();
  if (rows === "month") FISCAL_MONTH_LABELS.forEach((label, i) => groups.set(String(i), { label, meetings: [] }));
  for (const m of counted) {
    for (const [key, label] of keysOf(m)) {
      const group = groups.get(key) ?? { label, meetings: [] };
      group.meetings.push(m);
      groups.set(key, group);
    }
  }

  const measureOf = (ms: ReportMeeting[]): number => {
    switch (measure) {
      case "meetings":
        return ms.length;
      case "countries":
        return distinctCountries(ms);
      case "participantsPlanned":
        return sum(ms.map((m) => peopleAt(m, ledger).planned));
      case "participantsActual":
        return sum(ms.map((m) => peopleAt(m, ledger).actual));
    }
  };

  const out = [...groups].map(([key, group]) => ({ key, label: group.label, count: measureOf(group.meetings) }));
  return rows === "month" ? out : out.sort(byCountThenLabel);
}
