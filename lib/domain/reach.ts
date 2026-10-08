import { countOf, formatDateNY } from "@/lib/format";
import { addNyDays, inSpan, rangeSpan, type Span, startOfNyDay } from "./reach-time";
import { FORMAT_LABELS, MEETING_STATUSES, type MeetingFormat, type MeetingStatus, STATUS_LABELS, type WaitingOn } from "./types";
import type { AgeBand } from "./waiting-on";

/**
 * Everything the Global reach map derives, as pure functions over one list of meetings. The
 * dashboard card (on the server) and the full screen (in the browser) both call these, so the
 * card's "14 countries" and the full screen's are the same number by construction.
 */

export type ReachMeeting = {
  id: string;
  code: string;
  title: string;
  status: MeetingStatus;
  format: MeetingFormat;
  /** The accepted date, else the earliest open proposal; null until either exists. */
  start: Date | null;
  /** True when `start` is only a proposal. */
  proposed: boolean;
  /** Foreign ISO-2 codes, the primary country first. The United States is never marked. */
  countries: string[];
  orgName: string;
  region: string;
  /** Planned or actual participants, as the dashboard counts them. */
  participants: number;
  topics: string[];
  /** Codes of the bureaus and offices with an expert still on the meeting. */
  bureaus: string[];
  och: boolean;
  highPriority: boolean;
  /** Readiness, in percent. */
  readiness: number;
  missing: { label: string; detail: string }[];
  waiting: { who: Exclude<WaitingOn, "none">; label: string; businessDays: number; band: AgeBand } | null;
  lead: string | null;
  delegationSize: number | null;
  experts: { name: string; bureau: string | null; lead: boolean; confirmed: boolean }[];
};

export type ReachCountry = { cca2: string; ccn3: string; name: string; region: string; lat: number; lng: number };
export type ReachBureau = { code: string; name: string };
export type ReachData = { asOf: Date; meetings: ReachMeeting[]; countries: ReachCountry[]; bureaus: ReachBureau[] };

/* --------------------------------- filters -------------------------------- */

export type ReachFilters = {
  statuses: MeetingStatus[];
  formats: MeetingFormat[];
  region: string | null;
  bureau: string | null;
  topic: string | null;
  och: boolean;
  high: boolean;
};

export const NO_FILTERS: ReachFilters = { statuses: [], formats: [], region: null, bureau: null, topic: null, och: false, high: false };

export type Facet = "status" | "format" | "region" | "bureau" | "topic";

export const isFiltered = (f: ReachFilters): boolean => f.statuses.length > 0 || f.formats.length > 0 || f.region !== null || f.bureau !== null || f.topic !== null || f.och || f.high;

/** Whether a meeting survives the filters. `skip` leaves one group out, which is how a facet counts. */
export function passes(m: ReachMeeting, f: ReachFilters, skip?: Facet): boolean {
  if (skip !== "status" && f.statuses.length > 0 && !f.statuses.includes(m.status)) return false;
  if (skip !== "format" && f.formats.length > 0 && !f.formats.includes(m.format)) return false;
  if (skip !== "region" && f.region !== null && m.region !== f.region) return false;
  if (skip !== "bureau" && f.bureau !== null && !m.bureaus.includes(f.bureau)) return false;
  if (skip !== "topic" && f.topic !== null && !m.topics.includes(f.topic)) return false;
  if (f.och && !m.och) return false;
  if (f.high && !m.highPriority) return false;
  return true;
}

export const datedIn = (m: ReachMeeting, span: Span): boolean => m.start !== null && inSpan(m.start, span);

/** The meetings the reader is looking at: dated inside the window, through the filters. */
export function lens(meetings: readonly ReachMeeting[], f: ReachFilters, window: Span, skip?: Facet): ReachMeeting[] {
  return meetings.filter((m) => datedIn(m, window) && passes(m, f, skip));
}

export type NamedTally = { key: string; count: number };
export type FacetCounts = {
  status: Record<MeetingStatus, number>;
  format: Record<MeetingFormat, number>;
  region: NamedTally[];
  bureau: NamedTally[];
  topic: NamedTally[];
};

