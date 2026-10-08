import { MeetingListQuery, type MeetingView } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import { type PolicyUser, readableScope } from "@/lib/domain/policy";

/**
 * The two tallies the rail's Meetings group carries. They are asked of the very query the rows
 * link to — same view, same scope, same clock — so the pill can never disagree with the page it
 * opens. An expert sees only the briefings they are on, because `readableScope` says so.
 */
export type MeetingNavCounts = { active: number; upcoming: number };

/** The list is paged in memory, so the smallest page the schema allows still yields the true total. */
const SMALLEST_PAGE = 10;

const queryFor = (view: MeetingView) => MeetingListQuery.parse({ view, page: 1, pageSize: SMALLEST_PAGE });

export async function navCounts(db: Db, user: PolicyUser, now: Date = new Date()): Promise<MeetingNavCounts> {
  const repo = makeMeetingsRepo(db);
  const scope = readableScope(user);
  const [active, upcoming] = await Promise.all([repo.list(queryFor("active"), scope, now), repo.list(queryFor("upcoming"), scope, now)]);
  return { active: active.total, upcoming: upcoming.total };
}
