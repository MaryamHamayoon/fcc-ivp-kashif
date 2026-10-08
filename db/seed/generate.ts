/**
 * Builds the complete demo object graph in memory from a seeded PRNG. Pure: same seed and
 * `now` → identical output on every machine. index.ts inserts the result.
 */
import type { PgTable } from "drizzle-orm/pg-core";
import type * as s from "../../lib/db/schema";
import { addBusinessDays, businessDaysBetween } from "../../lib/domain/business-days";
import { fiscalYearOf, fiscalYearRange, nyDate, nyParts } from "../../lib/domain/fiscal-year";
import { formatIvpCode } from "../../lib/domain/ivp-code";
import { OIA_REGIONS, type RegionId } from "../../lib/domain/regions";
import type { DocumentKind, ExpertStatus, MeetingFormat, MeetingStatus, OrgKind, ParticipantCategory, Role } from "../../lib/domain/types";
import { BUREAUS, BUREAU_BY_CODE } from "./fixtures/bureaus";
import { MEETING_COUNTRY_ALLOWLIST } from "./fixtures/country-allowlist";
import { COUNTRIES, COUNTRY_BY_CODE, type CountryFixture } from "./fixtures/countries";
import { FCC_TITLES, FIRST_NAMES, LAST_NAMES, OIA_TITLES, VISITOR_TITLES } from "./fixtures/names";
import { INTERMEDIARIES, ORGANIZATIONS, type OrganizationFixture } from "./fixtures/organizations";
import { LEAF_TOPICS, TOPICS, type TopicFixture } from "./fixtures/topics";
import { isFederalHoliday } from "./holidays";
import { createRng, type Rng } from "./prng";

type Ins<T extends PgTable> = T["$inferInsert"];

export type SeedGraph = {
  regions: Ins<typeof s.regions>[];
  countries: Ins<typeof s.countries>[];
  bureaus: Ins<typeof s.bureaus>[];
  topics: Ins<typeof s.topics>[];
  organizations: Ins<typeof s.organizations>[];
  contacts: Ins<typeof s.contacts>[];
  staff: Ins<typeof s.staffDirectory>[];
  users: Ins<typeof s.users>[];
  meetings: Ins<typeof s.meetings>[];
  meetingCountries: Ins<typeof s.meetingCountries>[];
  candidateDates: Ins<typeof s.meetingCandidateDates>[];
  meetingTopics: Ins<typeof s.meetingTopics>[];
  experts: Ins<typeof s.meetingExperts>[];
  participants: Ins<typeof s.meetingParticipants>[];
  participantTotals: Ins<typeof s.meetingParticipantTotals>[];
  documents: Ins<typeof s.meetingDocuments>[];
  agendaItems: Ins<typeof s.meetingAgendaItems>[];
  activities: Ins<typeof s.activities>[];
};

/** `meetingCount` scales the meeting set (default 127; 0 = reference data, staff and users only). */
export type SeedOptions = { seed?: number; now?: Date; meetingCount?: number };

export type DemoUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  regionIds: string[];
  bureauCode: string;
  title: string;
  blurb: string;
};

/** The sign-in roster on the demo login screen. All synthetic. */
export const DEMO_USERS: readonly DemoUser[] = [
  { id: "usr_dana", name: "Dana Whitfield", email: "dana.whitfield@fcc.gov", role: "admin", regionIds: [], bureauCode: "OIA", title: "Deputy Office Chief", blurb: "Runs the program. Can manage users and settings." },
  { id: "usr_priya", name: "Priya Natarajan", email: "priya.natarajan@fcc.gov", role: "coordinator", regionIds: [], bureauCode: "OIA", title: "International Program Specialist", blurb: "Coordinates every visit end to end." },
  { id: "usr_amara", name: "Amara Mensah", email: "amara.mensah@fcc.gov", role: "regional_lead", regionIds: ["af", "nea"], bureauCode: "OIA", title: "Foreign Affairs Specialist", blurb: "Leads Africa and Middle East & North Africa." },
  { id: "usr_kenji", name: "Kenji Sato", email: "kenji.sato@fcc.gov", role: "regional_lead", regionIds: ["eap", "sca"], bureauCode: "OIA", title: "Foreign Affairs Specialist", blurb: "Leads Asia-Pacific and South & Central Asia." },
  { id: "usr_elena", name: "Elena Petrova", email: "elena.petrova@fcc.gov", role: "regional_lead", regionIds: ["eur", "wha", "io"], bureauCode: "OIA", title: "Attorney Advisor", blurb: "Leads Europe, the Americas and multilateral organizations." },
  { id: "usr_tomas", name: "Tomas Lindqvist", email: "tomas.lindqvist@fcc.gov", role: "expert", regionIds: [], bureauCode: "SB", title: "Electronics Engineer", blurb: "Space Bureau briefer. Sees only meetings he is assigned to." },
  { id: "usr_samuel", name: "Samuel Brennan", email: "samuel.brennan@fcc.gov", role: "executive", regionIds: [], bureauCode: "OIA", title: "Chief, Office of International Affairs", blurb: "Reads everything, edits nothing." },
  { id: "usr_ingrid", name: "Ingrid Moreau", email: "ingrid.moreau@fcc.gov", role: "viewer", regionIds: [], bureauCode: "OMR", title: "Public Affairs Specialist", blurb: "Read-only view of meetings and the directory." },
];

/**
 * OIA staff who actually run casework — excludes the read-only executive and viewer seats.
 * Activity authorship is drawn from this pool (weighted toward the meeting's own coordinator
 * and lead) instead of a single fixed name, so the log reads like a real office rotation.
 */
const OIA_CASEWORK_USER_IDS = DEMO_USERS.filter((u) => u.bureauCode === "OIA" && (u.role === "admin" || u.role === "coordinator" || u.role === "regional_lead")).map((u) => u.id);

/* ------------------------------ small helpers ------------------------------ */

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);
const min = (a: Date, b: Date) => (a.getTime() < b.getTime() ? a : b);
/** Same calendar day in New York at the given wall-clock time. */
const atNy = (d: Date, hour: number, minute = 0) => {
  const p = nyParts(d);
  return nyDate(p.year, p.month, p.day, hour, minute);
};
const isWeekend = (d: Date) => {
  const wd = atNy(d, 12).getUTCDay();
  return wd === 0 || wd === 6;
};
/** A day the FCC is open: not a weekend, not a federal holiday. */
const isWorkday = (d: Date) => !isWeekend(d) && !isFederalHoliday(nyParts(d));
const toWorkday = (d: Date) => {
  let out = d;
  while (!isWorkday(out)) out = addDays(out, 1);
  return out;
};
/** The most recent plausible DC business instant at or before `at` (weekday, 9am–6pm ET). */
const lastBusinessInstant = (at: Date): Date => {
  if (!isWeekend(at) && at.getTime() >= atNy(at, 9).getTime()) return min(at, atNy(at, 18));
  let prev = addDays(at, -1);
  while (isWeekend(prev)) prev = addDays(prev, -1);
  return atNy(prev, 18);
};
/** The Washington calendar day an instant falls on, as a key. */
const nyDayKey = (d: Date) => {
  const p = nyParts(d);
  return `${p.year}-${p.month}-${p.day}`;
};
const nyShort = (d: Date) => {
  const p = nyParts(d);
  return `${p.month}/${p.day}`;
};
const nyLong = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" }).format(d);

