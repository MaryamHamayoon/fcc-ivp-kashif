import { LogActivityInput, type LogActivityInputRaw } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeActivitiesRepo } from "@/lib/db/repos/activities";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import type { PolicyUser } from "@/lib/domain/policy";
import { requireMeeting } from "./access";
import { NotFoundError } from "./errors";

export async function logActivity(db: Db, raw: LogActivityInputRaw, actor: PolicyUser, now = new Date()): Promise<{ id: string }> {
  const input = LogActivityInput.parse(raw);
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "activity.create");
  const activities = makeActivitiesRepo(db);
  const id = newId("act");
  const occurredAt = input.occurredAt ?? now;
  await activities.insert({
    id,
    meetingId: meeting.id,
    kind: input.kind,
    body: input.body,
    occurredAt,
    authorId: actor.id,
    waitingOn: input.waitingOn,
    waitingOnLabel: input.waitingOn === "none" ? null : (input.waitingOnLabel ?? null),
    nextAction: input.nextAction ?? null,
    nextActionDueAt: input.nextActionDueAt ?? null,
    createdAt: now,
  });
  if (input.resolvesActivityId) await activities.resolve(input.resolvesActivityId, actor.id, occurredAt);
  await makeMeetingsRepo(db).touch(meeting.id, now);
  return { id };
}

export async function resolveActivity(db: Db, activityId: string, actor: PolicyUser, now = new Date()): Promise<void> {
  const activities = makeActivitiesRepo(db);
  const activity = await activities.get(activityId);
  if (!activity) throw new NotFoundError("Activity");
  await requireMeeting(db, activity.meetingId, actor, "activity.create");
  await activities.resolve(activityId, actor.id, now);
  await makeMeetingsRepo(db).touch(activity.meetingId, now);
}
