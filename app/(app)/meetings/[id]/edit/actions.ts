"use server";

import { revalidatePath } from "next/cache";
import { UpdateMeetingInput, type ActionResult } from "@/lib/api/schemas";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { editMeetingDetails } from "@/lib/services/edit";
import { isAppError } from "@/lib/services/errors";

const FAILED = "That could not be saved. Try again, and tell us if it keeps failing.";

/**
 * Saves the Edit page in one round trip: the scalar request/ownership fields, the ranked
 * topic list, and — for whichever of those actually changed — one system activity naming it,
 * all through `editMeetingDetails`. The service re-authorizes against "meeting.update" itself,
 * so a stale or forged `meetingId` costs nothing more than a wasted parse.
 */
export async function updateMeetingAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser("/meetings");
  const parsed = UpdateMeetingInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (!issue) return { ok: false, error: "That request could not be read." };
    const path = issue.path.join(".");
    return { ok: false, error: path === "" ? issue.message : `${path}: ${issue.message}` };
  }

  const { meetingId } = parsed.data;
  const actor = toPolicyUser(user);

  try {
    const db = await getDb();
    await editMeetingDetails(db, parsed.data, actor);
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    console.error("updateMeetingAction failed", error);
    return { ok: false, error: FAILED };
  }

  revalidatePath(`/meetings/${meetingId}`, "layout");
  revalidatePath("/meetings");
  revalidatePath("/");
  return { ok: true };
}