/** Busiest first, then by name. A meeting counts once per key, however often it repeats it. */
export function tallies(list: readonly ReachMeeting[], keys: (m: ReachMeeting) => string[]): NamedTally[] {
  const counts = new Map<string, number>();
  for (const m of list) for (const key of new Set(keys(m))) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Each group counted under every filter but its own, so a reader sees what each choice would give. */
export function facetCounts(meetings: readonly ReachMeeting[], f: ReachFilters, window: Span): FacetCounts {
  const status = Object.fromEntries(MEETING_STATUSES.map((s) => [s, 0])) as Record<MeetingStatus, number>;
  for (const m of lens(meetings, f, window, "status")) status[m.status] += 1;
  return {
    status,
    format: mixOf(lens(meetings, f, window, "format")),
    region: tallies(lens(meetings, f, window, "region"), (m) => [m.region]),
    bureau: tallies(lens(meetings, f, window, "bureau"), (m) => m.bureaus),
    topic: tallies(lens(meetings, f, window, "topic"), (m) => m.topics),
  };
}

const SETTLED: readonly MeetingStatus[] = ["closed", "cancelled", "completed"];

/** The Date to be set group: meetings that pass the filters but have no date yet, leaving out settled ones. */
export function dateToBeSet(meetings: readonly ReachMeeting[], f: ReachFilters): ReachMeeting[] {
  return meetings.filter((m) => m.start === null && passes(m, f) && !SETTLED.includes(m.status));
}

/* --------------------------------- formats -------------------------------- */

/** The order formats read in everywhere: slices, legends, breakdowns. */
export const FORMAT_ORDER = ["in_person", "hybrid", "virtual"] as const satisfies readonly MeetingFormat[];

export type FormatMix = Record<MeetingFormat, number>;

export const emptyMix = (): FormatMix => ({ in_person: 0, hybrid: 0, virtual: 0 });

export function mixOf(list: readonly { format: MeetingFormat }[]): FormatMix {
  const mix = emptyMix();
  for (const m of list) mix[m.format] += 1;
  return mix;
}

export const mixTotal = (mix: FormatMix): number => mix.in_person + mix.hybrid + mix.virtual;

/* -------------------------------- countries ------------------------------- */

export const SIGNAL_DAYS = 30;

/** Statuses under which nobody is on the way. */
export const RESTING_STATUSES: readonly MeetingStatus[] = ["cancelled", "on_hold"];

export const startMs = (m: { start: Date | null }): number => m.start?.getTime() ?? Number.POSITIVE_INFINITY;
export const byStart = (a: ReachMeeting, b: ReachMeeting): number => startMs(a) - startMs(b) || a.code.localeCompare(b.code);

/** A visit on its way: from now to the end of the Next 30 days range, and neither cancelled nor on hold. */
export function isArriving(m: ReachMeeting, now: Date): boolean {
  if (m.start === null || RESTING_STATUSES.includes(m.status)) return false;
  return m.start.getTime() >= now.getTime() && m.start.getTime() < addNyDays(startOfNyDay(now), SIGNAL_DAYS).getTime();
}

export type CountryAggregate = {
  cca2: string;
  meetings: ReachMeeting[];
  participants: number;
  mix: FormatMix;
  /** The format of the soonest visit on its way, or null when nothing is. */
  signal: MeetingFormat | null;
};

/** One aggregate per foreign country; a meeting in several countries joins each of them. */
export function byCountry(list: readonly ReachMeeting[], now: Date): Map<string, CountryAggregate> {
  const out = new Map<string, CountryAggregate>();
  const soonest = new Map<string, ReachMeeting>();
  for (const m of list) {
    const arriving = isArriving(m, now);
    for (const cca2 of m.countries) {
      let a = out.get(cca2);
      if (!a) {
        a = { cca2, meetings: [], participants: 0, mix: emptyMix(), signal: null };
        out.set(cca2, a);
      }
      a.meetings.push(m);
      a.participants += m.participants;
      a.mix[m.format] += 1;
      const seen = soonest.get(cca2);
      if (arriving && (!seen || startMs(m) < startMs(seen))) soonest.set(cca2, m);
    }
  }
  for (const [cca2, m] of soonest) {
    const a = out.get(cca2);
    if (a) a.signal = m.format;
  }
  return out;
}

export function maxCount(aggregates: ReadonlyMap<string, CountryAggregate>): number {
  let max = 0;
  for (const a of aggregates.values()) max = Math.max(max, a.meetings.length);
  return max;
}

export type ReachFigures = { meetings: number; countries: number; participants: number; waiting: number };

/** The four figures at the top of the Filters panel. */
export function figures(list: readonly ReachMeeting[]): ReachFigures {
  const countries = new Set<string>();
  let participants = 0;
  let waiting = 0;
  for (const m of list) {
    for (const c of m.countries) countries.add(c);
    participants += m.participants;
    if (m.waiting) waiting += 1;
  }
  return { meetings: list.length, countries: countries.size, participants, waiting };
}

/** "Japan", "Japan +1", or "United States" for a meeting with no foreign country. */
export function countryLabel(m: ReachMeeting, nameOf: (cca2: string) => string): string {
  const [first] = m.countries;
  if (!first) return "United States";
  return m.countries.length > 1 ? `${nameOf(first)} +${m.countries.length - 1}` : nameOf(first);
}

const inWords = new Intl.ListFormat("en-US", { type: "conjunction" });

/**
 * A meeting's full name, as its row in the Details panel and its chip and agenda row on the
 * timeline say it: every country, the organization, the date ("Date to be set" without one),
 * "proposed" when the date is only that, the format and the status. "Japan and Kenya, Ministry
 * of Internal Affairs and Communications, Oct 6, 2026, proposed, In person, Confirmed".
 */
export function meetingName(m: ReachMeeting, nameOf: (cca2: string) => string): string {
  const countries = m.countries.length > 0 ? inWords.format(m.countries.map(nameOf)) : countryLabel(m, nameOf);
  const when = m.start ? formatDateNY(m.start, "short") : "Date to be set";
  return [countries, m.orgName, when, ...(m.proposed ? ["proposed"] : []), FORMAT_LABELS[m.format], STATUS_LABELS[m.status]].join(", ");
}

/* ---------------------------------- tour ---------------------------------- */

export const TOUR_DAYS = 90;
export const TOUR_LIMIT = 12;

/** Up to 12 visits in the next 90 days, soonest first: foreign, through the filters, neither cancelled nor on hold. */
export function tourStops(meetings: readonly ReachMeeting[], f: ReachFilters, now: Date): ReachMeeting[] {
  const end = addNyDays(startOfNyDay(now), TOUR_DAYS).getTime();
  return meetings
    .filter((m) => m.start !== null && m.start.getTime() >= now.getTime() && m.start.getTime() < end && m.countries.length > 0 && !RESTING_STATUSES.includes(m.status) && passes(m, f))
    .sort(byStart)
    .slice(0, TOUR_LIMIT);
}

export const WASHINGTON = { lat: 38.8977, lng: -77.0365 } as const;
const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle miles from a point to Washington, to the nearest hundred. */
export function milesToWashington(c: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((WASHINGTON.lat - c.lat) * r) / 2) ** 2 + Math.cos(c.lat * r) * Math.cos(WASHINGTON.lat * r) * Math.sin(((WASHINGTON.lng - c.lng) * r) / 2) ** 2;
  return Math.round((EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(h))) / 100) * 100;
}

