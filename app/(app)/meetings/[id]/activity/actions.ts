"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActivityActionResult } from "@/components/meetings/record/activity-entries";
import { LogActivityInput } from "@/lib/api/schemas";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { logActivity, resolveActivity } from "@/lib/services/activities";
import { isAppError } from "@/lib/services/errors";

/** A server action is a public endpoint: never trust the shape the client sent. */
function firstMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "That entry could not be read.";
  const path = issue.path.join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

/**
 * The activity log feeds the waiting-on engine, so a new entry changes far more than this
 * page: the dashboard's attention rail and waiting-on tallies, the list's chips, the board.
 */
function revalidateMeeting(meetingId: string): void {
  revalidatePath(`/meetings/${meetingId}`, "layout");
  revalidatePath("/meetings");
  revalidatePath("/");
}

/** Writes one entry to the record's log. Refusals come back as values so the composer can keep the words. */
export async function logActivityAction(input: unknown): Promise<ActivityActionResult> {
  const user = await requireUser("/meetings");
  const parsed = LogActivityInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstMessage(parsed.error) };

  try {
    const { id } = await logActivity(await getDb(), parsed.data, toPolicyUser(user));
    revalidateMeeting(parsed.data.meetingId);
    return { ok: true, id };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    console.error("logActivityAction failed", error);
    return { ok: false, error: "The entry could not be saved. Try again, and tell us if it keeps failing." };
  }
}

const ResolveActivityInput = z.object({
  meetingId: z.string().min(1),
  activityId: z.string().min(1),
  /** Optional: what closed it out, logged as its own note against the entry it answers. */
  note: z.string().trim().min(1).max(2000).optional(),
});

/**
 * Stops the clock on a waiting entry, and — when the coordinator says what closed it — logs
 * that sentence as its own note so the log explains the silence rather than just ending it.
 *
 * `resolveActivity` is what validates the entry: it reads the activity's own meeting and
 * checks the actor against it, so a foreign `activityId` cannot ride in on a meeting the
 * actor happens to be allowed to write.
 */
export async function resolveActivityAction(input: unknown): Promise<ActivityActionResult> {
  const user = await requireUser("/meetings");
  const parsed = ResolveActivityInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstMessage(parsed.error) };
  const { meetingId, activityId, note } = parsed.data;

  try {
    const db = await getDb();
    const actor = toPolicyUser(user);
    await resolveActivity(db, activityId, actor);
    const id = note ? (await logActivity(db, { meetingId, kind: "note", body: note, waitingOn: "none" }, actor)).id : activityId;
    revalidateMeeting(meetingId);
    return { ok: true, id };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    console.error("resolveActivityAction failed", error);
    return { ok: false, error: "That entry could not be resolved. Try again, and tell us if it keeps failing." };
  }
}
