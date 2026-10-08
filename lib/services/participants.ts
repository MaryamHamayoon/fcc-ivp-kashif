import { and, eq } from "drizzle-orm";
import { ParticipantInput, ParticipantTotalsInput, type ParticipantInputRaw, type ParticipantTotalsInputRaw } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeActivitiesRepo } from "@/lib/db/repos/activities";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import type { PolicyUser } from "@/lib/domain/policy";
import { PARTICIPANT_CATEGORY_LABELS, type ParticipantCategory } from "@/lib/domain/types";
import { requireMeeting } from "./access";
import { NotFoundError } from "./errors";

/**
 * Who is in the room, kept two ways on purpose: named people (the roster a briefer reads before
 * walking in) and headcounts per category (the numbers the annual report asks for). Neither is
 * derived from the other — a delegation of twelve routinely sends four names — so both are
 * captured here and every tile, tally and readiness check reads them from these two tables.
 */

async function loadParticipant(db: Db, participantId: string) {
  const [row] = await db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.id, participantId)).limit(1);
  if (!row) throw new NotFoundError("Participant");
  return row;
}

/** Adds one named person. Foreign-government names inherit the requesting organization. */
export async function addParticipant(db: Db, raw: ParticipantInputRaw, actor: PolicyUser, now = new Date()): Promise<{ id: string }> {
  const input = ParticipantInput.parse(raw);
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "meeting.update");
  const id = newId("ppl");
  await db.insert(s.meetingParticipants).values({
    id,
    meetingId: meeting.id,
    name: input.name,
    title: input.title ?? null,
    organizationId: input.organizationId ?? (input.category === "foreign_gov" ? meeting.organizationId : null),
    contactId: null,
    category: input.category,
    isInterpreter: input.isInterpreter,
    attended: null,
  });
  await makeMeetingsRepo(db).touch(meeting.id, now);
  return { id };
}

export async function removeParticipant(db: Db, participantId: string, actor: PolicyUser, now = new Date()): Promise<void> {
  const participant = await loadParticipant(db, participantId);
  const { meeting } = await requireMeeting(db, participant.meetingId, actor, "meeting.update");
  await db.delete(s.meetingParticipants).where(eq(s.meetingParticipants.id, participantId));
  await makeMeetingsRepo(db).touch(meeting.id, now);
}

const sumOf = (rows: { planned: number; actual: number | null }[], field: "planned" | "actual") =>
  rows.reduce((total, row) => total + (field === "planned" ? row.planned : (row.actual ?? 0)), 0);

/**
 * Replaces the headcounts for the categories named in `input`, leaving any category the caller
 * did not send alone. Recording the actual turnout is the close-out step OIA is asked to defend,
 * so that one — and only that one — leaves a line in the activity log.
 */
export async function setParticipantTotals(db: Db, raw: ParticipantTotalsInputRaw, actor: PolicyUser, now = new Date()): Promise<void> {
  const input = ParticipantTotalsInput.parse(raw);
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "meeting.update");

  const before = await db.select().from(s.meetingParticipantTotals).where(eq(s.meetingParticipantTotals.meetingId, meeting.id));
  const existing = new Map<ParticipantCategory, (typeof before)[number]>(before.map((row) => [row.category, row]));

  for (const total of input.totals) {
    const row = existing.get(total.category);
    if (row) {
      await db
        .update(s.meetingParticipantTotals)
        .set({ planned: total.planned, actual: total.actual })
        .where(and(eq(s.meetingParticipantTotals.meetingId, meeting.id), eq(s.meetingParticipantTotals.category, total.category)));
    } else {
      await db.insert(s.meetingParticipantTotals).values({ id: newId("pct"), meetingId: meeting.id, category: total.category, planned: total.planned, actual: total.actual });
    }
  }

  const newlyCounted = input.totals.filter((t) => t.actual !== null && (existing.get(t.category)?.actual ?? null) === null);
  if (newlyCounted.length > 0) {
    const after = [...input.totals, ...before.filter((row) => !input.totals.some((t) => t.category === row.category))];
    const detail = newlyCounted.map((t) => `${PARTICIPANT_CATEGORY_LABELS[t.category]} ${t.actual}`).join(", ");
    await makeActivitiesRepo(db).insert({
      id: newId("act"),
      meetingId: meeting.id,
      kind: "system",
      body: `Attendance recorded — ${sumOf(after, "actual")} attended against ${sumOf(after, "planned")} planned (${detail}).`,
      occurredAt: now,
      authorId: actor.id,
      createdAt: now,
    });
  }
  await makeMeetingsRepo(db).touch(meeting.id, now);
}
