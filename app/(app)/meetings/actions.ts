"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { CreateMeetingResult } from "@/components/meetings/wizard/wizard-schema";
import { CreateMeetingInput, TransitionInput } from "@/lib/api/schemas";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { isAppError } from "@/lib/services/errors";
import { createMeeting, resumeMeeting, transitionMeeting, type TransitionOutcome } from "@/lib/services/meetings";

/** A server action is a public endpoint: never trust the shape the client sent. */
function firstMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "That request could not be read.";
  const path = issue.path.join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

/**
 * Files a new IVP request from the intake wizard.
 *
 * Validation problems come back as `{ ok: false }` rather than an exception so the
 * wizard can show them beside the form; the caller navigates to the new record.
 */
export async function createMeetingAction(input: unknown): Promise<CreateMeetingResult> {
  const user = await requireUser("/meetings/new");
  const parsed = CreateMeetingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstMessage(parsed.error) };

  try {
    const { id, code } = await createMeeting(await getDb(), parsed.data, toPolicyUser(user));
    revalidatePath("/meetings");
    return { ok: true, id, code };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    console.error("createMeetingAction failed", error);
    return { ok: false, error: "The request could not be saved. Try again, and tell us if it keeps failing." };
  }
}

/** Every surface that shows the meeting — dashboard, list, board, calendar and the record's tabs. */
function revalidateMeeting(meetingId: string): void {
  revalidatePath("/");
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${meetingId}`, "layout");
}

const TRANSITION_FAILED = "The status could not be changed. Try again, and tell us if it keeps failing.";

/**
 * Moves a meeting to another status — including onto hold or to cancelled — from the
 * board, the record header or a dialog. Guard failures (`{ ok: false, reason }`) are
 * expected outcomes the UI explains in place, so validation and access problems use
 * the same shape rather than throwing.
 */
export async function transitionAction(input: unknown): Promise<TransitionOutcome> {
  const user = await requireUser("/meetings");
  const parsed = TransitionInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: firstMessage(parsed.error) };

  try {
    const outcome = await transitionMeeting(await getDb(), parsed.data, toPolicyUser(user));
    if (outcome.ok) revalidateMeeting(parsed.data.meetingId);
    return outcome;
  } catch (error) {
    if (isAppError(error)) return { ok: false, reason: error.message };
    console.error("transitionAction failed", error);
    return { ok: false, reason: TRANSITION_FAILED };
  }
}

/** Takes a meeting off hold, back to the status it left. */
export async function resumeAction(meetingId: unknown): Promise<TransitionOutcome> {
  const user = await requireUser("/meetings");
  if (typeof meetingId !== "string" || meetingId === "") return { ok: false, reason: "Which meeting should be resumed?" };

  try {
    const outcome = await resumeMeeting(await getDb(), meetingId, toPolicyUser(user));
    if (outcome.ok) revalidateMeeting(meetingId);
    return outcome;
  } catch (error) {
    if (isAppError(error)) return { ok: false, reason: error.message };
    console.error("resumeAction failed", error);
    return { ok: false, reason: TRANSITION_FAILED };
  }
}
