import type { ActivityFeedQueryInput } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { type ActivityFeedItem, makeActivitiesRepo } from "@/lib/db/repos/activities";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { bucketByWeek, type PulseWeek, pulseWeeks, sinceFor, weekRange } from "@/lib/domain/activity-feed";
import { can, type PolicyUser, readableScope, type ReadableScope } from "@/lib/domain/policy";
import { ACTIVITY_KIND_LABELS, ACTIVITY_KINDS, type ActivityKind, MEETING_STATUSES, type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import { PolicyError } from "./errors";

export type { ActivityFeedItem };

/**
 * The program-wide activity feed: every entry on every meeting's log, in one place, for the
 * reader who wants to know what has been happening rather than what is happening on one visit.
 * Experts see the logs of their own briefings; everyone else with `meeting.read` sees them all.
 */

/** Half a year of weeks: enough to show the program's rhythm, few enough to read as bars. */
export const PULSE_WEEKS = 26;

export type ActivityFeed = {
  items: ActivityFeedItem[];
  total: number;
  /** What each scope tab would show under the filters in force. */
  counts: { all: number; open: number; mine: number };
  /** Entries per week under the same filters, the time filters aside; oldest first. */
  pulse: PulseWeek[];
};

export type ActivityFilterOptions = {
  kinds: { value: ActivityKind; label: string }[];
  statuses: { value: MeetingStatus; label: string }[];
  /** Only people, regions and years that appear in the logs this reader can see. */
  authors: { id: string; name: string }[];
  regions: { id: string; name: string }[];
  /** Newest first. */
  fiscalYears: number[];
};

function scopeFor(actor: PolicyUser): ReadableScope {
  if (!can(actor, "meeting.read", { kind: "system" }) && actor.role !== "expert") throw new PolicyError();
  const scope = readableScope(actor);
  // An expert without a staff record can be assigned to nothing; say so rather than show an empty room.
  if ("staffId" in scope && !scope.staffId) throw new PolicyError();
  return scope;
}

export async function listActivity(db: Db, query: ActivityFeedQueryInput, actor: PolicyUser, now: Date = new Date()): Promise<ActivityFeed> {
  const scope = scopeFor(actor);
  const repo = makeActivitiesRepo(db);

  // A picked week is the narrower of the two time filters, so it wins where both are set.
  const window = query.week ? { from: weekRange(query.week).start, to: weekRange(query.week).end } : query.when ? { from: sinceFor(query.when, now) } : {};
  const weeks = pulseWeeks(now, PULSE_WEEKS);
  const since = weekRange(weeks[0] ?? query.week ?? "1970-01-05").start;

  const [items, counts, instants] = await Promise.all([
    repo.feedPage(query, scope, { tab: query.scope, actorId: actor.id, window, oldestFirst: query.sort === "oldest", limit: query.pageSize, offset: (query.page - 1) * query.pageSize }),
    repo.feedCounts(query, scope, { actorId: actor.id, window }),
    repo.feedInstants(query, scope, { tab: query.scope, actorId: actor.id, since }),
  ]);

  return { items, total: counts[query.scope], counts, pulse: bucketByWeek(instants, weeks) };
}

export async function activityOptions(db: Db, actor: PolicyUser): Promise<ActivityFilterOptions> {
  const scope = scopeFor(actor);
  const [facets, regions] = await Promise.all([makeActivitiesRepo(db).feedFacets(scope), makeReferenceRepo(db).regions()]);
  const regionIds = new Set(facets.regionIds);

  return {
    kinds: ACTIVITY_KINDS.map((value) => ({ value, label: ACTIVITY_KIND_LABELS[value] })),
    statuses: MEETING_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
    authors: [...facets.authors].sort((a, b) => a.name.localeCompare(b.name, "en")),
    regions: regions.filter((r) => regionIds.has(r.id)).map((r) => ({ id: r.id, name: r.name })),
    fiscalYears: [...facets.fiscalYears].sort((a, b) => b - a),
  };
}
