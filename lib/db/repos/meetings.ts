import { and, desc, eq, exists, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { MeetingListQueryInput } from "@/lib/api/schemas";
import type { AttentionMeeting } from "@/lib/domain/attention";
import type { ReadableScope } from "@/lib/domain/policy";
import { computeReadiness, type Readiness } from "@/lib/domain/readiness";
import { ACTIVE_STATUSES, MEETING_VIEWS, type MeetingView, PIPELINE_ORDER, VIEW_STATUSES } from "@/lib/domain/status-machine";
import type { ExpertRole, ExpertStatus, MeetingFormat, MeetingStatus } from "@/lib/domain/types";
import { computeWaitingOn, type WaitingState } from "@/lib/domain/waiting-on";
import type { Db } from "../factory";
import * as s from "../schema";
import type { CountryRow, MeetingInsert, MeetingRow } from "../types";

/* --------------------------------- types --------------------------------- */

export type MeetingListItem = {
  id: string;
  code: string;
  title: string;
  status: MeetingStatus;
  previousStatus: MeetingStatus | null;
  format: MeetingFormat;
  regionId: string;
  regionName: string;
  countryCode: string;
  countryName: string;
  countryCodes: string[];
  orgId: string | null;
  orgName: string;
  orgShortName: string | null;
  leadUserId: string | null;
  leadName: string | null;
  coordinatorName: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  /** Earliest still-open proposed date when nothing is accepted yet. */
  nextCandidate: Date | null;
  candidateDates: { id: string; start: Date; end: Date | null; status: string; proposedBy: string }[];
  topics: { id: string; name: string }[];
  experts: { id: string; staffId: string; name: string; bureauCode: string | null; status: ExpertStatus; role: ExpertRole }[];
  readiness: Readiness;
  waiting: WaitingState;
  ochAttending: boolean;
  priority: string;
  fiscalYear: number;
  delegationSize: number | null;
  participantTotal: number;
  holdFollowUpAt: Date | null;
  requestedAt: Date;
  updatedAt: Date;
};

export type MeetingHistoryItem = { id: string; code: string; title: string; scheduledStart: Date | null; status: MeetingStatus };

export type CalendarRange = { start: Date; end: Date };

export type StatusPatch = {
  holdReason?: string | null;
  holdFollowUpAt?: Date | null;
  cancelReason?: string | null;
  completedAt?: Date | null;
  closedAt?: Date | null;
};

/* ------------------------------- loaders --------------------------------- */

const openWaitColumns = { id: true, waitingOn: true, waitingOnLabel: true, occurredAt: true, resolvedAt: true, nextAction: true, nextActionDueAt: true } as const;

function loadForList(db: Db, where: SQL | undefined) {
  return db.query.meetings.findMany({
    where,
    with: {
      region: true,
      primaryCountry: true,
      organization: true,
      lead: true,
      coordinator: true,
      countries: { columns: { countryCode: true } },
      candidateDates: true,
      topics: { with: { topic: true } },
      experts: { with: { staff: true } },
      documents: { columns: { kind: true } },
      participants: { columns: { id: true } },
      participantTotals: { columns: { category: true, planned: true, actual: true } },
      activities: { where: (a, { and, ne, isNull }) => and(ne(a.waitingOn, "none"), isNull(a.resolvedAt)), columns: openWaitColumns },
    },
  });
}
type ListRow = Awaited<ReturnType<typeof loadForList>>[number];

function loadDetail(db: Db, where: SQL) {
  return db.query.meetings.findFirst({
    where,
    with: {
      region: true,
      primaryCountry: true,
      organization: true,
      requestor: true,
      lead: true,
      coordinator: true,
      countries: { with: { country: true } },
      candidateDates: { orderBy: (d, { asc }) => [asc(d.start)] },
      topics: { with: { topic: true }, orderBy: (t, { asc }) => [asc(t.rank)] },
      experts: { with: { staff: { with: { bureau: true } } }, orderBy: (e, { asc }) => [asc(e.createdAt)] },
      participants: { orderBy: (p, { asc }) => [asc(p.category), asc(p.name)] },
      participantTotals: true,
      documents: { with: { addedBy: true }, orderBy: (d, { desc }) => [desc(d.addedAt)] },
      agendaItems: { orderBy: (a, { asc }) => [asc(a.sortOrder)] },
      activities: { with: { author: true }, orderBy: (a, { desc }) => [desc(a.occurredAt), desc(a.seq)] },
    },
  });
}
type DetailRow = NonNullable<Awaited<ReturnType<typeof loadDetail>>>;

export type MeetingDetail = Omit<DetailRow, "countries"> & {
  countries: CountryRow[];
  readiness: Readiness;
  waiting: WaitingState;
  history: MeetingHistoryItem[];
};

/* ------------------------------- derivations ------------------------------ */

function readinessOf(m: { status: MeetingStatus; format: MeetingFormat; scheduledStart: Date | null; location: string | null; virtualLink: string | null; candidateDates: { status: string }[]; experts: { status: ExpertStatus }[]; documents: { kind: string }[]; participants: unknown[] }): Readiness {
  return computeReadiness({
    status: m.status,
    format: m.format,
    hasAcceptedDate: m.scheduledStart !== null || m.candidateDates.some((d) => d.status === "accepted"),
    experts: m.experts,
    documents: m.documents as { kind: (typeof s.documentKindEnum.enumValues)[number] }[],
    namedParticipants: m.participants.length,
    location: m.location,
    virtualLink: m.virtualLink,
  });
}

function waitingOf(activities: { id: string; waitingOn: (typeof s.waitingOnEnum.enumValues)[number]; waitingOnLabel: string | null; occurredAt: Date; resolvedAt: Date | null; nextAction: string | null; nextActionDueAt: Date | null }[], now: Date): WaitingState {
  return computeWaitingOn(activities, now);
}

function nextCandidateOf(m: { scheduledStart: Date | null; candidateDates: { start: Date; status: string }[] }): Date | null {
  if (m.scheduledStart) return null;
  const open = m.candidateDates.filter((d) => d.status === "proposed" || d.status === "accepted").map((d) => d.start.getTime());
  return open.length ? new Date(Math.min(...open)) : null;
}

export function toListItem(m: ListRow, now: Date): MeetingListItem {
  const waiting = waitingOf(m.activities, now);
  return {
    id: m.id,
    code: m.code,
    title: m.title,
    status: m.status,
    previousStatus: m.previousStatus,
    format: m.format,
    regionId: m.regionId,
    regionName: m.region.name,
    countryCode: m.primaryCountryCode,
    countryName: m.primaryCountry.name,
    countryCodes: [m.primaryCountryCode, ...m.countries.map((c) => c.countryCode).filter((c) => c !== m.primaryCountryCode)],
    orgId: m.organizationId,
    orgName: m.organization?.name ?? "—",
    orgShortName: m.organization?.shortName ?? null,
    leadUserId: m.leadUserId,
    leadName: m.lead?.name ?? null,
    coordinatorName: m.coordinator?.name ?? null,
    scheduledStart: m.scheduledStart,
    scheduledEnd: m.scheduledEnd,
    nextCandidate: nextCandidateOf(m),
    candidateDates: m.candidateDates.map((d) => ({ id: d.id, start: d.start, end: d.end, status: d.status, proposedBy: d.proposedBy })),
    topics: m.topics.map((t) => ({ id: t.topic.id, name: t.topic.name })),
    experts: m.experts.map((e) => ({ id: e.id, staffId: e.staffId, name: e.staff.name, bureauCode: e.bureauCode ?? e.staff.bureauCode, status: e.status, role: e.role })),
    readiness: readinessOf(m),
    waiting,
    ochAttending: m.ochAttending,
    priority: m.priority,
    fiscalYear: m.fiscalYear,
    delegationSize: m.delegationSize,
    participantTotal: m.participantTotals.reduce((sum, t) => sum + (t.actual ?? t.planned), 0),
    holdFollowUpAt: m.holdFollowUpAt,
    requestedAt: m.requestedAt,
    updatedAt: m.updatedAt,
  };
}

function toAttention(m: ListRow, now: Date): AttentionMeeting {
  return {
    id: m.id,
    code: m.code,
    title: m.title,
    orgName: m.organization?.shortName ?? m.organization?.name ?? "—",
    countryName: m.primaryCountry.name,
    leadName: m.lead?.name ?? null,
    status: m.status,
    scheduledStart: m.scheduledStart,
    requestedAt: m.requestedAt,
    holdFollowUpAt: m.holdFollowUpAt,
    updatedAt: m.updatedAt,
    readinessPercent: readinessOf(m).percent,
    expertsPending: m.experts.filter((e) => e.status === "requested" || e.status === "tbd").length,
    waiting: waitingOf(m.activities, now),
    actualCountsEntered: m.participantTotals.length > 0 && m.participantTotals.every((t) => t.actual !== null),
  };
}

/* --------------------------------- filters -------------------------------- */

const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

function buildWhere(db: Db, q: MeetingListQueryInput, scope: ReadableScope, now: Date): SQL | undefined {
  const sub = () => db;
  const conds: SQL[] = [];
  // A status filter narrows within the scope rather than replacing it. "Completed" under the
  // Active scope is therefore empty — which the toolbar avoids by widening the scope to All first.
  const admitted = VIEW_STATUSES[q.view];
  const statuses = q.status?.length ? (admitted ? q.status.filter((status) => admitted.includes(status)) : q.status) : admitted;
  if (statuses) conds.push(inArray(s.meetings.status, [...statuses]));
  if (q.view === "upcoming") conds.push(gte(s.meetings.scheduledStart, now));
  if (q.regionId) conds.push(eq(s.meetings.regionId, q.regionId));
  if (q.fy) conds.push(eq(s.meetings.fiscalYear, q.fy));
  if (q.format) conds.push(eq(s.meetings.format, q.format));
  if (q.leadUserId) conds.push(eq(s.meetings.leadUserId, q.leadUserId));
  if (q.och) conds.push(eq(s.meetings.ochAttending, true));
  if (q.countryCode) {
    const code = q.countryCode.toUpperCase();
    conds.push(
      or(
        eq(s.meetings.primaryCountryCode, code),
        exists(sub().select({ one: sql`1` }).from(s.meetingCountries).where(and(eq(s.meetingCountries.meetingId, s.meetings.id), eq(s.meetingCountries.countryCode, code)))),
      )!,
    );
  }
  if (q.bureauCode) conds.push(exists(sub().select({ one: sql`1` }).from(s.meetingExperts).where(and(eq(s.meetingExperts.meetingId, s.meetings.id), eq(s.meetingExperts.bureauCode, q.bureauCode)))));
  if (q.topicId) conds.push(exists(sub().select({ one: sql`1` }).from(s.meetingTopics).where(and(eq(s.meetingTopics.meetingId, s.meetings.id), eq(s.meetingTopics.topicId, q.topicId)))));
  if (q.q) {
    const pattern = like(q.q);
    conds.push(
      or(
        ilike(s.meetings.title, pattern),
        ilike(s.meetings.code, pattern),
        inArray(s.meetings.organizationId, sub().select({ id: s.organizations.id }).from(s.organizations).where(or(ilike(s.organizations.name, pattern), ilike(s.organizations.shortName, pattern)))),
        inArray(s.meetings.primaryCountryCode, sub().select({ cca2: s.countries.cca2 }).from(s.countries).where(ilike(s.countries.name, pattern))),
      )!,
    );
  }
  if ("staffId" in scope) conds.push(exists(sub().select({ one: sql`1` }).from(s.meetingExperts).where(and(eq(s.meetingExperts.meetingId, s.meetings.id), eq(s.meetingExperts.staffId, scope.staffId)))));
  return conds.length ? and(...conds) : undefined;
}

const STATUS_ORDER: MeetingStatus[] = [...PIPELINE_ORDER, "on_hold", "cancelled"];
const STATUS_RANK = new Map<MeetingStatus, number>(STATUS_ORDER.map((st, i) => [st, i]));

/**
 * "Date" buckets on whether the accepted date is still ahead of `now`, ascending within each
 * bucket: upcoming meetings lead (soonest first), then meetings whose accepted date has already
 * lapsed (an on-hold meeting nobody rescheduled, say) trail behind every upcoming one — most
 * recently lapsed first, since that is the one most likely to need attention — and meetings with
 * no accepted date sort last of all (by their earliest still-open proposed date, if any).
 */
function compareByDateAscending(a: MeetingListItem, b: MeetingListItem, now: Date): number {
  const sa = a.scheduledStart;
  const sb = b.scheduledStart;
  const bucketOf = (s: Date | null) => (s ? (s.getTime() >= now.getTime() ? 0 : 1) : 2);
  const ba = bucketOf(sa);
  const bb = bucketOf(sb);
  if (ba !== bb) return ba - bb;
  if (sa && sb) return ba === 0 ? sa.getTime() - sb.getTime() : sb.getTime() - sa.getTime();
  const na = a.nextCandidate;
  const nb = b.nextCandidate;
  if (na && nb) return na.getTime() - nb.getTime();
  if (na || nb) return na ? -1 : 1; // undated-undated always last, whatever the direction
  return 0;
}

function sortItems(items: MeetingListItem[], sort: MeetingListQueryInput["sort"], dir: MeetingListQueryInput["dir"], now: Date): MeetingListItem[] {
  if (sort === "date") {
    // The bucket scheme only makes sense read forwards, so build it ascending and, for `desc`,
    // reverse the finished order rather than mirroring the buckets themselves.
    const ascending = [...items].sort((a, b) => {
      const c = compareByDateAscending(a, b, now);
      return c !== 0 ? c : a.code.localeCompare(b.code);
    });
    return dir === "desc" ? ascending.reverse() : ascending;
  }
  const sign = dir === "desc" ? -1 : 1;
  const cmpNum = (a: number, b: number) => (a - b) * sign;
  return [...items].sort((a, b) => {
    let c = 0;
    switch (sort) {
      case "updated":
        c = cmpNum(a.updatedAt.getTime(), b.updatedAt.getTime());
        break;
      case "country":
        c = a.countryName.localeCompare(b.countryName, "en") * sign;
        break;
      case "status":
        c = cmpNum(STATUS_RANK.get(a.status) ?? 99, STATUS_RANK.get(b.status) ?? 99);
        break;
      case "readiness":
        c = cmpNum(a.readiness.percent, b.readiness.percent);
        break;
    }
    return c !== 0 ? c : a.code.localeCompare(b.code);
  });
}

/* ---------------------------------- repo ---------------------------------- */

/** The waiting-on filter runs in memory: the state is derived, not stored. */
function applyWaiting(items: MeetingListItem[], waiting: MeetingListQueryInput["waiting"]): MeetingListItem[] {
  if (!waiting) return items;
  return items.filter((m) => (waiting === "none" ? m.waiting === null : m.waiting?.who === waiting));
}

/** Whether a row belongs to a scope — the in-memory twin of what `buildWhere` asks SQL. */
export function inView(m: { status: MeetingStatus; scheduledStart: Date | null }, view: MeetingView, now: Date): boolean {
  const admitted = VIEW_STATUSES[view];
  if (admitted && !admitted.includes(m.status)) return false;
  if (view === "upcoming" && !(m.scheduledStart && m.scheduledStart.getTime() >= now.getTime())) return false;
  return true;
}

export function makeMeetingsRepo(db: Db) {
  async function list(q: MeetingListQueryInput, scope: ReadableScope, now: Date): Promise<{ items: MeetingListItem[]; total: number }> {
    const rows = await loadForList(db, buildWhere(db, q, scope, now));
    const items = applyWaiting(rows.map((m) => toListItem(m, now)), q.waiting);
    // Readiness and waiting state are derived in memory, so sorting and paging happen here too.
    // The program sees a few hundred meetings a year; revisit with SQL paging if that changes.
    const sorted = sortItems(items, q.sort, q.dir, now);
    const start = (q.page - 1) * q.pageSize;
    return { items: sorted.slice(start, start + q.pageSize), total: sorted.length };
  }

  /** Every scope's total under the query's other filters: one load, then each scope applied in memory. */
  async function countByView(q: MeetingListQueryInput, scope: ReadableScope, now: Date): Promise<Record<MeetingView, number>> {
    const rows = await loadForList(db, buildWhere(db, { ...q, view: "all" }, scope, now));
    const items = applyWaiting(rows.map((m) => toListItem(m, now)), q.waiting);
    const counts = Object.fromEntries(MEETING_VIEWS.map((view) => [view, 0])) as Record<MeetingView, number>;
    for (const m of items) for (const view of MEETING_VIEWS) if (inView(m, view, now)) counts[view] += 1;
    return counts;
  }

  async function hydrate(row: DetailRow, now: Date): Promise<MeetingDetail> {
    const history = row.organizationId
      ? await db
          .select({ id: s.meetings.id, code: s.meetings.code, title: s.meetings.title, scheduledStart: s.meetings.scheduledStart, status: s.meetings.status })
          .from(s.meetings)
          .where(and(eq(s.meetings.organizationId, row.organizationId), ne(s.meetings.id, row.id)))
          .orderBy(desc(s.meetings.requestedAt))
          .limit(8)
      : [];
    return {
      ...row,
      countries: [row.primaryCountry, ...row.countries.map((c) => c.country).filter((c) => c.cca2 !== row.primaryCountryCode)],
      readiness: readinessOf(row),
      waiting: waitingOf(row.activities.filter((a) => a.waitingOn !== "none" && a.resolvedAt === null), now),
      history,
    };
  }

  return {
    list,
    countByView,

    async get(id: string, now = new Date()): Promise<MeetingDetail | null> {
      const row = await loadDetail(db, eq(s.meetings.id, id));
      return row ? hydrate(row, now) : null;
    },

    async getByCode(code: string, now = new Date()): Promise<MeetingDetail | null> {
      const row = await loadDetail(db, eq(s.meetings.code, code.toUpperCase()));
      return row ? hydrate(row, now) : null;
    },

    async row(id: string): Promise<MeetingRow | null> {
      const [m] = await db.select().from(s.meetings).where(eq(s.meetings.id, id)).limit(1);
      return m ?? null;
    },

    async nextSequence(fy: number): Promise<number> {
      const [r] = await db.select({ max: sql<number | null>`max(${s.meetings.sequence})` }).from(s.meetings).where(eq(s.meetings.fiscalYear, fy));
      return (Number(r?.max ?? 0) || 0) + 1;
    },

    async insert(row: MeetingInsert): Promise<string> {
      await db.insert(s.meetings).values(row);
      return row.id;
    },

    async update(id: string, patch: Partial<MeetingInsert>, now = new Date()): Promise<void> {
      await db.update(s.meetings).set({ ...patch, updatedAt: now }).where(eq(s.meetings.id, id));
    },

    async touch(id: string, now = new Date()): Promise<void> {
      await db.update(s.meetings).set({ updatedAt: now }).where(eq(s.meetings.id, id));
    },

    async setStatus(id: string, status: MeetingStatus, previousStatus: MeetingStatus | null, extra: StatusPatch = {}, now = new Date()): Promise<void> {
      await db
        .update(s.meetings)
        .set({
          status,
          previousStatus,
          holdReason: extra.holdReason ?? null,
          holdFollowUpAt: extra.holdFollowUpAt ?? null,
          cancelReason: extra.cancelReason ?? null,
          ...(extra.completedAt !== undefined ? { completedAt: extra.completedAt } : {}),
          ...(extra.closedAt !== undefined ? { closedAt: extra.closedAt } : {}),
          updatedAt: now,
        })
        .where(eq(s.meetings.id, id));
    },

    async forAttention(now: Date): Promise<AttentionMeeting[]> {
      const rows = await loadForList(db, or(inArray(s.meetings.status, [...ACTIVE_STATUSES]), eq(s.meetings.status, "completed")));
      return rows.map((m) => toAttention(m, now));
    },

    /** Meetings scheduled (or, when undated, proposed) inside the range. */
    async forCalendar(range: CalendarRange, now = new Date()): Promise<MeetingListItem[]> {
      const rows = await loadForList(
        db,
        and(
          ne(s.meetings.status, "cancelled"),
          or(
            and(gte(s.meetings.scheduledStart, range.start), lte(s.meetings.scheduledStart, range.end)),
            and(
              isNull(s.meetings.scheduledStart),
              exists(
                db
                  .select({ one: sql`1` })
                  .from(s.meetingCandidateDates)
                  .where(and(eq(s.meetingCandidateDates.meetingId, s.meetings.id), eq(s.meetingCandidateDates.status, "proposed"), gte(s.meetingCandidateDates.start, range.start), lte(s.meetingCandidateDates.start, range.end))),
              ),
            ),
          ),
        ),
      );
      return rows
        .map((m) => toListItem(m, now))
        .filter((m) => {
          const when = m.scheduledStart ?? m.nextCandidate;
          return when !== null && when.getTime() >= range.start.getTime() && when.getTime() <= range.end.getTime();
        })
        .sort((a, b) => (a.scheduledStart ?? a.nextCandidate)!.getTime() - (b.scheduledStart ?? b.nextCandidate)!.getTime());
    },

    /** Every meeting, any year, that a country took part in or an organization sent — a dossier's history, newest first. */
    async forHistory(subject: { countryCode?: string; orgId?: string }, now = new Date()): Promise<MeetingListItem[]> {
      const conditions: (SQL | undefined)[] = [];
      if (subject.countryCode) {
        conditions.push(
          or(
            eq(s.meetings.primaryCountryCode, subject.countryCode),
            exists(
              db
                .select({ one: sql`1` })
                .from(s.meetingCountries)
                .where(and(eq(s.meetingCountries.meetingId, s.meetings.id), eq(s.meetingCountries.countryCode, subject.countryCode))),
            ),
          ),
        );
      }
      if (subject.orgId) conditions.push(eq(s.meetings.organizationId, subject.orgId));
      if (conditions.length === 0) return [];
      const rows = await loadForList(db, and(...conditions));
      const when = (m: MeetingListItem) => m.scheduledStart?.getTime() ?? Number.NEGATIVE_INFINITY;
      return rows.map((m) => toListItem(m, now)).sort((a, b) => when(b) - when(a));
    },

    /** Everything for a fiscal year (tallies, map, analytics) as list items. */
    async forFiscalYear(fy: number, now = new Date()): Promise<MeetingListItem[]> {
      const rows = await loadForList(db, eq(s.meetings.fiscalYear, fy));
      return rows.map((m) => toListItem(m, now));
    },

    async forStatuses(statuses: readonly MeetingStatus[], now = new Date()): Promise<MeetingListItem[]> {
      const rows = await loadForList(db, inArray(s.meetings.status, [...statuses]));
      return rows.map((m) => toListItem(m, now));
    },

    /** Every meeting the reader may see, in any year and any state: the Global reach map's whole history. */
    async forReach(scope: ReadableScope, now: Date): Promise<MeetingListItem[]> {
      const mine = "staffId" in scope ? exists(db.select({ one: sql`1` }).from(s.meetingExperts).where(and(eq(s.meetingExperts.meetingId, s.meetings.id), eq(s.meetingExperts.staffId, scope.staffId)))) : undefined;
      const rows = await loadForList(db, mine);
      return rows.map((m) => toListItem(m, now));
    },

    /** One load for the dashboard: the given fiscal years plus everything still in play or awaiting close-out. */
    async forDashboard(fys: readonly number[], now: Date): Promise<{ items: MeetingListItem[] }> {
      const rows = await loadForList(db, or(inArray(s.meetings.fiscalYear, [...fys]), inArray(s.meetings.status, [...ACTIVE_STATUSES]), eq(s.meetings.status, "completed")));
      return { items: rows.map((m) => toListItem(m, now)) };
    },
  };
}

export type MeetingsRepo = ReturnType<typeof makeMeetingsRepo>;
