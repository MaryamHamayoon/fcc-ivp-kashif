import { eq } from "drizzle-orm";
import { ExpertInput, type ExpertInputRaw, type ExpertRespondInput } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeActivitiesRepo } from "@/lib/db/repos/activities";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import { addBusinessDays } from "@/lib/domain/business-days";
import type { PolicyUser } from "@/lib/domain/policy";
import { requireMeeting } from "./access";
import { NotFoundError, PolicyError, ValidationError } from "./errors";

async function loadAssignment(db: Db, meetingExpertId: string) {
  const row = await db.query.meetingExperts.findFirst({ where: eq(s.meetingExperts.id, meetingExpertId), with: { staff: true } });
  if (!row) throw new NotFoundError("Expert assignment");
  return row;
}

export async function addExpert(db: Db, raw: ExpertInputRaw, actor: PolicyUser, now = new Date()): Promise<{ id: string }> {
  const input = ExpertInput.parse(raw);
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "meeting.update");
  const [staff] = await db.select().from(s.staffDirectory).where(eq(s.staffDirectory.id, input.staffId)).limit(1);
  if (!staff) throw new NotFoundError("Staff member");
  const existing = await db.query.meetingExperts.findFirst({ where: (e, { and, eq }) => and(eq(e.meetingId, meeting.id), eq(e.staffId, staff.id)) });
  if (existing) throw new ValidationError(`${staff.name} is already on this meeting.`);
  const id = newId("exp");
  await db.insert(s.meetingExperts).values({ id, meetingId: meeting.id, staffId: staff.id, bureauCode: staff.bureauCode, role: input.role, status: "tbd", createdAt: now });
  await makeMeetingsRepo(db).touch(meeting.id, now);
  return { id };
}

export async function requestExpert(db: Db, meetingExpertId: string, actor: PolicyUser, now = new Date()): Promise<void> {
  const assignment = await loadAssignment(db, meetingExpertId);
  const { meeting } = await requireMeeting(db, assignment.meetingId, actor, "meeting.update");
  const topic = await db.query.meetingTopics.findFirst({ where: eq(s.meetingTopics.meetingId, meeting.id), with: { topic: true }, orderBy: (t, { asc }) => [asc(t.rank)] });
  await db.update(s.meetingExperts).set({ status: "requested", requestedAt: now, respondedAt: null }).where(eq(s.meetingExperts.id, meetingExpertId));
  await makeActivitiesRepo(db).insert({
    id: newId("act"),
    meetingId: meeting.id,
    kind: "expert_requested",
    body: `Requested ${assignment.staff.name}${assignment.bureauCode ? ` (${assignment.bureauCode})` : ""} to brief${topic ? ` on ${topic.topic.name}` : ""}.`,
    occurredAt: now,
    authorId: actor.id,
    waitingOn: "expert",
    waitingOnLabel: assignment.staff.name,
    nextAction: "Confirm briefer",
    nextActionDueAt: addBusinessDays(now, 5),
    createdAt: now,
  });
  await makeMeetingsRepo(db).touch(meeting.id, now);
}

export async function respondExpert(db: Db, input: ExpertRespondInput, actor: PolicyUser, now = new Date()): Promise<void> {
  const assignment = await loadAssignment(db, input.meetingExpertId);
  const { meeting } = await requireMeeting(db, assignment.meetingId, actor, "expert.respond");
  // An expert may only answer for themselves; coordinators and leads may record any answer.
  if (actor.role === "expert" && actor.staffId !== assignment.staffId) throw new PolicyError("You can only respond to your own assignment.");
  await db.update(s.meetingExperts).set({ status: input.status, respondedAt: now, note: input.note ?? null }).where(eq(s.meetingExperts.id, input.meetingExpertId));
  const activities = makeActivitiesRepo(db);
  await activities.insert({
    id: newId("act"),
    meetingId: meeting.id,
    kind: input.status === "confirmed" ? "expert_confirmed" : "expert_declined",
    body: `${assignment.staff.name} ${input.status === "confirmed" ? "confirmed" : "declined"}${input.note ? ` — ${input.note}` : ""}.`,
    occurredAt: now,
    authorId: actor.id,
    createdAt: now,
  });
  await activities.resolveOpenWaits(meeting.id, "expert", actor.id, now, assignment.staff.name);
  await makeMeetingsRepo(db).touch(meeting.id, now);
}

export async function removeExpert(db: Db, meetingExpertId: string, actor: PolicyUser, now = new Date()): Promise<void> {
  const assignment = await loadAssignment(db, meetingExpertId);
  const { meeting } = await requireMeeting(db, assignment.meetingId, actor, "meeting.update");
  await db.update(s.meetingExperts).set({ status: "withdrawn", respondedAt: now }).where(eq(s.meetingExperts.id, meetingExpertId));
  await makeActivitiesRepo(db).resolveOpenWaits(meeting.id, "expert", actor.id, now, assignment.staff.name);
  await makeMeetingsRepo(db).touch(meeting.id, now);
}
