import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { businessDaysBetween } from "@/lib/domain/business-days";
import type { Db } from "../factory";
import * as s from "../schema";

export type StaffFilters = { bureauCode?: string; q?: string; activeOnly?: boolean };

export type EngagementStats = {
  assignments: number;
  confirmed: number;
  declined: number;
  pending: number;
  /** Mean business days between request and response, over answered requests; null when none. */
  avgResponseBusinessDays: number | null;
  lastBriefedAt: Date | null;
};

const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

/** FCC staff directory (cached global address book), organizations and their contacts. */
export function makeDirectoryRepo(db: Db) {
  return {
    listStaff(filters: StaffFilters = {}) {
      const conds = [];
      if (filters.bureauCode) conds.push(eq(s.staffDirectory.bureauCode, filters.bureauCode));
      if (filters.activeOnly !== false) conds.push(eq(s.staffDirectory.active, true));
      if (filters.q) conds.push(or(ilike(s.staffDirectory.name, like(filters.q)), ilike(s.staffDirectory.email, like(filters.q)), ilike(s.staffDirectory.title, like(filters.q))));
      return db.query.staffDirectory.findMany({ where: conds.length ? and(...conds) : undefined, with: { bureau: true }, orderBy: (t, { asc }) => [asc(t.name)] });
    },

    getStaff(id: string) {
      return db.query.staffDirectory.findFirst({ where: eq(s.staffDirectory.id, id), with: { bureau: true } });
    },

    /** Topic names this person has briefed on (confirmed assignments), most frequent first. */
    async expertiseFor(staffId: string): Promise<{ topicId: string; name: string; count: number }[]> {
      const rows = await db
        .select({ topicId: s.topics.id, name: s.topics.name, count: count() })
        .from(s.meetingExperts)
        .innerJoin(s.meetingTopics, eq(s.meetingTopics.meetingId, s.meetingExperts.meetingId))
        .innerJoin(s.topics, eq(s.topics.id, s.meetingTopics.topicId))
        .where(and(eq(s.meetingExperts.staffId, staffId), eq(s.meetingExperts.status, "confirmed")))
        .groupBy(s.topics.id, s.topics.name)
        .orderBy(desc(count()), asc(s.topics.name));
      return rows.map((r) => ({ ...r, count: Number(r.count) }));
    },

    async engagementStats(staffId: string): Promise<EngagementStats> {
      const rows = await db
        .select({ status: s.meetingExperts.status, requestedAt: s.meetingExperts.requestedAt, respondedAt: s.meetingExperts.respondedAt, scheduledStart: s.meetings.scheduledStart, meetingStatus: s.meetings.status })
        .from(s.meetingExperts)
        .innerJoin(s.meetings, eq(s.meetings.id, s.meetingExperts.meetingId))
        .where(eq(s.meetingExperts.staffId, staffId));
      const answered = rows.filter((r) => r.requestedAt && r.respondedAt);
      const avg = answered.length ? answered.reduce((sum, r) => sum + businessDaysBetween(r.requestedAt!, r.respondedAt!), 0) / answered.length : null;
      const briefed = rows.filter((r) => r.status === "confirmed" && (r.meetingStatus === "completed" || r.meetingStatus === "closed") && r.scheduledStart).map((r) => r.scheduledStart!.getTime());
      return {
        assignments: rows.length,
        confirmed: rows.filter((r) => r.status === "confirmed").length,
        declined: rows.filter((r) => r.status === "declined").length,
        pending: rows.filter((r) => r.status === "requested" || r.status === "tbd").length,
        avgResponseBusinessDays: avg === null ? null : Math.round(avg * 10) / 10,
        lastBriefedAt: briefed.length ? new Date(Math.max(...briefed)) : null,
      };
    },

    /** Meetings this person is assigned to, newest first. */
    assignmentsFor(staffId: string) {
      return db.query.meetingExperts.findMany({
        where: eq(s.meetingExperts.staffId, staffId),
        with: { meeting: { with: { organization: true, primaryCountry: true } } },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    },

    async listOrganizations(q?: string) {
      const rows = await db
        .select({
          id: s.organizations.id,
          name: s.organizations.name,
          shortName: s.organizations.shortName,
          kind: s.organizations.kind,
          countryCode: s.organizations.countryCode,
          countryName: s.countries.name,
          regionId: s.countries.regionId,
          website: s.organizations.website,
          meetingCount: sql<number>`(select count(*)::int from ${s.meetings} m where m.organization_id = ${s.organizations.id})`,
          lastMeetingAt: sql<Date | null>`(select max(m.scheduled_start) from ${s.meetings} m where m.organization_id = ${s.organizations.id})`,
        })
        .from(s.organizations)
        .leftJoin(s.countries, eq(s.countries.cca2, s.organizations.countryCode))
        .where(q ? or(ilike(s.organizations.name, like(q)), ilike(s.organizations.shortName, like(q)), ilike(s.countries.name, like(q))) : undefined)
        .orderBy(asc(s.organizations.name));
      return rows.map((r) => ({ ...r, meetingCount: Number(r.meetingCount), lastMeetingAt: r.lastMeetingAt ? new Date(r.lastMeetingAt) : null }));
    },

    getOrganization(id: string) {
      return db.query.organizations.findFirst({
        where: eq(s.organizations.id, id),
        with: { country: true, contacts: { orderBy: (c, { asc }) => [asc(c.name)] }, meetings: { with: { primaryCountry: true }, orderBy: (m, { desc }) => [desc(m.requestedAt)] } },
      });
    },

    listContacts(organizationId?: string) {
      return db.query.contacts.findMany({ where: organizationId ? eq(s.contacts.organizationId, organizationId) : undefined, with: { organization: true }, orderBy: (c, { asc }) => [asc(c.name)] });
    },

    /** Bureaus with headcount, for the directory filter rail. */
    async bureausWithCounts() {
      const rows = await db
        .select({ code: s.bureaus.code, name: s.bureaus.name, kind: s.bureaus.kind, sortOrder: s.bureaus.sortOrder, staff: count(s.staffDirectory.id) })
        .from(s.bureaus)
        .leftJoin(s.staffDirectory, and(eq(s.staffDirectory.bureauCode, s.bureaus.code), eq(s.staffDirectory.active, true)))
        .groupBy(s.bureaus.code, s.bureaus.name, s.bureaus.kind, s.bureaus.sortOrder)
        .orderBy(asc(s.bureaus.sortOrder));
      return rows.map((r) => ({ ...r, staff: Number(r.staff) }));
    },

    /** The size of the active roster and of the organizations list. */
    async counts(): Promise<{ experts: number; organizations: number }> {
      const [[staff], [orgs]] = await Promise.all([db.select({ n: count() }).from(s.staffDirectory).where(eq(s.staffDirectory.active, true)), db.select({ n: count() }).from(s.organizations)]);
      return { experts: Number(staff?.n ?? 0), organizations: Number(orgs?.n ?? 0) };
    },

    /** Named staff with their bureau — a dossier's briefers. */
    staffByIds(ids: string[]) {
      return ids.length ? db.query.staffDirectory.findMany({ where: inArray(s.staffDirectory.id, ids), with: { bureau: true } }) : Promise.resolve([]);
    },
  };
}

export type DirectoryRepo = ReturnType<typeof makeDirectoryRepo>;