/** How a visit comes, for the tour's caption: "By video", or the format with the distance. */
export function travelText(m: ReachMeeting, country: { lat: number; lng: number }): { label: string; detail: string | null } {
  if (m.format === "virtual") return { label: "By video", detail: null };
  const miles = milesToWashington(country).toLocaleString("en-US");
  return m.format === "hybrid" ? { label: "Hybrid", detail: `in the room and by video, about ${miles} miles from Washington` } : { label: "In person", detail: `traveling about ${miles} miles to Washington` };
}

export type TourSummary = { visits: number; countries: number; mix: FormatMix; confirmed: number; waiting: number; ready: number };

export function tourSummary(stops: readonly ReachMeeting[]): TourSummary {
  return {
    visits: stops.length,
    countries: new Set(stops.flatMap((m) => m.countries)).size,
    mix: mixOf(stops),
    confirmed: stops.filter((m) => m.status === "confirmed").length,
    waiting: stops.filter((m) => m.waiting !== null).length,
    ready: stops.filter((m) => m.readiness >= 80).length,
  };
}

/* -------------------------------- sentences ------------------------------- */

/** One country, as a map's sentence counts it. */
type Told = { name: string; count: number; signal: MeetingFormat | null };

function sentence(label: string, meetings: number, countries: readonly Told[]): string {
  if (meetings === 0) return `${label}: no meetings.`;
  const top = [...countries].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3);
  const signaling = countries.filter((c) => c.signal !== null).length;
  const parts = [`${label}: ${countOf(meetings, "meeting")} in ${countOf(countries.length, "country", "countries")}.`];
  if (top.length > 0) parts.push(`Most: ${top.map((c) => `${c.name} ${c.count}`).join(", ")}.`);
  if (signaling > 0) parts.push(`${countOf(signaling, "country", "countries")} ${signaling === 1 ? "has" : "have"} a meeting coming up in the next 30 days.`);
  return parts.join(" ");
}

