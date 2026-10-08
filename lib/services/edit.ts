import { inArray } from "drizzle-orm";
import { UpdateMeetingInput, type UpdateMeetingInputRaw } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeActivitiesRepo } from "@/lib/db/repos/activities";
import * as s from "@/lib/db/schema";
import type { MeetingRow } from "@/lib/db/types";
import type { PolicyUser } from "@/lib/domain/policy";
import { FORMAT_LABELS, PRIORITIES, PRIORITY_LABELS, type Priority } from "@/lib/domain/types";
import { requireMeeting } from "./access";
import { updateMeeting, type MeetingPatch } from "./meetings";
import { setMeetingTopics } from "./topics";

/**
 * Saves the Edit page in one call: the request essentials and ownership scalars (title,
 * purpose, format, OCH attendance, priority, delegation size, lead, coordinator), then the
 * ranked topic list. A scalar change is described in plain language and logged as one system
 * activity — mirroring `updateLogistics` — so a renamed meeting, a reassigned lead or a raised
 * priority shows up in the trail exactly the way logistics and topic edits already do. A
 * backup user reading the record's activity feed alone should be able to tell what moved and
 * when, without falling back to the audit table.
 */

/** `priority` is free text in the schema (no DB enum), so narrow it defensively before labeling it. */
const toPriority = (value: string): Priority => ((PRIORITIES as readonly string[]).includes(value) ? (value as Priority) : "normal");

/** Human phrases for exactly what changed, in a fixed, readable order. */
function describe(before: MeetingRow, input: UpdateMeetingInput, nameById: Map<string, string>): string[] {
  const notes: string[] = [];
  if (input.title !== before.title) notes.push("title changed");
  if (input.purpose !== (before.purpose ?? "")) notes.push("purpose revised");
  if (input.format !== before.format) notes.push(`format ${FORMAT_LABELS[before.format]} → ${FORMAT_LABELS[input.format]}`);
  if (input.ochAttending !== before.ochAttending) notes.push(input.ochAttending ? "OCH attending" : "OCH no longer attending");
  const beforePriority = toPriority(before.priority);
  if (input.priority !== beforePriority) notes.push(`priority ${PRIORITY_LABELS[beforePriority]} → ${PRIORITY_LABELS[input.priority]}`);
  if (input.delegationSize !== before.delegationSize) notes.push(before.delegationSize === null ? `delegation set to ${input.delegationSize}` : `delegation ${before.delegationSize} → ${input.delegationSize}`);

  const leadId = input.leadUserId ?? null;
  if (leadId !== before.leadUserId) notes.push(leadId ? `lead set to ${nameById.get(leadId) ?? leadId}` : "lead cleared");

  const coordinatorId = input.coordinatorUserId ?? null;
  if (coordinatorId !== before.coordinatorUserId) notes.push(coordinatorId ? `coordinator set to ${nameById.get(coordinatorId) ?? coordinatorId}` : "coordinator cleared");

  return notes;
}

export async function editMeetingDetails(db: Db, raw: UpdateMeetingInputRaw, actor: PolicyUser, now = new Date()): Promise<{ changed: string[] }> {
  const input = UpdateMeetingInput.parse(raw);
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "meeting.update");

  const leadId = input.leadUserId ?? null;
  const coordinatorId = input.coordinatorUserId ?? null;
  const idsToName = [...new Set([leadId !== meeting.leadUserId ? leadId : null, coordinatorId !== meeting.coordinatorUserId ? coordinatorId : null].filter((id): id is string => id !== null))];
  const nameRows = idsToName.length ? await db.query.users.findMany({ where: inArray(s.users.id, idsToName), columns: { id: true, name: true } }) : [];
  const nameById = new Map(nameRows.map((u) => [u.id, u.name]));

  const changed = describe(meeting, input, nameById);
  if (changed.length > 0) {
    const patch: MeetingPatch = {
      title: input.title,
      purpose: input.purpose,
      format: input.format,
      ochAttending: input.ochAttending,
      priority: input.priority,
      delegationSize: input.delegationSize,
      leadUserId: leadId,
      coordinatorUserId: coordinatorId,
    };
    await updateMeeting(db, meeting.id, patch, actor, now);
    await makeActivitiesRepo(db).insert({
      id: newId("act"),
      meetingId: meeting.id,
      kind: "system",
      body: `Details updated — ${changed.join("; ")}.`,
      occurredAt: now,
      authorId: actor.id,
      createdAt: now,
    });
  }

  await setMeetingTopics(db, meeting.id, input.topicIds, actor, now);
  return { changed };
}
