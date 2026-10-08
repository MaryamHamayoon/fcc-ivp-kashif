import { and, eq, ne } from "drizzle-orm";
import type { CandidateDateInput } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeActivitiesRepo } from "@/lib/db/repos/activities";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import { addBusinessDays } from "@/lib/domain/business-days";
import type { PolicyUser } from "@/lib/domain/policy";
import { requireMeeting } from "./access";
import { NotFoundError } from "./errors";
import { fmtDateTime } from "./format";

const DEFAULT_DURATION_MINUTES = 90;

async function loadCandidate(db: Db, candidateId: string) {
  const [row] = await db.select().from(s.meetingCandidateDates).where(eq(s.meetingCandidateDates.id, candidateId)).limit(1);
  if (!row) throw new NotFoundError("Candidate date");
  return row;
}

export async function proposeDate(db: Db, input: CandidateDateInput, actor: PolicyUser, now = new Date()): Promise<{ id: string }> {
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "meeting.update");
  const id = newId("cdt");
  await db.insert(s.meetingCandidateDates).values({ id, meetingId: meeting.id, start: input.start, end: input.end ?? null, proposedBy: input.proposedBy, status: "proposed", note: input.note ?? null, createdAt: now });
  const org = meeting.organizationId ? await db.query.organizations.findFirst({ where: eq(s.organizations.id, meeting.organizationId), columns: { name: true, shortName: true } }) : null;
  const fromFcc = input.proposedBy === "fcc";
  await makeActivitiesRepo(db).insert({
    id: newId("act"),
    meetingId: meeting.id,
    kind: "date_proposed",
    body: `${fromFcc ? "Proposed" : "Visitors proposed"} ${fmtDateTime(input.start)}${input.note ? ` — ${input.note}` : ""}.`,
    occurredAt: now,
    authorId: actor.id,
    waitingOn: fromFcc ? "visitor" : "none",
    waitingOnLabel: fromFcc ? `${org?.shortName ?? org?.name ?? "Visitors"} POC` : null,
    nextAction: fromFcc ? "Chase a reply on the proposed date" : null,
    nextActionDueAt: fromFcc ? addBusinessDays(now, 5) : null,
    createdAt: now,
  });
  await makeMeetingsRepo(db).touch(meeting.id, now);
  return { id };
}

export async function acceptDate(db: Db, candidateId: string, actor: PolicyUser, now = new Date()): Promise<void> {
  const candidate = await loadCandidate(db, candidateId);
  const { meeting } = await requireMeeting(db, candidate.meetingId, actor, "meeting.update");
  const end = candidate.end ?? new Date(candidate.start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
  // Only one accepted date at a time: any other accepted candidate goes back to proposed.
  await db
    .update(s.meetingCandidateDates)
    .set({ status: "proposed" })
    .where(and(eq(s.meetingCandidateDates.meetingId, meeting.id), eq(s.meetingCandidateDates.status, "accepted"), ne(s.meetingCandidateDates.id, candidateId)));
  await db.update(s.meetingCandidateDates).set({ status: "accepted" }).where(eq(s.meetingCandidateDates.id, candidateId));
  await makeMeetingsRepo(db).update(meeting.id, { scheduledStart: candidate.start, scheduledEnd: end }, now);
  const activities = makeActivitiesRepo(db);
  await activities.insert({ id: newId("act"), meetingId: meeting.id, kind: "date_confirmed", body: `${fmtDateTime(candidate.start)} accepted by both sides.`, occurredAt: now, authorId: actor.id, createdAt: now });
  await activities.resolveOpenWaits(meeting.id, "visitor", actor.id, now);
}

export async function declineDate(db: Db, candidateId: string, actor: PolicyUser, now = new Date(), note?: string): Promise<void> {
  const candidate = await loadCandidate(db, candidateId);
  const { meeting } = await requireMeeting(db, candidate.meetingId, actor, "meeting.update");
  await db.update(s.meetingCandidateDates).set({ status: "declined", note: note ?? candidate.note }).where(eq(s.meetingCandidateDates.id, candidateId));
  const meetings = makeMeetingsRepo(db);
  if (candidate.status === "accepted" && meeting.scheduledStart?.getTime() === candidate.start.getTime()) {
    await meetings.update(meeting.id, { scheduledStart: null, scheduledEnd: null }, now);
  } else {
    await meetings.touch(meeting.id, now);
  }
  await makeActivitiesRepo(db).insert({ id: newId("act"), meetingId: meeting.id, kind: "note", body: `${fmtDateTime(candidate.start)} declined${note ? ` — ${note}` : ""}.`, occurredAt: now, authorId: actor.id, createdAt: now });
}

export async function withdrawDate(db: Db, candidateId: string, actor: PolicyUser, now = new Date()): Promise<void> {
  const candidate = await loadCandidate(db, candidateId);
  const { meeting } = await requireMeeting(db, candidate.meetingId, actor, "meeting.update");
  await db.update(s.meetingCandidateDates).set({ status: "withdrawn" }).where(eq(s.meetingCandidateDates.id, candidateId));
  await makeMeetingsRepo(db).touch(meeting.id, now);
}