/** The sentence that describes the map region, rebuilt from the numbers the reader sees. */
export function describeMap(label: string, list: readonly ReachMeeting[], aggregates: ReadonlyMap<string, CountryAggregate>, nameOf: (cca2: string) => string): string {
  return sentence(
    label,
    list.length,
    [...aggregates.values()].map((a) => ({ name: nameOf(a.cca2), count: a.meetings.length, signal: a.signal })),
  );
}

/** What the live region says after a filter or range change: "23 meetings in 17 countries". */
export function announce(list: readonly ReachMeeting[]): string {
  return `${countOf(list.length, "meeting")} in ${countOf(new Set(list.flatMap((m) => m.countries)).size, "country", "countries")}`;
}

/* --------------------------------- search --------------------------------- */

export type SearchEntry = { kind: "country" | "organization"; cca2: string; label: string; hint: string };

/**
 * Every country and foreign organization in the program's history, not only the window's. An
 * organization met from several countries is offered once for each, so every visit can be found.
 */
export function searchEntries(data: ReachData): SearchEntry[] {
  const byCode = new Map(data.countries.map((c) => [c.cca2, c]));
  const out: SearchEntry[] = [];
  const countries = new Set<string>();
  for (const m of data.meetings) {
    for (const cca2 of m.countries) {
      const c = byCode.get(cca2);
      if (!c || countries.has(cca2)) continue;
      countries.add(cca2);
      out.push({ kind: "country", cca2, label: c.name, hint: c.region });
    }
  }
  const orgs = new Set<string>();
  for (const m of data.meetings) {
    const [cca2] = m.countries;
    const key = `${m.orgName}\u0000${cca2}`;
    if (!cca2 || m.orgName === "—" || orgs.has(key)) continue;
    orgs.add(key);
    out.push({ kind: "organization", cca2, label: m.orgName, hint: byCode.get(cca2)?.name ?? cca2 });
  }
  return out;
}

/** The best matches first (where the text starts earliest, then the shorter name), eight at most. */
export function searchReach(entries: readonly SearchEntry[], query: string, limit = 8): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return entries
    .map((entry) => ({ entry, at: entry.label.toLowerCase().indexOf(q) }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at || a.entry.label.length - b.entry.label.length || a.entry.label.localeCompare(b.entry.label))
    .slice(0, limit)
    .map((hit) => hit.entry);
}

/* ---------------------------------- card ---------------------------------- */

export type CardRangeKey = "next30" | "this";
export type CardMeeting = { id: string; code: string; orgName: string; start: Date | null; proposed: boolean; format: MeetingFormat; status: MeetingStatus };
export type CardCountry = ReachCountry & { count: number; participants: number; mix: FormatMix; signal: MeetingFormat | null; next: CardMeeting[] };
/** `meetings` counts each meeting once, even one held with several countries. */
export type CardRange = { key: CardRangeKey; span: Span; meetings: number; countries: CardCountry[] };

export const CARD_NEXT = 3;

const toCardMeeting = (m: ReachMeeting): CardMeeting => ({ id: m.id, code: m.code, orgName: m.orgName, start: m.start, proposed: m.proposed, format: m.format, status: m.status });

/**
 * One of the card's two ranges, computed on the server with no filters: per-country aggregates
 * and each country's next three meetings from today on. The card never sees meeting-level data.
 */
export function cardRange(data: ReachData, key: CardRangeKey, now: Date): CardRange {
  const span = rangeSpan(key, now);
  const list = lens(data.meetings, NO_FILTERS, span);
  const aggregates = byCountry(list, now);
  const byCode = new Map(data.countries.map((c) => [c.cca2, c]));
  const today = startOfNyDay(now).getTime();
  const countries: CardCountry[] = [];
  for (const a of aggregates.values()) {
    const c = byCode.get(a.cca2);
    if (!c) continue;
    const next = a.meetings.filter((m) => startMs(m) >= today).sort(byStart).slice(0, CARD_NEXT).map(toCardMeeting);
    countries.push({ ...c, count: a.meetings.length, participants: a.participants, mix: a.mix, signal: a.signal, next });
  }
  countries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { key, span, meetings: list.length, countries };
}

/** The map's sentence for the card, from its range's own numbers. */
export const describeCard = (label: string, range: CardRange): string => sentence(label, range.meetings, range.countries);
