import { eq, sql } from "drizzle-orm";
import { AgendaItemInput, AgendaReorderInput, type AgendaItemInputRaw } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import type { PolicyUser } from "@/lib/domain/policy";
import { requireMeeting } from "./access";
import { NotFoundError, ValidationError } from "./errors";

/**
 * The run of show: timed blocks, each with a topic and the briefers who own it. Blocks are
 * drafted and re-drafted all week, so — unlike expert requests or dates — editing one does not
 * write to the activity log; the timeline stays a record of commitments, not of typing.
 */

async function loadItem(db: Db, itemId: string) {
  const [row] = await db.select().from(s.meetingAgendaItems).where(eq(s.meetingAgendaItems.id, itemId)).limit(1);
  if (!row) throw new NotFoundError("Agenda item");
  return row;
}

/** Briefers must already be on the meeting: the agenda names people, it does not recruit them. */
async function checkBriefers(db: Db, meetingId: string, staffIds: string[]): Promise<void> {
  if (staffIds.length === 0) return;
  const assigned = await db.select({ staffId: s.meetingExperts.staffId }).from(s.meetingExperts).where(eq(s.meetingExperts.meetingId, meetingId));
  const known = new Set(assigned.map((row) => row.staffId));
  const strangers = staffIds.filter((id) => !known.has(id));
  if (strangers.length > 0) throw new ValidationError("Add the briefer to the meeting on the People tab before putting them on the agenda.");
}

export async function upsertAgendaItem(db: Db, raw: AgendaItemInputRaw, actor: PolicyUser, now = new Date()): Promise<{ id: string }> {
  const input = AgendaItemInput.parse(raw);
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "meeting.update");
  const briefers = [...new Set(input.brieferStaffIds)];
  await checkBriefers(db, meeting.id, briefers);

  const fields = {
    title: input.title,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    topicId: input.topicId ?? null,
    brieferStaffIds: briefers,
    notes: input.notes ?? null,
  };

  if (input.id) {
    const item = await loadItem(db, input.id);
    if (item.meetingId !== meeting.id) throw new NotFoundError("Agenda item");
    await db.update(s.meetingAgendaItems).set(fields).where(eq(s.meetingAgendaItems.id, item.id));
    await makeMeetingsRepo(db).touch(meeting.id, now);
    return { id: item.id };
  }

  const [last] = await db
    .select({ max: sql<number | null>`max(${s.meetingAgendaItems.sortOrder})` })
    .from(s.meetingAgendaItems)
    .where(eq(s.meetingAgendaItems.meetingId, meeting.id));
  const id = newId("agi");
  await db.insert(s.meetingAgendaItems).values({ id, meetingId: meeting.id, sortOrder: (Number(last?.max ?? 0) || 0) + 1, ...fields });
  await makeMeetingsRepo(db).touch(meeting.id, now);
  return { id };
}

export async function deleteAgendaItem(db: Db, itemId: string, actor: PolicyUser, now = new Date()): Promise<void> {
  const item = await loadItem(db, itemId);
  const { meeting } = await requireMeeting(db, item.meetingId, actor, "meeting.update");
  await db.delete(s.meetingAgendaItems).where(eq(s.meetingAgendaItems.id, itemId));
  await makeMeetingsRepo(db).touch(meeting.id, now);
}

/** Renumbers the blocks in the order given; ids that are not on this meeting are ignored. */
export async function reorderAgendaItems(db: Db, raw: unknown, actor: PolicyUser, now = new Date()): Promise<void> {
  const input = AgendaReorderInput.parse(raw);
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "meeting.update");
  const rows = await db.select({ id: s.meetingAgendaItems.id }).from(s.meetingAgendaItems).where(eq(s.meetingAgendaItems.meetingId, meeting.id));
  const mine = new Set(rows.map((row) => row.id));
  let order = 0;
  for (const id of input.orderedIds) {
    if (!mine.has(id)) continue;
    order += 1;
    await db.update(s.meetingAgendaItems).set({ sortOrder: order }).where(eq(s.meetingAgendaItems.id, id));
  }
  await makeMeetingsRepo(db).touch(meeting.id, now);
}
