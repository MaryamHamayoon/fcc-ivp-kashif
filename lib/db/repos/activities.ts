import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { ActivityFeedQueryInput, ActivityScope } from "@/lib/api/schemas";
import type { ReadableScope } from "@/lib/domain/policy";
import type { ActivityKind, MeetingStatus, WaitingOn } from "@/lib/domain/types";
import type { Db } from "../factory";
import * as s from "../schema";
import type { ActivityInsert } from "../types";

/** One line of the program-wide feed: the entry, who wrote it, and enough of its meeting to place it. */
export type ActivityFeedItem = {
  id: string;
  kind: ActivityKind;
  body: string;
  occurredAt: Date;
  authorId: string | null;
  authorName: string | null;
  waitingOn: WaitingOn;
  waitingOnLabel: string | null;
  nextAction: string | null;
  nextActionDueAt: Date | null;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  meetingId: string;
  meetingCode: string;
  meetingTitle: string;
  meetingStatus: MeetingStatus;
  /** The short form where the organization has one. */
  orgName: string;
  countryCode: string;
  countryName: string;
};

/** The filters a reader sets, without the paging, the scope tab or the time filters. */
export type ActivityFeedFilters = Pick<ActivityFeedQueryInput, "q" | "kind" | "waitingOn" | "authorId" | "regionId" | "fy" | "status">;

export type ActivityFeedWindow = { from?: Date; to?: Date };

const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

const OPEN_WAIT = and(ne(s.activities.waitingOn, "none"), isNull(s.activities.resolvedAt))!;

/** Everything but the scope tab: the filters, the reader's reach and, where given, a stretch of time. */
function feedWhere(db: Db, q: Partial<ActivityFeedFilters>, scope: ReadableScope, window: ActivityFeedWindow = {}): SQL | undefined {
  const conds: SQL[] = [];
  if (q.kind?.length) conds.push(inArray(s.activities.kind, [...q.kind]));
  if (q.waitingOn) conds.push(eq(s.activities.waitingOn, q.waitingOn));
  if (q.authorId) conds.push(eq(s.activities.authorId, q.authorId));
  if (window.from) conds.push(gte(s.activities.occurredAt, window.from));
  if (window.to) conds.push(lt(s.activities.occurredAt, window.to));

  const meetingConds: SQL[] = [];
  if (q.fy) meetingConds.push(eq(s.meetings.fiscalYear, q.fy));
  if (q.regionId) meetingConds.push(eq(s.meetings.regionId, q.regionId));
  if (q.status?.length) meetingConds.push(inArray(s.meetings.status, [...q.status]));
  if ("staffId" in scope) meetingConds.push(exists(db.select({ one: sql`1` }).from(s.meetingExperts).where(and(eq(s.meetingExperts.meetingId, s.meetings.id), eq(s.meetingExperts.staffId, scope.staffId)))));
  if (meetingConds.length) conds.push(inArray(s.activities.meetingId, db.select({ id: s.meetings.id }).from(s.meetings).where(and(...meetingConds))));

  if (q.q) {
    // What a coordinator remembers: what it said, which meeting, who came, or who logged it.
    const pattern = like(q.q);
    const organizations = db
      .select({ id: s.organizations.id })
      .from(s.organizations)
      .where(or(ilike(s.organizations.name, pattern), ilike(s.organizations.shortName, pattern)));
    const meetings = db
      .select({ id: s.meetings.id })
      .from(s.meetings)
      .where(or(ilike(s.meetings.code, pattern), ilike(s.meetings.title, pattern), inArray(s.meetings.organizationId, organizations)));
    const authors = db.select({ id: s.users.id }).from(s.users).where(ilike(s.users.name, pattern));
    conds.push(or(ilike(s.activities.body, pattern), inArray(s.activities.meetingId, meetings), inArray(s.activities.authorId, authors))!);
  }
  return conds.length ? and(...conds) : undefined;
}

function tabWhere(tab: ActivityScope, actorId: string): SQL | undefined {
  if (tab === "open") return OPEN_WAIT;
  if (tab === "mine") return eq(s.activities.authorId, actorId);
  return undefined;
}

