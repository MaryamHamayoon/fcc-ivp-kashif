import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeActivitiesRepo } from "@/lib/db/repos/activities";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import type { PolicyUser } from "@/lib/domain/policy";
import { requireMeeting } from "./access";
import { ValidationError } from "./errors";

/**
 * The meeting's ranked topic list, as chosen from the Edit page. Position in the array becomes
 * `rank` (1-based) — there is no separate reorder call, unlike the agenda.
 *
 * A topic already on the meeting keeps its `detail` (the visitor's own question, entered from
 * the wizard or a prior edit); the Edit page only chooses which topics apply and in what order,
 * so a save-with-no-content-change never erases that free text. A newly added topic starts with
 * no detail — there is nowhere on this form to type one.
 */
export async function setMeetingTopics(db: Db, meetingId: string, topicIds: string[], actor: PolicyUser, now = new Date()): Promise<void> {
  const { meeting } = await requireMeeting(db, meetingId, actor, "meeting.update");

  const ids = [...new Set(topicIds)];
  const known = ids.length ? await db.select({ id: s.topics.id, name: s.topics.name }).from(s.topics).where(inArray(s.topics.id, ids)) : [];
  const nameById = new Map(known.map((t) => [t.id, t.name]));
  const missing = ids.filter((id) => !nameById.has(id));
  if (missing.length) throw new ValidationError(`Unknown topic: ${missing.join(", ")}`);

  const existing = await db
    .select({ topicId: s.meetingTopics.topicId, detail: s.meetingTopics.detail })
    .from(s.meetingTopics)
    .where(eq(s.meetingTopics.meetingId, meeting.id))
    .orderBy(s.meetingTopics.rank);
  const before = existing.map((row) => row.topicId);
  const unchanged = before.length === ids.length && before.every((topicId, i) => topicId === ids[i]);
  if (unchanged) return;

  const detailByTopic = new Map(existing.map((row) => [row.topicId, row.detail]));
  await db.delete(s.meetingTopics).where(eq(s.meetingTopics.meetingId, meeting.id));
  if (ids.length) {
    await db.insert(s.meetingTopics).values(ids.map((topicId, i) => ({ id: newId("mtp"), meetingId: meeting.id, topicId, rank: i + 1, detail: detailByTopic.get(topicId) ?? null })));
  }
  await makeMeetingsRepo(db).touch(meeting.id, now);

  const names = ids.map((id) => nameById.get(id) ?? id);
  await makeActivitiesRepo(db).insert({
    id: newId("act"),
    meetingId: meeting.id,
    kind: "system",
    body: `Topics updated — ${names.join(", ")}.`,
    occurredAt: now,
    authorId: actor.id,
    createdAt: now,
  });
}
