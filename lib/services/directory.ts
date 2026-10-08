import { MeetingListQuery } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { makeDirectoryRepo, type StaffFilters } from "@/lib/db/repos/directory";
import { makeDocumentsRepo } from "@/lib/db/repos/documents";
import { makeMeetingsRepo, type MeetingListItem } from "@/lib/db/repos/meetings";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { type Page, pageSlice } from "@/lib/domain/directory-query";
import { buildDossier, type Dossier, type StaffInfo } from "@/lib/domain/dossier";
import { fiscalYearOf } from "@/lib/domain/fiscal-year";
import { type PolicyUser, readableScope } from "@/lib/domain/policy";
import { COUNTED_STATUSES, countBy, type NamedCount } from "@/lib/domain/tallies";
import { type ExpertRole, ORG_KIND_LABELS, type OrgKind } from "@/lib/domain/types";

/**
 * Read helpers behind the Directory and Countries sections. Every page in those two areas goes
 * through here rather than writing its own SQL — the repos stay small and additive, and pages
 * stay declarative.
 */

/** One row in a reverse-chronological "their meetings" list — the shape `MeetingHistoryList` renders. */
export type EngagementHistoryItem = { id: string; code: string; title: string; status: MeetingListItem["status"]; scheduledStart: Date | null; subtitle: string | null };

/* ------------------------------------ experts ------------------------------------ */

export type ExpertFilters = { bureauCode?: string; q?: string; sort?: "engagements" | "name" };

export type ExpertSummary = {
  id: string;
  name: string;
  title: string | null;
  email: string;
  phone: string | null;
  bureauCode: string | null;
  bureauName: string | null;
  /** Topics they've been confirmed to brief on, most frequent first (top 4). */
  expertise: { topicId: string; name: string; count: number }[];
  /** Every time they've been asked onto a meeting, whatever the outcome — "how engaged is this person with the program". */
  engagements: number;
  avgReplyBusinessDays: number | null;
  lastBriefedAt: Date | null;
};

const EXPERT_ROLE_LABELS: Record<ExpertRole, string> = { lead: "Lead", briefer: "Briefer", attendee: "Attendee" };

/** Every FCC expert/POC, with expertise and engagement stats batched per person (Promise.all — fine at the seed's ~100-row scale; revisit with a joined query if the roster grows much past that). */
export async function listExperts(db: Db, filters: ExpertFilters = {}): Promise<ExpertSummary[]> {
  const dir = makeDirectoryRepo(db);
  const staffFilters: StaffFilters = { bureauCode: filters.bureauCode, q: filters.q?.trim() || undefined };
  const staff = await dir.listStaff(staffFilters);

  const summaries = await Promise.all(
    staff.map(async (person): Promise<ExpertSummary> => {
      const [expertise, stats] = await Promise.all([dir.expertiseFor(person.id), dir.engagementStats(person.id)]);
      return {
        id: person.id,
        name: person.name,
        title: person.title,
        email: person.email,
        phone: person.phone,
        bureauCode: person.bureauCode,
        bureauName: person.bureau?.name ?? null,
        expertise: expertise.slice(0, 4),
        engagements: stats.assignments,
        avgReplyBusinessDays: stats.avgResponseBusinessDays,
        lastBriefedAt: stats.lastBriefedAt,
      };
    }),
  );

  const sort = filters.sort ?? "engagements";
  return summaries.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "en") : b.engagements - a.engagements || a.name.localeCompare(b.name, "en")));
}

/**
 * One page of the experts list. The sort is on a derived figure (engagements), so the whole
 * filtered list is built and then cut; at the roster's size that is cheaper than teaching SQL
 * the derivation, and `listExperts`' own note says when to revisit it.
 */
export type ExpertsPage = Page<ExpertSummary> & {
  /** The busiest person in the whole filtered list, so every page draws its bars against one scale. */
  maxEngagements: number;
};

export async function listExpertsPage(db: Db, filters: ExpertFilters, paging: { page: number; pageSize: number }): Promise<ExpertsPage> {
  const all = await listExperts(db, filters);
  return { ...pageSlice(all, paging.page, paging.pageSize), maxEngagements: all.reduce((max, expert) => Math.max(max, expert.engagements), 0) };
}

/** How many each directory tab holds in all — the figures on the tabs, which no search or filter moves. */
export async function directoryCounts(db: Db): Promise<{ experts: number; organizations: number }> {
  return makeDirectoryRepo(db).counts();
}

export type ExpertProfile = ExpertSummary & { active: boolean; history: EngagementHistoryItem[] };