export function makeActivitiesRepo(db: Db) {
  return {
    async insert(row: ActivityInsert): Promise<string> {
      await db.insert(s.activities).values(row);
      return row.id;
    },

    async get(id: string) {
      return db.query.activities.findFirst({ where: eq(s.activities.id, id), with: { author: true, meeting: true } });
    },

    async resolve(id: string, byUserId: string | null, at: Date): Promise<void> {
      await db.update(s.activities).set({ resolvedAt: at, resolvedById: byUserId }).where(eq(s.activities.id, id));
    },

    /** Resolve every open wait on a meeting for one party (optionally matching the label). */
    async resolveOpenWaits(meetingId: string, who: WaitingOn, byUserId: string | null, at: Date, label?: string): Promise<number> {
      const open = await db
        .select({ id: s.activities.id, label: s.activities.waitingOnLabel })
        .from(s.activities)
        .where(and(eq(s.activities.meetingId, meetingId), eq(s.activities.waitingOn, who), isNull(s.activities.resolvedAt)));
      const targets = open.filter((a) => !label || a.label === label);
      for (const a of targets) await this.resolve(a.id, byUserId, at);
      return targets.length;
    },

    listForMeeting(meetingId: string) {
      return db.query.activities.findMany({ where: eq(s.activities.meetingId, meetingId), with: { author: true, resolvedBy: true }, orderBy: (a, { desc }) => [desc(a.occurredAt), desc(a.seq)] });
    },

    /** One page of the program-wide feed, in SQL end to end so a long log never crosses the wire whole. */
    async feedPage(
      q: ActivityFeedFilters,
      scope: ReadableScope,
      opts: { tab: ActivityScope; actorId: string; window: ActivityFeedWindow; oldestFirst: boolean; limit: number; offset: number },
    ): Promise<ActivityFeedItem[]> {
      const rows = await db.query.activities.findMany({
        where: and(feedWhere(db, q, scope, opts.window), tabWhere(opts.tab, opts.actorId)),
        with: { author: true, resolvedBy: true, meeting: { with: { organization: true, primaryCountry: true } } },
        orderBy: opts.oldestFirst ? [asc(s.activities.occurredAt), asc(s.activities.seq)] : [desc(s.activities.occurredAt), desc(s.activities.seq)],
        limit: opts.limit,
        offset: opts.offset,
      });
      return rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        body: a.body,
        occurredAt: a.occurredAt,
        authorId: a.authorId,
        authorName: a.author?.name ?? null,
        waitingOn: a.waitingOn,
        waitingOnLabel: a.waitingOnLabel,
        nextAction: a.nextAction,
        nextActionDueAt: a.nextActionDueAt,
        resolvedAt: a.resolvedAt,
        resolvedByName: a.resolvedBy?.name ?? null,
        meetingId: a.meetingId,
        meetingCode: a.meeting.code,
        meetingTitle: a.meeting.title,
        meetingStatus: a.meeting.status,
        orgName: a.meeting.organization?.shortName ?? a.meeting.organization?.name ?? "—",
        countryCode: a.meeting.primaryCountryCode,
        countryName: a.meeting.primaryCountry?.name ?? a.meeting.primaryCountryCode,
      }));
    },

    /** What each scope tab holds under the same filters and time window: one pass, three counts. */
    async feedCounts(q: ActivityFeedFilters, scope: ReadableScope, opts: { actorId: string; window: ActivityFeedWindow }): Promise<Record<ActivityScope, number>> {
      const [row] = await db
        .select({
          all: sql<number>`cast(count(*) as int)`,
          open: sql<number>`cast(count(*) filter (where ${OPEN_WAIT}) as int)`,
          mine: sql<number>`cast(count(*) filter (where ${eq(s.activities.authorId, opts.actorId)}) as int)`,
        })
        .from(s.activities)
        .where(feedWhere(db, q, scope, opts.window));
      return { all: row?.all ?? 0, open: row?.open ?? 0, mine: row?.mine ?? 0 };
    },

    /** When each matching entry happened, from `since` on; the service buckets them into weeks. */
    async feedInstants(q: ActivityFeedFilters, scope: ReadableScope, opts: { tab: ActivityScope; actorId: string; since: Date }): Promise<Date[]> {
      const rows = await db
        .select({ at: s.activities.occurredAt })
        .from(s.activities)
        .where(and(feedWhere(db, q, scope, { from: opts.since }), tabWhere(opts.tab, opts.actorId)));
      return rows.map((r) => r.at);
    },

    /** Everyone who has written in the logs this scope can read, and the regions and years those logs span. */
    async feedFacets(scope: ReadableScope): Promise<{ authors: { id: string; name: string }[]; regionIds: string[]; fiscalYears: number[] }> {
      const where = feedWhere(db, {}, scope);
      const [authors, spans] = await Promise.all([
        db.selectDistinct({ id: s.users.id, name: s.users.name }).from(s.activities).innerJoin(s.users, eq(s.users.id, s.activities.authorId)).where(where),
        db.selectDistinct({ regionId: s.meetings.regionId, fiscalYear: s.meetings.fiscalYear }).from(s.activities).innerJoin(s.meetings, eq(s.meetings.id, s.activities.meetingId)).where(where),
      ]);
      return {
        authors,
        regionIds: [...new Set(spans.map((r) => r.regionId))],
        fiscalYears: [...new Set(spans.map((r) => r.fiscalYear))],
      };
    },
  };
}

export type ActivitiesRepo = ReturnType<typeof makeActivitiesRepo>;