function deck<T>(rng: Rng, n: number, weights: readonly (readonly [T, number])[]): T[] {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  const exact = weights.map(([v, w]) => ({ v, want: (n * w) / total }));
  const out: T[] = [];
  for (const e of exact) for (let i = 0; i < Math.floor(e.want); i++) out.push(e.v);
  const remainders = exact.map((e, i) => ({ i, r: e.want - Math.floor(e.want) })).sort((a, b) => b.r - a.r);
  for (let k = 0; out.length < n && k < remainders.length; k++) out.push(exact[remainders[k]!.i]!.v);
  return rng.shuffle(out);
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/* --------------------------------- content --------------------------------- */

const TITLE_TEMPLATES = [
  "{topic} Briefing",
  "{topic} — Regulatory Framework Exchange",
  "{topic} Study Visit",
  "{topic} Benchmarking",
  "{short} Delegation: {topic}",
  "{topic} Roundtable",
  "{topic}: Best Practices",
  "{topic} Consultation with {short}",
  "{topic} Policy Dialogue",
  "{topic} Technical Exchange",
  "Introductory Meeting: {short}",
  "{country} — {topic} Working Session",
] as const;

const PURPOSES = [
  "The delegation would like to understand how the FCC approaches {topic} and compare notes on {topic2}.",
  "{short} is drafting new rules on {topic} and requested a briefing on the FCC's experience and lessons learned.",
  "Study visit arranged through {intermediary}: {topic} and {topic2}, with time for questions on FCC organization.",
  "Follow-up to the ITU discussions: a deeper technical exchange on {topic}.",
  "New leadership at {short} wants an overview of {topic} ahead of a domestic consultation.",
  "Delegation of senior officials preparing a national strategy on {topic}; {topic2} is a secondary interest.",
] as const;

const ROOMS = [
  "FCC Headquarters, 45 L Street NE — Room 1.C744",
  "FCC Headquarters, 45 L Street NE — Room 2.B516",
  "FCC Headquarters, 45 L Street NE — Commission Meeting Room",
  "FCC Headquarters, 45 L Street NE — Room 3.A101",
  "FCC Headquarters, 45 L Street NE — OIA Conference Room 6.B430",
] as const;

const HOLD_REASONS = [
  "Delegation travel dates slipped; awaiting a new proposal from the visitors.",
  "Visa processing delayed for two delegates.",
  "Awaiting OCH decision on Chairman participation.",
  "Leadership transition at the regulator; new Director General not yet appointed.",
  "Visitors asked to pause until their budget for travel is approved.",
] as const;

const CANCEL_REASONS = [
  "Delegation cancelled travel to Washington.",
  "Visitor withdrew the request.",
  "Duplicate of an existing request from the same ministry.",
  "No FCC expert available in the requested window; visitors declined an alternate date.",
  "Superseded by a multilateral meeting at ITU.",
] as const;

const OTHER_USG = [
  ["Desk Officer", "U.S. Department of State — Bureau of Cyberspace and Digital Policy"],
  ["Program Manager", "U.S. Trade and Development Agency"],
  ["Policy Analyst", "NTIA — Office of International Affairs"],
  ["Economic Officer", "U.S. Department of State — Economic Bureau"],
  ["Attorney", "Commercial Law Development Program"],
] as const;

const DOC_TITLES: Record<DocumentKind, (ctx: { short: string; topic: string }) => string> = {
  work_plan: ({ short }) => `Work Plan — ${short}`,
  agenda_draft: () => "Draft Agenda v1",
  agenda_final: () => "Final Agenda",
  briefing_deck: ({ topic }) => `Briefing Deck — ${topic}`,
  participant_list: () => "Participant List",
  bio_packet: () => "Delegation Bios",
  readout: ({ short }) => `Readout — ${short}`,
  other: () => "Visa Support Letter",
};

const DOC_PROBABILITY: Record<MeetingStatus, Partial<Record<DocumentKind, number>>> = {
  requested: {},
  developing: { work_plan: 0.85, agenda_draft: 0.45, bio_packet: 0.3 },
  clearance: { work_plan: 0.95, agenda_draft: 1, agenda_final: 0.3, bio_packet: 0.5 },
  confirmed: { work_plan: 0.95, agenda_draft: 0.6, agenda_final: 0.7, participant_list: 0.6, bio_packet: 0.55, briefing_deck: 0.4, other: 0.1 },
  completed: { work_plan: 0.95, agenda_draft: 0.7, agenda_final: 0.95, participant_list: 0.85, bio_packet: 0.7, briefing_deck: 0.6, readout: 0.55, other: 0.1 },
  closed: { work_plan: 0.95, agenda_draft: 0.7, agenda_final: 0.95, participant_list: 0.85, bio_packet: 0.7, briefing_deck: 0.6, readout: 0.9, other: 0.1 },
  on_hold: {},
  cancelled: { work_plan: 0.4 },
};

/**
 * How many business days before the seed an upcoming visit's request came in, by how far along
 * it is: a visit already confirmed has had weeks of work behind it, a fresh request only days.
 */
const REQUEST_LEAD: Partial<Record<MeetingStatus, readonly [number, number]>> = {
  requested: [2, 15],
  developing: [8, 40],
  clearance: [20, 55],
  confirmed: [25, 70],
  on_hold: [15, 60],
};

/** How busy each calendar month runs, January first: spring and fall are high season, August and the holidays quiet. */
const SEASON = [0.8, 1, 1.25, 1.25, 1.15, 1, 0.8, 0.6, 1.15, 1.2, 1, 0.7] as const;

const IO_REGION_OF_ORG: Record<string, RegionId | "mixed"> = {
  atu: "af",
  apt: "eap",
  citel: "wha",
  "ctu-tt": "wha",
  "eco-cept": "eur",
  berec: "eur",
  itu: "mixed",
  "world-bank-dd": "mixed",
  cto: "mixed",
};

function delegationCategory(kind: OrgKind): ParticipantCategory {
  if (kind === "industry") return "industry";
  if (kind === "academia") return "academia_ngo";
  if (kind === "international_org") return "other";
  return "foreign_gov";
}

/* -------------------------------- generator -------------------------------- */

type StaffRow = Ins<typeof s.staffDirectory>;
type MeetingRow = Ins<typeof s.meetings>;
type MeetingSpec = { fy: number; target: Date; status: MeetingStatus; isPast: boolean };

export function generateSeed(opts: SeedOptions = {}): SeedGraph {
  const rng = createRng(opts.seed ?? 20260829);
  const now = opts.now ?? new Date();

  const counters = new Map<string, number>();
  const id = (prefix: string) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(4, "0")}`;
  };

  const g: SeedGraph = {
    regions: [],
    countries: [],
    bureaus: [],
    topics: [],
    organizations: [],
    contacts: [],
    staff: [],
    users: [],
    meetings: [],
    meetingCountries: [],
    candidateDates: [],
    meetingTopics: [],
    experts: [],
    participants: [],
    participantTotals: [],
    documents: [],
    agendaItems: [],
    activities: [],
  };

  /* reference data */
  g.regions = OIA_REGIONS.map((r, i) => ({ id: r.id, name: r.name, sortOrder: (i + 1) * 10 }));
  g.countries = COUNTRIES.map((c) => ({ ...c }));
  g.bureaus = BUREAUS.map((b) => ({ code: b.code, name: b.name, kind: b.kind, sortOrder: b.sortOrder }));
  g.topics = TOPICS.map((t) => ({ id: t.id, name: t.name, slug: t.slug, parentId: t.parentId, sortOrder: t.sortOrder }));

  /* people */
  const usedNames = new Set<string>();
  const uniqueName = () => {
    for (;;) {
      const first = rng.pick(FIRST_NAMES);
      const last = rng.pick(LAST_NAMES);
      const full = `${first} ${last}`;
      if (!usedNames.has(full)) {
        usedNames.add(full);
        return { first, last, full };
      }
    }
  };
  const anyName = () => {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    return { first, last, full: `${first} ${last}` };
  };
  const emailFor = (first: string, last: string, domain: string) => `${slugify(first)}.${slugify(last)}@${domain}`;
  const fccPhone = () => `(202) 418-${rng.int(1000, 9999)}`;

  const staffByBureau = new Map<string, StaffRow[]>();
  const staffById = new Map<string, StaffRow>();
  const pushStaff = (row: StaffRow) => {
    g.staff.push(row);
    staffById.set(row.id, row);
    const list = staffByBureau.get(row.bureauCode ?? "") ?? [];
    list.push(row);
    staffByBureau.set(row.bureauCode ?? "", list);
  };
  const demoStaffId = new Map<string, string>();
  for (const u of DEMO_USERS) {
    usedNames.add(u.name);
    const staffId = `stf_${u.id.slice(4)}`;
    demoStaffId.set(u.id, staffId);
    pushStaff({ id: staffId, name: u.name, email: u.email, title: u.title, bureauCode: u.bureauCode, phone: fccPhone(), active: true });
  }
  for (const b of BUREAUS) {
    const have = staffByBureau.get(b.code)?.length ?? 0;
    for (let i = have; i < b.staffCount; i++) {
      const n = uniqueName();
      const titles = b.code === "OIA" ? OIA_TITLES : FCC_TITLES;
      pushStaff({ id: id("stf"), name: n.full, email: emailFor(n.first, n.last, "fcc.gov"), title: rng.pick(titles), bureauCode: b.code, phone: fccPhone(), active: true });
    }
  }

  const priorFy = fiscalYearOf(now) - 1;
  const usersCreatedAt = fiscalYearRange(priorFy).start;
  g.users = DEMO_USERS.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    staffId: demoStaffId.get(u.id) ?? null,
    bureauCode: u.bureauCode,
    regionIds: [...u.regionIds],
    blurb: u.blurb,
    active: true,
    createdAt: usersCreatedAt,
  }));
  const USER = { admin: "usr_dana", coordinator: "usr_priya", expert: "usr_tomas" } as const;
  const leadForRegion = (region: RegionId): string => DEMO_USERS.find((u) => u.role === "regional_lead" && u.regionIds.includes(region))?.id ?? USER.coordinator;

  /* organizations and contacts */
  type Org = OrganizationFixture & { regionId: RegionId };
  const orgs: Org[] = ORGANIZATIONS.map((o) => ({
    ...o,
    regionId: o.kind === "international_org" ? "io" : (COUNTRY_BY_CODE.get(o.cca2)?.regionId ?? "io"),
  }));
  for (const o of orgs) g.organizations.push({ id: o.id, name: o.name, shortName: o.short, kind: o.kind, countryCode: o.cca2, website: o.website ?? null, createdAt: usersCreatedAt });

  const orgsByRegion = new Map<RegionId, Org[]>();
  for (const o of orgs) orgsByRegion.set(o.regionId, [...(orgsByRegion.get(o.regionId) ?? []), o]);
  const fixtureCountryCodes = new Set(orgs.map((o) => o.cca2));
  // Every country a generated meeting may reference, anywhere in the file: the ones
  // ORGANIZATIONS already names, plus the curated allowlist. Keeps placeholder ministries and
  // multi-country delegations from ever pointing at a sanctioned state, a dependency/territory,
  // or a micro-state — not "any ISO country in this region".
  const plausibleCountryCodes = new Set([...fixtureCountryCodes, ...Object.values(MEETING_COUNTRY_ALLOWLIST).flat()]);
  const extraCountries = new Map<RegionId, CountryFixture[]>();
  for (const r of OIA_REGIONS) {
    if (r.id === "io") continue;
    const allowed = MEETING_COUNTRY_ALLOWLIST[r.id];
    const pool = COUNTRIES.filter((c) => c.regionId === r.id && !fixtureCountryCodes.has(c.cca2) && allowed.includes(c.cca2));
    extraCountries.set(r.id, rng.sample(pool, 5));
  }
  const ministryFor = (country: CountryFixture): Org => {
    const existing = orgs.find((o) => o.id === `min-${country.cca2.toLowerCase()}`);
    if (existing) return existing;
    const org: Org = {
      id: `min-${country.cca2.toLowerCase()}`,
      short: `MoC ${country.name}`,
      name: `Ministry of Communications (${country.name})`,
      cca2: country.cca2,
      kind: "ministry",
      regionId: country.regionId,
    };
    orgs.push(org);
    orgsByRegion.set(org.regionId, [...(orgsByRegion.get(org.regionId) ?? []), org]);
    g.organizations.push({ id: org.id, name: org.name, shortName: org.short, kind: org.kind, countryCode: org.cca2, website: null, createdAt: usersCreatedAt });
    return org;
  };

  const contactsByOrg = new Map<string, Ins<typeof s.contacts>[]>();
  const contactFor = (org: Org): Ins<typeof s.contacts> => {
    let list = contactsByOrg.get(org.id);
    if (!list) {
      list = [];
      const domain = `${slugify(org.short)}.example`;
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const name = uniqueName();
        const row: Ins<typeof s.contacts> = {
          id: id("ctc"),
          name: name.full,
          title: rng.pick(VISITOR_TITLES),
          organizationId: org.id,
          email: emailFor(name.first, name.last, domain),
          phone: null,
          notes: null,
          createdAt: usersCreatedAt,
        };
        list.push(row);
        g.contacts.push(row);
      }
      contactsByOrg.set(org.id, list);
    }
    return rng.pick(list);
  };

  /* meeting plan */
  const REGION_WEIGHTS: readonly (readonly [RegionId, number])[] = [["af", 25], ["eap", 25], ["eur", 15], ["wha", 15], ["nea", 8], ["sca", 8], ["io", 4]];
  const prior = fiscalYearRange(priorFy);
  const current = fiscalYearRange(priorFy + 1);
  const totalMeetings = Math.max(0, opts.meetingCount ?? 127);
  const scale = (n: number) => Math.round((totalMeetings * n) / 127);

  // Calendar days in Washington, counted from today (negative = before).
  const today = nyParts(now);
  const dayAt = (offset: number) => nyDate(today.year, today.month, today.day + offset);
  const dayOffsetOf = (d: Date) => {
    const p = nyParts(d);
    return Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(today.year, today.month - 1, today.day)) / DAY);
  };
  const soonest = addMinutes(now, 60);

  // Every workday offers one morning and one afternoon start, so no day carries more than two
  // visits. A slot today only counts if it is at least an hour off.
  type Slot = { day: Date; hours: readonly (readonly [number, number])[] };
  const HALF_DAYS: readonly (readonly (readonly [number, number])[])[] = [
    [[9, 2], [10, 5], [11, 4]],
    [[13, 3], [14, 4], [15, 2]],
  ];
  const slotsBetween = (fromDay: number, toDay: number, notBefore: Date | null): Slot[] => {
    const out: Slot[] = [];
    for (let d = fromDay; d <= toDay; d++) {
      const day = dayAt(d);
      if (!isWorkday(day)) continue;
      for (const half of HALF_DAYS) {
        const hours = notBefore ? half.filter(([h]) => atNy(day, h).getTime() >= notBefore.getTime()) : half;
        if (hours.length > 0) out.push({ day, hours });
      }
    }
    return out;
  };
  const startIn = (slot: Slot) => atNy(slot.day, rng.weighted(slot.hours), rng.chance(0.3) ? 30 : 0);

  // The pipeline ahead is anchored on today, wherever the fiscal year stands: busy this week and
  // the next three, thinning out over five months, each visit further along the nearer it is.
  const AHEAD: readonly { fromDay: number; toDay: number; count: number; statuses: readonly (readonly [MeetingStatus, number])[] }[] = [
    { fromDay: 0, toDay: 6, count: 8, statuses: [["confirmed", 6], ["clearance", 2]] },
    { fromDay: 7, toDay: 29, count: 16, statuses: [["confirmed", 7], ["clearance", 4], ["developing", 5]] },
    { fromDay: 30, toDay: 59, count: 6, statuses: [["developing", 3], ["requested", 2], ["clearance", 1]] },
    { fromDay: 60, toDay: 99, count: 4, statuses: [["developing", 2], ["requested", 1], ["on_hold", 1]] },
    { fromDay: 100, toDay: 150, count: 2, statuses: [["requested", 1], ["developing", 1]] },
  ];
  const PAST_PRIOR: readonly (readonly [MeetingStatus, number])[] = [["closed", 86], ["completed", 5], ["cancelled", 7], ["on_hold", 2]];
  const PAST_CURRENT: readonly (readonly [MeetingStatus, number])[] = [["closed", 55], ["completed", 26], ["cancelled", 10], ["on_hold", 9]];

  const specs: MeetingSpec[] = [];
  let shortfall = 0; // a band too short on workdays (a holiday week) hands its extra visits to the next
  for (const band of AHEAD) {
    const want = scale(band.count) + shortfall;
    const targets = rng.sample(slotsBetween(band.fromDay, band.toDay, soonest), want).map(startIn).sort((a, b) => a.getTime() - b.getTime());
    shortfall = want - targets.length;
    const statuses = deck(rng, targets.length, band.statuses);
    // This week, whatever is still in clearance sits behind the visits already settled.
    if (band.fromDay === 0) statuses.sort((a, b) => Number(a === "clearance") - Number(b === "clearance"));
    targets.forEach((target, i) => specs.push({ fy: fiscalYearOf(target), target, status: statuses[i]!, isPast: false }));
  }

  // The history fills every other seat, spread evenly over last fiscal year and this one to date.
  const pastCount = Math.max(0, totalMeetings - specs.length);
  const priorSlots = slotsBetween(dayOffsetOf(prior.start), dayOffsetOf(current.start) - 1, null);
  const currentSlots = slotsBetween(dayOffsetOf(current.start), -1, null);
  const priorCount = Math.round((pastCount * priorSlots.length) / Math.max(1, priorSlots.length + currentSlots.length));
  // Closing a visit out (readout circulated, counts entered) takes up to three weeks, so a
  // visit held more recently than that is still Completed.
  const closedBy = addBusinessDays(now, -18);
  const history = (slots: readonly Slot[], n: number, weights: readonly (readonly [MeetingStatus, number])[]) => {
    // Month by month, in proportion to each month's workdays and its season, so the record has a
    // rhythm but no month sits empty.
    const byMonth = new Map<string, { month: number; slots: Slot[] }>();
    for (const slot of slots) {
      const { year, month } = nyParts(slot.day);
      const bucket = byMonth.get(`${year}-${month}`) ?? { month, slots: [] };
      bucket.slots.push(slot);
      byMonth.set(`${year}-${month}`, bucket);
    }
    const buckets = [...byMonth.values()];
    const picks = deck(rng, n, buckets.map((b, i) => [i, b.slots.length * SEASON[b.month - 1]!] as const));
    const targets = buckets.flatMap((b, i) => rng.sample(b.slots, picks.filter((p) => p === i).length)).map(startIn);
    const statuses = deck(rng, targets.length, weights);
    targets.forEach((target, i) => {
      const status = statuses[i] === "closed" && target.getTime() > closedBy.getTime() ? "completed" : statuses[i]!;
      specs.push({ fy: fiscalYearOf(target), target, status, isPast: true });
    });
  };
  history(priorSlots, priorCount, PAST_PRIOR);
  history(currentSlots, pastCount - priorCount, PAST_CURRENT);
  const sharedDays = new Set(specs.map((sp) => nyDayKey(sp.target)).filter((key, i, all) => all.indexOf(key) !== i));

  /* meeting cores */
  type Core = {
    row: MeetingRow;
    spec: MeetingSpec;
    org: Org;
    country: CountryFixture;
    topics: TopicFixture[];
    contact: Ins<typeof s.contacts>;
    intermediary: string | null;
    previousStatus: MeetingStatus | null;
    extraCountries: CountryFixture[];
  };
  const cores: Core[] = [];

  // An organization is never booked twice on one day: a clash draws another visitor.
  const booked = new Set<string>();
  const visitorFor = (spec: MeetingSpec): Org => {
    for (let attempt = 0; ; attempt++) {
      const region = rng.weighted(REGION_WEIGHTS);
      const org = region === "io" || rng.chance(0.75) ? rng.pick(orgsByRegion.get(region) ?? orgsByRegion.get("af")!) : ministryFor(rng.pick(extraCountries.get(region) ?? []));
      const key = `${org.id} ${nyDayKey(spec.target)}`;
      if (!booked.has(key) || attempt >= 20) {
        booked.add(key);
        return org;
      }
    }
  };

  for (const spec of specs) {
    const org = visitorFor(spec);
    const country = COUNTRY_BY_CODE.get(org.cca2)!;
    const topics = rng.sample(LEAF_TOPICS, rng.weighted([[1, 35], [2, 45], [3, 20]]));
    const topic = topics[0]!;
    const contact = contactFor(org);
    const intermediary = rng.chance(0.22) ? rng.pick(INTERMEDIARIES) : null;
    const format: MeetingFormat = rng.weighted([["virtual", 45], ["in_person", 45], ["hybrid", 10]]);
    const inRoom = format !== "virtual";
    const ochAttending = inRoom && rng.chance(0.12);
    const delegationSize = rng.weighted([[rng.int(2, 4), 40], [rng.int(5, 8), 40], [rng.int(9, 14), 20]]);
    const interpreter = inRoom && rng.chance(0.2) ? rng.weighted([["consecutive", 3], ["simultaneous", 1]] as const) : "none";
    const requestedAt = spec.isPast
      ? atNy(addDays(spec.target, -rng.int(20, 90)), rng.int(8, 17), rng.int(0, 59))
      : atNy(addBusinessDays(now, -rng.int(...(REQUEST_LEAD[spec.status] ?? [3, 60]))), rng.int(8, 17), rng.int(0, 59));

    const previousStatus: MeetingStatus | null =
      spec.status === "on_hold" ? rng.weighted([["developing", 50], ["clearance", 20], ["confirmed", 30]]) : spec.status === "cancelled" ? rng.weighted([["requested", 25], ["developing", 50], ["clearance", 10], ["confirmed", 15]]) : null;

    const title = rng
      .pick(TITLE_TEMPLATES)
      .replace("{topic}", topic.name)
      .replace("{short}", org.short)
      .replace("{country}", country.name);
    const purpose = rng
      .pick(PURPOSES)
      .replace("{topic}", topic.name.toLowerCase())
      .replace("{topic2}", (topics[1] ?? rng.pick(LEAF_TOPICS)).name.toLowerCase())
      .replace("{short}", org.short)
      .replace("{intermediary}", intermediary ?? "the U.S. Department of State");

    const row: MeetingRow = {
      id: id("mtg"),
      code: "", // assigned after sorting
      fiscalYear: spec.fy,
      sequence: 0,
      title,
      status: spec.status,
      previousStatus,
      format,
      regionId: org.regionId,
      primaryCountryCode: country.cca2,
      organizationId: org.id,
      requestorContactId: contact.id,
      leadUserId: leadForRegion(org.regionId),
      coordinatorUserId: rng.chance(0.75) ? USER.coordinator : USER.admin,
      scheduledStart: null,
      scheduledEnd: null,
      timezone: "America/New_York",
      location: inRoom ? rng.pick(ROOMS) : null,
      virtualLink: format === "in_person" ? null : rng.chance(0.7) ? `https://fcc.zoomgov.com/j/16${rng.int(10_000_000, 99_999_999)}` : "Microsoft Teams — link in calendar invite",
      purpose,
      ochAttending,
      priority: ochAttending || rng.chance(0.1) ? "high" : "normal",
      holdReason: null,
      holdFollowUpAt: null,
      cancelReason: null,
      delegationSize,
      needsAv: inRoom && rng.chance(0.4),
      interpreter,
      accommodations: interpreter !== "none" && rng.chance(0.5) ? "Interpreter requires a seat beside the head of delegation." : rng.chance(0.08) ? "One delegate uses a wheelchair; step-free route to the room." : null,
      localContact: intermediary ? `${anyName().full}, ${intermediary.split(" — ")[0]}` : null,
      backgroundUrl: org.website ?? null,
      viaIntermediary: intermediary,
      requestedAt,
      completedAt: null,
      closedAt: null,
      createdById: USER.coordinator,
      createdAt: requestedAt,
      updatedAt: requestedAt,
    };

    let extra: CountryFixture[] = [];
    let lead = country;
    if (org.kind === "international_org") {
      const scope = IO_REGION_OF_ORG[org.id] ?? "mixed";
      const pool = COUNTRIES.filter((c) => c.cca2 !== country.cca2 && plausibleCountryCodes.has(c.cca2) && (scope === "mixed" ? c.regionId !== "io" : c.regionId === scope));
      extra = rng.sample(pool, rng.int(2, 4));
      // An international organization's delegation is its member states' officials, so the
      // record leads with the first of them — never the city the secretariat sits in, or
      // Washington would count as somewhere the program reached.
      lead = extra[0] ?? country;
      extra = extra.slice(1);
      row.primaryCountryCode = lead.cca2;
      row.title = row.title.replace(country.name, lead.name);
    } else if (rng.chance(0.08)) {
      const pool = COUNTRIES.filter((c) => c.regionId === country.regionId && c.cca2 !== country.cca2 && plausibleCountryCodes.has(c.cca2));
      extra = rng.sample(pool, 1);
    }

    cores.push({ row, spec, org, country: lead, topics, contact, intermediary, previousStatus, extraCountries: extra });
  }

  /* codes: per fiscal year, in order of request */
  cores.sort((a, b) => a.row.fiscalYear - b.row.fiscalYear || a.row.requestedAt.getTime() - b.row.requestedAt.getTime() || a.row.id.localeCompare(b.row.id));
  const seqByFy = new Map<number, number>();
  for (const c of cores) {
    const seq = (seqByFy.get(c.row.fiscalYear) ?? 0) + 1;
    seqByFy.set(c.row.fiscalYear, seq);
    c.row.sequence = seq;
    c.row.code = formatIvpCode(c.row.fiscalYear, seq);
  }

  /* children */
  let openWaits = 0;
  for (const c of cores) buildChildren(c);

  reuseStarredDecks();

  g.meetings = cores.map((c) => c.row);
  return g;

  /* ---------------------------------------------------------------------- */

  /**
   * A starred deck travels: a few later meetings on the same topic pick it up as their own
   * briefing deck, so the library's provenance line and the drawer's "reused from" story are
   * there on first load. The copy points at the source's bytes and remembers where it came from.
   */
  function reuseStarredDecks(): void {
    const topicsOf = new Map<string, Set<string>>();
    for (const mt of g.meetingTopics) {
      const set = topicsOf.get(mt.meetingId) ?? new Set<string>();
      set.add(mt.topicId);
      topicsOf.set(mt.meetingId, set);
    }
    const byId = new Map(cores.map((c) => [c.row.id, c.row]));
    const hasDeck = new Set(g.documents.filter((d) => d.kind === "briefing_deck").map((d) => d.meetingId));
    const starred = g.documents.filter((d) => d.kind === "briefing_deck" && d.reusable).sort((a, b) => (a.addedAt ?? now).getTime() - (b.addedAt ?? now).getTime());
    const laterCores = [...cores].sort((a, b) => a.row.requestedAt.getTime() - b.row.requestedAt.getTime());

    let chains = 0;
    for (const source of starred) {
      if (chains >= 8) break;
      const sourceRow = byId.get(source.meetingId);
      const sourceTopics = topicsOf.get(source.meetingId);
      if (!sourceRow || !sourceTopics) continue;
      const target = laterCores.find((c) => {
        const row = c.row;
        if (row.id === source.meetingId || hasDeck.has(row.id) || row.status === "cancelled") return false;
        if (row.requestedAt.getTime() <= (source.addedAt ?? sourceRow.requestedAt).getTime()) return false;
        const mine = topicsOf.get(row.id);
        return Boolean(mine && [...mine].some((t) => sourceTopics.has(t)));
      });
      if (!target) continue;

      const m = target.row;
      const at = min(atNy(addBusinessDays(m.requestedAt, 2), 10, 30), lastBusinessInstant(addMinutes(now, -30)));
      const coordinator = m.coordinatorUserId ?? USER.coordinator;
      g.documents.push({
        id: id("doc"),
        meetingId: m.id,
        kind: "briefing_deck",
        title: source.title,
        storageKey: source.storageKey,
        filename: source.filename,
        mime: source.mime,
        size: source.size,
        sha256: source.sha256,
        sourceDocumentId: source.id,
        version: 1,
        reusable: false,
        addedById: coordinator,
        addedAt: at,
      });
      g.activities.push({ id: id("act"), meetingId: m.id, kind: "document_added", body: `Briefing deck reused from ${sourceRow.code} — ${source.title}.`, occurredAt: at, authorId: coordinator, createdAt: at, waitingOn: "none" });
      if (!m.updatedAt || at.getTime() > m.updatedAt.getTime()) m.updatedAt = at;
      hasDeck.add(m.id);
      chains += 1;
    }
  }

  /* ---------------------------------------------------------------------- */

  function buildChildren(c: Core): void {
    const m = c.row;
    const { spec, org, topics, contact } = c;
    const effective: MeetingStatus = c.previousStatus ?? spec.status; // where the work got to
    const rank = (st: MeetingStatus) => ["requested", "developing", "clearance", "confirmed", "completed", "closed"].indexOf(st);
    const reached = (st: MeetingStatus) => rank(effective) >= rank(st);
    const coordinator = m.coordinatorUserId ?? USER.coordinator;
    const lead = m.leadUserId ?? coordinator;
    // Believable authorship: mostly the case's coordinator, often its regional lead, and
    // occasionally another OIA staffer covering — never a single name on every entry.
    const backupAuthors = OIA_CASEWORK_USER_IDS.filter((u) => u !== coordinator && u !== lead);
    const authorPool: (readonly [string, number])[] = [
      [coordinator, 58],
      [lead, 24],
      ...backupAuthors.map((u): readonly [string, number] => [u, 18 / Math.max(1, backupAuthors.length)]),
    ];
    const pickAuthor = (): string => rng.weighted(authorPool);
    const active = !spec.isPast && spec.status !== "cancelled";
    // A visit still in clearance within the week is what the attention rail exists for: its
    // front-office wait stays open.
    const thisWeek = !spec.isPast && spec.target.getTime() < dayAt(7).getTime();
    // Nothing is logged after "now", and for past meetings nothing after the eve of the meeting —
    // both clamped to the last real business instant so a weekend "now" or a Monday meeting's
    // Sunday eve can't leak a non-business-hours timestamp into the log.
    const ceiling = spec.isPast
      ? min(lastBusinessInstant(addMinutes(now, -30)), lastBusinessInstant(atNy(addDays(spec.target, -1), 17)))
      : lastBusinessInstant(addMinutes(now, -30));

    /* countries */
    g.meetingCountries.push({ meetingId: m.id, countryCode: m.primaryCountryCode });
    for (const x of c.extraCountries) g.meetingCountries.push({ meetingId: m.id, countryCode: x.cca2 });

    /* topics */
    topics.forEach((t, i) => g.meetingTopics.push({ id: id("mtp"), meetingId: m.id, topicId: t.id, rank: i + 1, detail: i === 0 && rng.chance(0.4) ? `Visitors specifically asked about ${t.name.toLowerCase()} case studies.` : null }));

    /* activity timeline */
    type Act = Ins<typeof s.activities>;
    const acts: Act[] = [];
    let clock = m.requestedAt;
    // Walks `clock` forward in business days, pacing each jump to whatever room is actually left
    // before `ceiling`. A tight window shrinks the jump (and finally the increment) instead of
    // every remaining entry piling up on one repeated instant once the naive jump overshoots.
    const step = (minBd = 1, maxBd = 4): Date => {
      const remainingBd = businessDaysBetween(clock, ceiling);
      let next: Date;
      if (remainingBd > 0) {
        const bd = rng.int(Math.min(minBd, remainingBd), Math.min(maxBd, remainingBd));
        next = atNy(addBusinessDays(clock, bd), rng.int(9, 16), rng.pick([0, 10, 15, 30, 45]));
        if (next.getTime() > ceiling.getTime()) next = ceiling;
      } else {
        // Same business day as the ceiling: keep advancing within it in smaller, varied
        // increments rather than collapsing every remaining entry onto one repeated timestamp.
        const dayEnd = min(ceiling, atNy(clock, 18));
        const remainingMin = Math.floor((dayEnd.getTime() - clock.getTime()) / 60_000);
        next = remainingMin < 2 ? dayEnd : addMinutes(clock, Math.min(remainingMin, rng.int(15, 90)));
      }
      if (next.getTime() <= clock.getTime()) next = addMinutes(clock, 1); // last resort: never repeat or go backward
      clock = next;
      return clock;
    };
    const act = (partial: Omit<Act, "id" | "meetingId" | "createdAt"> & { occurredAt: Date }): Act => {
      const row: Act = { id: id("act"), meetingId: m.id, createdAt: partial.occurredAt, waitingOn: "none", authorId: pickAuthor(), ...partial };
      acts.push(row);
      return row;
    };
    const resolve = (a: Act, at: Date) => {
      a.resolvedAt = at;
      a.resolvedById = pickAuthor();
    };
    const leaveOpen = (always = false) => {
      if (!active) return false;
      const open = always || openWaits < 14 || rng.chance(0.5);
      if (open) openWaits++;
      return open;
    };

    act({
      kind: "system",
      body: c.intermediary ? `Request received from ${c.intermediary}.` : "Request received via the fcc.gov International Visitors form.",
      occurredAt: m.requestedAt,
      authorId: null,
    });
    const topicList = topics.map((t) => t.name).join(", ");
    const delegation = `${m.delegationSize} from ${org.short}`;

    if (effective === "requested") {
      // Stale or fresh: a few requests only have the intake entry.
      if (rng.chance(0.5)) {
        act({ kind: "note", body: `Reviewed request. Proposed topics: ${topicList}. Delegation of ${delegation}.`, occurredAt: step(1, 2) });
        if (rng.chance(0.5)) {
          const a = act({
            kind: "email_out",
            body: `Emailed ${contact.name} to clarify the delegation size and preferred dates; asked for a short bio list.`,
            occurredAt: step(0, 2),
            waitingOn: "visitor",
            waitingOnLabel: `${org.short} POC`,
            nextAction: "Follow up if no reply",
            nextActionDueAt: addBusinessDays(clock, 5),
          });
          if (!leaveOpen()) resolve(a, step(1, 3));
        }
      }
    } else {
      act({ kind: "note", body: `Reviewed request. Proposed topics: ${topicList}. Delegation of ${delegation}. Assigned to ${staffName(m.leadUserId)}.`, occurredAt: step(1, 2) });
      act({ kind: "status_change", body: "Status: Requested → Developing", occurredAt: step(0, 1) });

      const ask = act({
        kind: "email_out",
        body: `Emailed ${contact.name} to confirm ${nyShort(spec.target)} by ${nyShort(addBusinessDays(clock, 5))}; asked for the delegation list.`,
        occurredAt: step(1, 3),
        waitingOn: "visitor",
        waitingOnLabel: `${org.short} POC`,
        nextAction: "Follow up if no reply",
        nextActionDueAt: addBusinessDays(clock, 5),
      });
      const dateSettled = reached("confirmed") || (effective === "clearance" && rng.chance(0.6)) || (effective === "developing" && rng.chance(0.35));
      if (dateSettled) {
        const reply = step(2, 6);
        resolve(ask, reply);
        act({ kind: "email_in", body: `${contact.name} replied — ${m.delegationSize} delegates, ${nyShort(spec.target)} works. Asked whether ${(topics[1] ?? topics[0]!).name} could be covered.`, occurredAt: reply, authorId: null });
        act({ kind: "date_confirmed", body: `${nyLong(spec.target)} accepted by both sides.`, occurredAt: step(0, 1) });
      } else if (leaveOpen()) {
        if (rng.chance(0.5)) act({ kind: "email_out", body: `Followed up with ${contact.name}; no response yet.`, occurredAt: step(3, 7), waitingOn: "none" });
      } else {
        const reply = step(2, 6);
        resolve(ask, reply);
        act({ kind: "email_in", body: `${contact.name} proposed ${nyShort(addDays(spec.target, rng.int(3, 12)))} as an alternate; checking expert availability.`, occurredAt: reply, authorId: null });
        act({ kind: "date_proposed", body: `Visitors proposed ${nyLong(spec.target)}; awaiting FCC-side confirmation.`, occurredAt: step(0, 1) });
      }
    }

    /* experts (also generates their activity entries) */
    const expertRows = buildExperts(c, effective, act, step, resolve, leaveOpen);
    g.experts.push(...expertRows);

    /* OCH */
    if (m.ochAttending) {
      const a = act({
        kind: "email_out",
        body: "Asked OCH whether the Chairman can join the opening 15 minutes.",
        occurredAt: step(1, 3),
        waitingOn: "och",
        waitingOnLabel: "Office of the Chairman",
        nextAction: "Confirm Chairman's availability",
        nextActionDueAt: addBusinessDays(clock, 7),
      });
      if (reached("confirmed") || !leaveOpen()) {
        const at = step(2, 5);
        resolve(a, at);
        act({ kind: "email_in", body: "OCH confirmed the Chairman will join for the first 15 minutes.", occurredAt: at, authorId: null });
      }
    }

    /* clearance and confirmation */
    if (reached("clearance")) {
      const a = act({
        kind: "status_change",
        body: "Status: Developing → Clearance. Agenda sent to the OIA front office.",
        occurredAt: step(1, 4),
        waitingOn: "internal",
        waitingOnLabel: "OIA front office",
        nextAction: "Chase clearance",
        nextActionDueAt: addBusinessDays(clock, 3),
      });
      if (reached("confirmed")) {
        const at = step(1, 3);
        resolve(a, at);
        act({ kind: "status_change", body: "Status: Clearance → Confirmed. Confirmation sent to the delegation.", occurredAt: at });
      } else if (!leaveOpen(thisWeek)) {
        resolve(a, step(1, 3));
        act({ kind: "note", body: "Front office asked for a shorter agenda; revising.", occurredAt: clock });
      }
    }
    if (rng.chance(0.3) && reached("developing")) act({ kind: "call", body: `Call with ${contact.name} to walk through logistics (${m.format === "in_person" ? "in person at 45 L Street" : m.format === "virtual" ? "virtual" : "hybrid"}).`, occurredAt: step(1, 3) });

    /* candidate dates and schedule */
    const accepted = reached("confirmed") || acts.some((a) => a.kind === "date_confirmed");
    const dateCount = rng.int(1, 3);
    for (let i = 0; i < dateCount; i++) {
      const isAccepted = i === 0 && accepted;
      // An upcoming visit's fallbacks come after its planned day, so the record still shows that day.
      const day = i === 0 ? spec.target : toWorkday(addDays(spec.target, rng.pick(spec.isPast ? [-14, -7, -3, 3, 7, 14] : [3, 7, 14])));
      g.candidateDates.push({
        id: id("cdt"),
        meetingId: m.id,
        start: day,
        end: addMinutes(day, 90),
        proposedBy: i === 0 ? rng.weighted([["visitor", 3], ["fcc", 2]]) : rng.pick(["fcc", "visitor"] as const),
        status: isAccepted ? "accepted" : accepted || spec.status === "cancelled" ? rng.pick(["declined", "withdrawn"] as const) : "proposed",
        note: i === 0 ? null : rng.chance(0.4) ? "Fallback if the expert is travelling." : null,
        createdAt: m.requestedAt,
      });
    }
    if (accepted) {
      // A full-day program starts at 9 and needs the day to itself; one planned for later today keeps its own start.
      const fullDay = m.format === "in_person" && !sharedDays.has(nyDayKey(spec.target)) && (spec.isPast || atNy(spec.target, 9).getTime() >= soonest.getTime()) && rng.chance(0.12);
      m.scheduledStart = fullDay ? atNy(spec.target, 9) : spec.target;
      const minutes = fullDay ? 420 : m.format === "virtual" ? rng.pick([60, 90]) : rng.pick([90, 120, 180]);
      m.scheduledEnd = addMinutes(m.scheduledStart, minutes);
    }

    /* hold / cancel */
    if (spec.status === "on_hold") {
      const at = step(1, 5);
      m.holdReason = rng.pick(HOLD_REASONS);
      // A hold on a meeting whose date has passed keeps getting bumped; its follow-up sits near today rather than a year back.
      m.holdFollowUpAt = spec.isPast ? addBusinessDays(now, rng.int(-25, 15)) : addBusinessDays(at, rng.int(5, 30));
      act({ kind: "hold", body: `On hold — ${m.holdReason} Follow up ${nyShort(m.holdFollowUpAt)}.`, occurredAt: at });
    }
    if (spec.status === "cancelled") {
      const at = spec.isPast ? min(step(1, 6), addDays(spec.target, -1)) : step(1, 6);
      m.cancelReason = rng.pick(CANCEL_REASONS);
      act({ kind: "status_change", body: `Status: ${label(effective)} → Cancelled. ${m.cancelReason}`, occurredAt: at });
    }

    /* documents */
    const probs = DOC_PROBABILITY[effective];
    const docs: Ins<typeof s.meetingDocuments>[] = [];
    for (const [kind, p] of Object.entries(probs) as [DocumentKind, number][]) {
      if (!rng.chance(p)) continue;
      // Readouts are written after the meeting; everything else lands while it is being developed.
      const at = kind === "readout" && m.scheduledEnd ? atNy(addBusinessDays(m.scheduledEnd, rng.int(1, 5)), rng.int(9, 16), 30) : step(0, 2);
      if (at.getTime() > now.getTime()) continue; // a readout not written yet
      const title = DOC_TITLES[kind]({ short: org.short, topic: topics[0]!.name });
      const docId = id("doc");
      // A seed:// key is rendered from this very record on request — no bytes at seed time.
      const doc: Ins<typeof s.meetingDocuments> = {
        id: docId,
        meetingId: m.id,
        kind,
        title,
        storageKey: `seed://${docId}`,
        filename: `${slugify(title) || "document"}.pdf`,
        mime: "application/pdf",
        size: null,
        sha256: null,
        sourceDocumentId: null,
        version: kind === "agenda_draft" ? rng.int(1, 3) : 1,
        reusable: kind === "briefing_deck" && rng.chance(0.5),
        addedById: coordinator,
        addedAt: at,
      };
      docs.push(doc);
      act({ kind: "document_added", body: `Added ${title}.`, occurredAt: at });
    }
    g.documents.push(...docs);

    /* agenda */
    if (m.scheduledStart && docs.some((d) => d.kind === "agenda_final" || d.kind === "agenda_draft")) {
      const briefers = expertRows.filter((e) => e.status === "confirmed").map((e) => e.staffId);
      const items: [string, number, string | null][] = [["Welcome and introductions (OIA)", 10, null]];
      topics.forEach((t, i) => items.push([`${t.name} — FCC overview and discussion`, i === 0 ? 40 : 25, t.id]));
      items.push(["Questions and open discussion", 20, null], ["Closing remarks and next steps", 10, null]);
      let cursor = m.scheduledStart;
      items.forEach(([title, mins, topicId], i) => {
        g.agendaItems.push({ id: id("agd"), meetingId: m.id, sortOrder: i + 1, startsAt: cursor, endsAt: addMinutes(cursor, mins), title, topicId, brieferStaffIds: topicId ? briefers.slice(0, 2) : [], notes: null });
        cursor = addMinutes(cursor, mins);
      });
    }

    /* participants */
    const delegationCat = delegationCategory(org.kind);
    const named = effective === "requested" ? Math.min(m.delegationSize ?? 1, rng.int(1, 2)) : (m.delegationSize ?? 1);
    const attendedFlag = () => (reached("completed") ? rng.chance(0.92) : null);
    g.participants.push({ id: id("ppl"), meetingId: m.id, name: contact.name, title: contact.title ?? null, organizationId: org.id, contactId: contact.id, category: delegationCat, isInterpreter: false, attended: attendedFlag() });
    for (let i = 1; i < named; i++) g.participants.push({ id: id("ppl"), meetingId: m.id, name: anyName().full, title: rng.pick(VISITOR_TITLES), organizationId: org.id, contactId: null, category: delegationCat, isInterpreter: false, attended: attendedFlag() });
    if (m.interpreter !== "none") g.participants.push({ id: id("ppl"), meetingId: m.id, name: anyName().full, title: "Interpreter", organizationId: null, contactId: null, category: "other", isInterpreter: true, attended: attendedFlag() });
    const fccPeople = [staffById.get(demoStaffId.get(coordinator) ?? "")!, ...expertRows.filter((e) => e.status === "confirmed").map((e) => staffById.get(e.staffId)!)];
    for (const p of fccPeople) g.participants.push({ id: id("ppl"), meetingId: m.id, name: p.name, title: p.title ?? null, organizationId: null, contactId: null, category: "fcc", isInterpreter: false, attended: attendedFlag() });
    if (rng.chance(0.3)) for (const [title, orgName] of rng.sample(OTHER_USG, rng.int(1, 2))) g.participants.push({ id: id("ppl"), meetingId: m.id, name: anyName().full, title: `${title}, ${orgName}`, organizationId: null, contactId: null, category: "other_usg", isInterpreter: false, attended: attendedFlag() });
    if (org.kind !== "industry" && rng.chance(0.08)) g.participants.push({ id: id("ppl"), meetingId: m.id, name: anyName().full, title: "Regulatory Affairs Director, national operator", organizationId: null, contactId: null, category: "industry", isInterpreter: false, attended: attendedFlag() });

    const planned = new Map<ParticipantCategory, number>();
    for (const p of g.participants) {
      if (p.meetingId !== m.id) continue;
      const category = p.category ?? delegationCat;
      planned.set(category, (planned.get(category) ?? 0) + 1);
    }
    planned.set(delegationCat, Math.max(planned.get(delegationCat) ?? 0, m.delegationSize ?? 1));
    const hasActuals = reached("completed") && rng.chance(0.8);
    for (const [category, n] of planned) {
      g.participantTotals.push({ id: id("ptt"), meetingId: m.id, category, planned: n, actual: hasActuals ? Math.max(0, n + rng.weighted([[0, 6], [-1, 2], [-2, 1], [1, 1]])) : null });
    }

    /* completion */
    if (reached("completed") && m.scheduledEnd) {
      m.completedAt = m.scheduledEnd;
      const attended = g.participants.filter((p) => p.meetingId === m.id && p.attended).length;
      const held = addMinutes(m.scheduledEnd, 45);
      act({ kind: "note", body: `Meeting held. ${attended} attended; ${expertRows.filter((e) => e.status === "confirmed").length} FCC briefer(s).`, occurredAt: held });
      act({ kind: "status_change", body: "Status: Confirmed → Completed", occurredAt: addMinutes(held, 5) });
      if (spec.status === "closed") {
        m.closedAt = atNy(addBusinessDays(held, rng.int(3, 15)), rng.int(9, 16));
        act({ kind: "note", body: "Readout circulated to the OIA front office; participant counts entered.", occurredAt: addMinutes(m.closedAt, -20) });
        act({ kind: "status_change", body: "Status: Completed → Closed", occurredAt: m.closedAt });
      }
    }

    acts.sort((a, b) => (a.occurredAt ?? now).getTime() - (b.occurredAt ?? now).getTime());
    g.activities.push(...acts);
    m.updatedAt = acts[acts.length - 1]?.occurredAt ?? m.requestedAt;
  }

  function buildExperts(
    c: Core,
    effective: MeetingStatus,
    act: (p: Omit<Ins<typeof s.activities>, "id" | "meetingId" | "createdAt"> & { occurredAt: Date }) => Ins<typeof s.activities>,
    step: (minBd?: number, maxBd?: number) => Date,
    resolve: (a: Ins<typeof s.activities>, at: Date) => void,
    leaveOpen: () => boolean,
  ): Ins<typeof s.meetingExperts>[] {
    const m = c.row;
    const rows: Ins<typeof s.meetingExperts>[] = [];
    if (effective === "requested") return rows;

    // An expert's own confirm/decline is credited to them by name only when they are also a
    // registered demo user (today, just the Space Bureau briefer). Every other briefer lives
    // only in the staff directory, so the FK to users leaves those entries unattributed rather
    // than misattributed to a generic OIA staffer.
    const expertUserStaffId = demoStaffId.get(USER.expert);
    const expertAuthorFor = (staffId: string): string | null => (staffId === expertUserStaffId ? USER.expert : null);

    const bureauPool = [...new Set(c.topics.flatMap((t) => t.bureaus))];
    const count = rng.weighted([[1, 25], [2, 40], [3, 25], [4, 10]]);
    const chosen: StaffRow[] = [];
    if (c.topics.some((t) => t.id.startsWith("satellite") || t.id === "ngso" || t.id === "orbital-debris" || t.id === "space-bureau-processes") && rng.chance(0.6)) {
      chosen.push(staffById.get(demoStaffId.get(USER.expert)!)!);
    }
    for (const code of rng.shuffle(bureauPool)) {
      if (chosen.length >= count) break;
      const pool = (staffByBureau.get(code) ?? []).filter((st) => !chosen.includes(st));
      if (pool.length) chosen.push(rng.pick(pool));
    }
    while (chosen.length < count) {
      const pool = g.staff.filter((st) => !chosen.includes(st) && st.bureauCode !== "OIA" && st.bureauCode !== "OCH");
      chosen.push(rng.pick(pool));
    }

    const statusFor = (i: number): ExpertStatus => {
      switch (effective) {
        case "developing":
          return i === 0 ? rng.weighted([["requested", 45], ["confirmed", 35], ["tbd", 20]]) : rng.weighted([["tbd", 40], ["requested", 35], ["confirmed", 25]]);
        case "clearance":
          return rng.weighted([["confirmed", 75], ["requested", 25]]);
        default:
          return "confirmed";
      }
    };
    if (c.spec.status === "cancelled") {
      chosen.forEach((st, i) => rows.push({ id: id("exp"), meetingId: m.id, staffId: st.id, bureauCode: st.bureauCode ?? null, role: i === 0 ? "lead" : "briefer", status: rng.weighted([["withdrawn", 5], ["declined", 2], ["requested", 3]]), requestedAt: step(0, 2), respondedAt: null, note: null, createdAt: m.requestedAt }));
      return rows;
    }

    let confirmedCount = 0;
    chosen.forEach((st, i) => {
      let status = statusFor(i);
      const declinedFirst = status === "confirmed" && rng.chance(0.12);
      const requestedAt = step(0, 2);
      const topic = c.topics[i % c.topics.length]!;
      const bureau = BUREAU_BY_CODE.get(st.bureauCode ?? "")?.code ?? st.bureauCode ?? "FCC";
      if (declinedFirst) {
        const altPool = g.staff.filter((x) => x.bureauCode === st.bureauCode && x.id !== st.id && !chosen.includes(x));
        const alt = altPool.length ? rng.pick(altPool) : undefined;
        const declineAt = step(1, 4);
        rows.push({ id: id("exp"), meetingId: m.id, staffId: st.id, bureauCode: st.bureauCode ?? null, role: "briefer", status: "declined", requestedAt, respondedAt: declineAt, note: "On travel that week.", createdAt: m.requestedAt });
        act({ kind: "expert_requested", body: `Requested ${st.name} (${bureau}) to brief on ${topic.name}.`, occurredAt: requestedAt });
        act({ kind: "expert_declined", body: `${st.name} declined — on travel. Asked ${bureau} front office for an alternate.`, occurredAt: declineAt, authorId: expertAuthorFor(st.id) });
        if (alt) {
          const altAsk = step(0, 2);
          const altOk = step(1, 4);
          rows.push({ id: id("exp"), meetingId: m.id, staffId: alt.id, bureauCode: alt.bureauCode ?? null, role: i === 0 ? "lead" : "briefer", status: "confirmed", requestedAt: altAsk, respondedAt: altOk, note: null, createdAt: m.requestedAt });
          act({ kind: "expert_requested", body: `Requested ${alt.name} (${bureau}) as the alternate briefer on ${topic.name}.`, occurredAt: altAsk });
          act({ kind: "expert_confirmed", body: `${alt.name} confirmed.`, occurredAt: altOk, authorId: expertAuthorFor(alt.id) });
          confirmedCount++;
          return;
        }
        status = "confirmed"; // no alternate found in the bureau: the original relents
      }
      if (status === "tbd") {
        rows.push({ id: id("exp"), meetingId: m.id, staffId: st.id, bureauCode: st.bureauCode ?? null, role: i === 0 ? "lead" : "briefer", status: "tbd", requestedAt: null, respondedAt: null, note: "Identified; not yet asked.", createdAt: m.requestedAt });
        return;
      }
      const ask = act({
        kind: "expert_requested",
        body: `Requested ${st.name} (${bureau}) to brief on ${topic.name}.`,
        occurredAt: requestedAt,
        waitingOn: "expert",
        waitingOnLabel: st.name,
        nextAction: "Confirm briefer",
        nextActionDueAt: addBusinessDays(requestedAt, 5),
      });
      if (status === "confirmed") {
        const at = step(1, 6);
        resolve(ask, at);
        act({ kind: "expert_confirmed", body: `${st.name} confirmed for ${topic.name}.`, occurredAt: at, authorId: expertAuthorFor(st.id) });
        rows.push({ id: id("exp"), meetingId: m.id, staffId: st.id, bureauCode: st.bureauCode ?? null, role: i === 0 ? "lead" : "briefer", status: "confirmed", requestedAt, respondedAt: at, note: null, createdAt: m.requestedAt });
        confirmedCount++;
      } else {
        // still requested
        if (!leaveOpen()) {
          const at = step(1, 6);
          resolve(ask, at);
          act({ kind: "expert_confirmed", body: `${st.name} confirmed for ${topic.name}.`, occurredAt: at, authorId: expertAuthorFor(st.id) });
          rows.push({ id: id("exp"), meetingId: m.id, staffId: st.id, bureauCode: st.bureauCode ?? null, role: i === 0 ? "lead" : "briefer", status: "confirmed", requestedAt, respondedAt: at, note: null, createdAt: m.requestedAt });
          confirmedCount++;
        } else {
          rows.push({ id: id("exp"), meetingId: m.id, staffId: st.id, bureauCode: st.bureauCode ?? null, role: i === 0 ? "lead" : "briefer", status: "requested", requestedAt, respondedAt: null, note: null, createdAt: m.requestedAt });
        }
      }
    });

    // Confirmed-or-later meetings always have at least one confirmed briefer.
    const rankOf = ["requested", "developing", "clearance", "confirmed", "completed", "closed"].indexOf(effective);
    if (rankOf >= 3 && confirmedCount === 0) {
      const first = rows[0];
      if (first) {
        first.status = "confirmed";
        first.respondedAt = step(1, 3);
        act({ kind: "expert_confirmed", body: `${staffById.get(first.staffId)?.name ?? "Briefer"} confirmed.`, occurredAt: first.respondedAt, authorId: expertAuthorFor(first.staffId) });
      }
    }
    return rows;
  }

  function staffName(userId: string | null | undefined): string {
    return DEMO_USERS.find((u) => u.id === userId)?.name ?? "OIA";
  }

  function label(status: MeetingStatus): string {
    return { requested: "Requested", developing: "Developing", clearance: "Clearance", confirmed: "Confirmed", completed: "Completed", closed: "Closed", on_hold: "On hold", cancelled: "Cancelled" }[status];
  }
}