/** One expert's profile: identity, expertise, engagement stats and their full assignment history. */
export async function getExpertProfile(db: Db, staffId: string): Promise<ExpertProfile | null> {
  const dir = makeDirectoryRepo(db);
  const person = await dir.getStaff(staffId);
  if (!person) return null;

  const [expertise, stats, assignments] = await Promise.all([dir.expertiseFor(staffId), dir.engagementStats(staffId), dir.assignmentsFor(staffId)]);
  const history: EngagementHistoryItem[] = assignments.map((a) => ({
    id: a.meeting.id,
    code: a.meeting.code,
    title: a.meeting.title,
    status: a.meeting.status,
    scheduledStart: a.meeting.scheduledStart,
    subtitle: `${a.meeting.organization?.shortName ?? a.meeting.organization?.name ?? "—"} · ${EXPERT_ROLE_LABELS[a.role]}`,
  }));

  return {
    id: person.id,
    name: person.name,
    title: person.title,
    email: person.email,
    phone: person.phone,
    bureauCode: person.bureauCode,
    bureauName: person.bureau?.name ?? null,
    expertise: expertise.slice(0, 4),
    engagements: stats.assignments,
    avgReplyBusinessDays: stats.avgResponseBusinessDays,
    lastBriefedAt: stats.lastBriefedAt,
    active: person.active,
    history,
  };
}

/* ------------------------------------ dossiers ------------------------------------ */

/**
 * The dossier behind a profile: what the subject's meetings say, and the documents on them
 * this reader may see. Directory reading is open to every role; the shelf follows the
 * library's rule instead — an expert sees the materials of their own briefings only. Without
 * an actor (metadata, tests) the shelf is the whole one.
 */
async function dossierFor(db: Db, items: MeetingListItem[], actor: PolicyUser | undefined, now: Date, materialsHref: string): Promise<Dossier> {
  const scope = actor ? readableScope(actor) : { all: true as const };
  const readable = "all" in scope ? items : items.filter((m) => scope.staffId !== "" && m.experts.some((e) => e.staffId === scope.staffId));
  const staffIds = [...new Set(items.flatMap((m) => m.experts.filter((e) => e.status === "confirmed").map((e) => e.staffId)))];
  const [documents, people] = await Promise.all([makeDocumentsRepo(db).forMeetings(readable.map((m) => m.id)), makeDirectoryRepo(db).staffByIds(staffIds)]);
  const staff = new Map<string, StaffInfo>(people.map((p) => [p.id, { name: p.name, bureauCode: p.bureauCode, bureauName: p.bureau?.name ?? null }]));
  return buildDossier(items, documents, staff, now, materialsHref);
}

/* --------------------------------- organizations ---------------------------------- */

export type OrganizationSummary = {
  id: string;
  name: string;
  shortName: string | null;
  kind: OrgKind;
  kindLabel: string;
  countryCode: string | null;
  countryName: string | null;
  meetingCount: number;
  lastMeetingAt: Date | null;
};

/** Every organization the program has a record of, with its meeting tally and country. Sorted
 * by what the directory table actually displays — the short name (falling back to the full
 * name) — not the full name alone, so acronyms land alphabetically as shown. */
export async function listOrganizationsSummary(db: Db, q?: string): Promise<OrganizationSummary[]> {
  const rows = await makeDirectoryRepo(db).listOrganizations(q);
  return rows
    .map((o) => ({
      id: o.id,
      name: o.name,
      shortName: o.shortName,
      kind: o.kind,
      kindLabel: ORG_KIND_LABELS[o.kind],
      countryCode: o.countryCode,
      countryName: o.countryName,
      meetingCount: o.meetingCount,
      lastMeetingAt: o.lastMeetingAt,
    }))
    .sort((a, b) => (a.shortName ?? a.name).localeCompare(b.shortName ?? b.name, "en"));
}

export type OrganizationContact = { id: string; name: string; title: string | null; email: string | null; phone: string | null };

export type OrganizationProfile = {
  id: string;
  name: string;
  shortName: string | null;
  kind: OrgKind;
  kindLabel: string;
  countryCode: string | null;
  countryName: string | null;
  website: string | null;
  contacts: OrganizationContact[];
  history: EngagementHistoryItem[];
  dossier: Dossier;
};

/** One organization's profile: identity, contacts, its full meeting history and the dossier drawn from it. */
export async function getOrganizationProfile(db: Db, id: string, now = new Date(), actor?: PolicyUser): Promise<OrganizationProfile | null> {
  const [org, items] = await Promise.all([makeDirectoryRepo(db).getOrganization(id), makeMeetingsRepo(db).forHistory({ orgId: id }, now)]);
  if (!org) return null;
  return {
    id: org.id,
    name: org.name,
    shortName: org.shortName,
    kind: org.kind,
    kindLabel: ORG_KIND_LABELS[org.kind],
    countryCode: org.countryCode,
    countryName: org.country?.name ?? null,
    website: org.website,
    contacts: org.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, email: c.email, phone: c.phone })),
    history: org.meetings.map((m) => ({ id: m.id, code: m.code, title: m.title, status: m.status, scheduledStart: m.scheduledStart, subtitle: m.primaryCountry?.name ?? null })),
    dossier: await dossierFor(db, items, actor, now, `/documents?orgId=${encodeURIComponent(id)}`),
  };
}

/* ------------------------------------ countries ------------------------------------ */

export type CountrySummary = {
  cca2: string;
  name: string;
  regionName: string;
  /** Engagements (confirmed/completed/closed) recorded in the current fiscal year. */
  fyCount: number;
  /** Engagements recorded all-time — countries with none of these are left off the list entirely. */
  engagementCount: number;
  lastEngagedAt: Date | null;
  topTopics: NamedCount[];
};

