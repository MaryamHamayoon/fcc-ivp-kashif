import { LogisticsInput, type LogisticsInputRaw } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeActivitiesRepo } from "@/lib/db/repos/activities";
import type { MeetingRow } from "@/lib/db/types";
import type { PolicyUser } from "@/lib/domain/policy";
import type { InterpreterMode } from "@/lib/domain/types";
import { requireMeeting } from "./access";
import { updateMeeting, type MeetingPatch } from "./meetings";

/**
 * Where the meeting happens and what it needs to work: room or link, A/V, interpretation,
 * accommodations and the local contact. Two of these feed the readiness ring (an in-person
 * meeting needs a room, a virtual one needs a link), so the log records what moved and the
 * ring recomputes itself — nothing about readiness is typed anywhere.
 */

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

const INTERPRETER_PHRASE: Record<InterpreterMode, string> = {
  none: "no interpretation",
  consecutive: "consecutive interpretation",
  simultaneous: "simultaneous interpretation",
};

/** Human phrases for exactly what changed — the log has to read like a sentence, not a diff. */
function describe(before: MeetingRow, patch: MeetingPatch): string[] {
  const notes: string[] = [];
  if ("location" in patch && patch.location !== before.location) notes.push(patch.location ? `room set to ${patch.location}` : "room cleared");
  if ("virtualLink" in patch && patch.virtualLink !== before.virtualLink) notes.push(patch.virtualLink ? "virtual link on file" : "virtual link cleared");
  if ("needsAv" in patch && patch.needsAv !== before.needsAv) notes.push(patch.needsAv ? "A/V requested" : "A/V no longer needed");
  if ("interpreter" in patch && patch.interpreter !== before.interpreter) notes.push(INTERPRETER_PHRASE[patch.interpreter as InterpreterMode]);
  if ("accommodations" in patch && patch.accommodations !== before.accommodations) notes.push(patch.accommodations ? "accommodations noted" : "accommodations cleared");
  if ("localContact" in patch && patch.localContact !== before.localContact) notes.push(patch.localContact ? `local contact ${patch.localContact}` : "local contact cleared");
  return notes;
}

/** Saves the logistics block. Returns the phrases logged, so a caller can echo them back. */
export async function updateLogistics(db: Db, raw: LogisticsInputRaw, actor: PolicyUser, now = new Date()): Promise<{ changed: string[] }> {
  const input = LogisticsInput.parse(raw);
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "meeting.update");

  const patch: MeetingPatch = {
    location: clean(input.location),
    virtualLink: clean(input.virtualLink),
    needsAv: input.needsAv,
    interpreter: input.interpreter,
    accommodations: clean(input.accommodations),
    localContact: clean(input.localContact),
  };

  const changed = describe(meeting, patch);
  if (changed.length === 0) return { changed };

  await updateMeeting(db, meeting.id, patch, actor, now);
  await makeActivitiesRepo(db).insert({
    id: newId("act"),
    meetingId: meeting.id,
    kind: "system",
    body: `Logistics updated — ${changed.join("; ")}.`,
    occurredAt: now,
    authorId: actor.id,
    createdAt: now,
  });
  return { changed };
}