/** Loads every meeting (any status) once and folds it per country; fine at Phase 1 scale — see meetings.ts's own note on this. */
async function allMeetingsByCountry(db: Db): Promise<Map<string, MeetingListItem[]>> {
  const query = MeetingListQuery.parse({ view: "all", pageSize: 200 });
  const { items } = await makeMeetingsRepo(db).list(query, { all: true }, new Date());
  const byCountry = new Map<string, MeetingListItem[]>();
  for (const m of items) for (const code of m.countryCodes) byCountry.set(code, [...(byCountry.get(code) ?? []), m]);
  return byCountry;
}

/** Every country the program has actually engaged (at least one confirmed/completed/closed meeting), ranked by this fiscal year's count. */
export async function listCountriesSummary(db: Db, now = new Date()): Promise<CountrySummary[]> {
  const fy = fiscalYearOf(now);
  const [countries, byCountry] = await Promise.all([makeReferenceRepo(db).countries(), allMeetingsByCountry(db)]);

  const summaries: CountrySummary[] = [];
  for (const country of countries) {
    const all = byCountry.get(country.cca2) ?? [];
    const counted = all.filter((m) => COUNTED_STATUSES.includes(m.status));
    if (counted.length === 0) continue; // "where the program reaches" — not an exhaustive ISO list
    const starts = counted.map((m) => m.scheduledStart).filter((d): d is Date => d !== null);
    summaries.push({
      cca2: country.cca2,
      name: country.name,
      regionName: country.region.name,
      fyCount: counted.filter((m) => m.fiscalYear === fy).length,
      engagementCount: counted.length,
      lastEngagedAt: starts.length ? new Date(Math.max(...starts.map((d) => d.getTime()))) : null,
      topTopics: countBy(counted, (m) => m.topics.map((t) => t.name)).slice(0, 3),
    });
  }
  return summaries.sort((a, b) => b.fyCount - a.fyCount || b.engagementCount - a.engagementCount || a.name.localeCompare(b.name, "en"));
}

export type CountryOrganization = { id: string; name: string; kindLabel: string; meetingCount: number; contacts: OrganizationContact[] };

export type CountryProfile = {
  cca2: string;
  name: string;
  regionName: string;
  lat: number;
  lng: number;
  engagementCount: number;
  /** Fiscal year of this country's earliest counted engagement; null when it has none. */
  firstFy: number | null;
  topTopics: NamedCount[];
  organizations: CountryOrganization[];
  history: EngagementHistoryItem[];
  dossier: Dossier;
};

/** One country's profile: identity, topic mix, organizations (with contacts), full engagement history and the dossier drawn from it. */
export async function getCountryProfile(db: Db, code: string, now = new Date(), actor?: PolicyUser): Promise<CountryProfile | null> {
  const cca2 = code.toUpperCase();
  const ref = makeReferenceRepo(db);
  const country = await ref.country(cca2);
  if (!country) return null;

  const query = MeetingListQuery.parse({ view: "all", countryCode: cca2, pageSize: 200, sort: "date", dir: "desc" });
  const [{ items }, orgs] = await Promise.all([makeMeetingsRepo(db).list(query, { all: true }, now), makeDirectoryRepo(db).listOrganizations()]);

  const counted = items.filter((m) => COUNTED_STATUSES.includes(m.status));
  const fys = counted.map((m) => m.fiscalYear);

  const countryOrgs = orgs.filter((o) => o.countryCode === cca2);
  const organizations: CountryOrganization[] = await Promise.all(
    countryOrgs.map(async (o) => {
      const contacts = await makeDirectoryRepo(db).listContacts(o.id);
      return { id: o.id, name: o.shortName ?? o.name, kindLabel: ORG_KIND_LABELS[o.kind], meetingCount: o.meetingCount, contacts: contacts.map((c) => ({ id: c.id, name: c.name, title: c.title, email: c.email, phone: c.phone })) };
    }),
  );

  return {
    cca2: country.cca2,
    name: country.name,
    regionName: country.region.name,
    lat: country.lat,
    lng: country.lng,
    engagementCount: counted.length,
    firstFy: fys.length ? Math.min(...fys) : null,
    topTopics: countBy(counted, (m) => m.topics.map((t) => t.name)).slice(0, 6),
    organizations,
    history: items.map((m) => ({ id: m.id, code: m.code, title: m.title, status: m.status, scheduledStart: m.scheduledStart, subtitle: m.orgShortName ?? m.orgName })),
    dossier: await dossierFor(db, items, actor, now, `/documents?countryCode=${cca2}`),
  };
}

/* ------------------------------------- titles ------------------------------------- */

/** A country's name for a page title, without the dossier behind it. */
export async function countryName(db: Db, code: string): Promise<string | null> {
  const country = await makeReferenceRepo(db).country(code.toUpperCase());
  return country?.name ?? null;
}

/** An organization's displayed name for a page title, without the dossier behind it. */
export async function organizationName(db: Db, id: string): Promise<string | null> {
  const org = await makeDirectoryRepo(db).getOrganization(id);
  return org ? (org.shortName ?? org.name) : null;
}
