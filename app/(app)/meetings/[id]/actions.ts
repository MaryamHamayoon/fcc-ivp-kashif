"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  AddressBookQuery,
  AgendaItemInput,
  CandidateDateInput,
  DeclineDateInput,
  DocumentInput,
  DocumentReusableInput,
  ExpertInput,
  ExpertRespondActionInput,
  LogisticsInput,
  MeetingChildRef,
  ParticipantInput,
  ParticipantTotalsInput,
  ReuseInput,
  UploadFields,
  type ActionResult,
  type ActionResultWith,
} from "@/lib/api/schemas";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import type { Db } from "@/lib/db/factory";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import { can, type PolicyUser } from "@/lib/domain/policy";
import { getIntegrations, type AddressBookEntry } from "@/lib/integrations";
import { deleteAgendaItem, upsertAgendaItem } from "@/lib/services/agenda";
import { acceptDate, declineDate, proposeDate } from "@/lib/services/dates";
import { addDocument, removeDocument, reuseDocument, toggleReusable, uploadDocument } from "@/lib/services/documents";
import { isAppError } from "@/lib/services/errors";
import { addExpert, removeExpert, requestExpert, respondExpert } from "@/lib/services/experts";
import { updateLogistics } from "@/lib/services/logistics";
import { addParticipant, removeParticipant, setParticipantTotals } from "@/lib/services/participants";

/**
 * Every mutation the People, Schedule, Agenda and Documents tabs can make.
 *
 * A server action is a public endpoint, so each one re-reads the session, parses the payload it
 * was handed as `unknown`, and lets the service (not the caller) decide whether this user may
 * do it. Failures come back as values — the tab renders them beside the control that caused
 * them — and every success revalidates the record's layout so the readiness ring, the tab
 * counts and the rail all agree with what just happened.
 */

function firstMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "That request could not be read.";
  const path = issue.path.join(".");
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

/** The record's own pages; `layout` so the header, tabs and rail rerender with the body. */
function revalidateRecord(meetingId: string): void {
  revalidatePath(`/meetings/${meetingId}`, "layout");
}

/** Anything that moves readiness, waiting-on or a headcount also moves the list and dashboard. */
function revalidateEverywhere(meetingId: string): void {
  revalidateRecord(meetingId);
  revalidatePath("/meetings");
  revalidatePath("/");
}

/** A document landing or leaving changes the record, the list and the library alike. */
function revalidateDocuments(meetingId: string): void {
  revalidateEverywhere(meetingId);
  revalidatePath("/documents");
}

const FAILED = "That could not be saved. Try again, and tell us if it keeps failing.";

/**
 * Parse → act → revalidate, with both failure modes turned into `{ ok: false, error }`.
 *
 * The `meetingId` in the payload only chooses which cache entries to drop: every service
 * re-reads the meeting from the child row it was given and authorizes against that, so a
 * mismatched id costs a wasted revalidation and nothing else.
 */
async function run<S extends z.ZodType, T extends object>(
  schema: S,
  input: unknown,
  act: (data: z.output<S>, actor: PolicyUser, db: Db) => Promise<T>,
  revalidate: (data: z.output<S>) => void,
  label: string,
): Promise<ActionResultWith<T>> {
  const user = await requireUser("/meetings");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstMessage(parsed.error) };

  try {
    const result = await act(parsed.data, toPolicyUser(user), await getDb());
    revalidate(parsed.data);
    return Object.assign({ ok: true as const }, result);
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    console.error(`${label} failed`, error);
    return { ok: false, error: FAILED };
  }
}

/* --------------------------------- people --------------------------------- */

/** Puts an FCC expert on the meeting (status "to be determined" until they are asked). */
export async function addExpertAction(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  return run(ExpertInput, input, (data, actor, db) => addExpert(db, data, actor), (d) => revalidateEverywhere(d.meetingId), "addExpertAction");
}

/** Sends the briefing request and starts the "waiting on expert" clock. */
export async function requestExpertAction(input: unknown): Promise<ActionResult> {
  return run(MeetingChildRef, input, async (data, actor, db) => {
    await requestExpert(db, data.id, actor);
    return {};
  }, (d) => revalidateEverywhere(d.meetingId), "requestExpertAction");
}

/** Records the expert's answer — by them, or by a coordinator on their behalf. */
export async function respondExpertAction(input: unknown): Promise<ActionResult> {
  return run(ExpertRespondActionInput, input, async (data, actor, db) => {
    await respondExpert(db, data, actor);
    return {};
  }, (d) => revalidateEverywhere(d.meetingId), "respondExpertAction");
}

/** Takes an expert off the meeting (withdrawn, never deleted — the ask happened). */
export async function removeExpertAction(input: unknown): Promise<ActionResult> {
  return run(MeetingChildRef, input, async (data, actor, db) => {
    await removeExpert(db, data.id, actor);
    return {};
  }, (d) => revalidateEverywhere(d.meetingId), "removeExpertAction");
}

/** Types into the FCC Global Address Book behind the "Add expert" combobox. */
export async function searchAddressBookAction(q: unknown, bureauCode?: unknown): Promise<ActionResultWith<{ entries: AddressBookEntry[] }>> {
  const user = await requireUser("/meetings");
  const parsed = AddressBookQuery.safeParse({ q, bureauCode: bureauCode === "" ? undefined : bureauCode });
  if (!parsed.success) return { ok: false, error: firstMessage(parsed.error) };
  if (!can(toPolicyUser(user), "directory.read", { kind: "system" })) return { ok: false, error: "You do not have permission to search the directory." };

  try {
    const entries = await getIntegrations(await getDb()).addressBook.search(parsed.data.q, { bureauCode: parsed.data.bureauCode, limit: parsed.data.limit });
    return { ok: true, entries };
  } catch (error) {
    console.error("searchAddressBookAction failed", error);
    return { ok: false, error: "The address book could not be reached." };
  }
}

export async function addParticipantAction(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  return run(ParticipantInput, input, (data, actor, db) => addParticipant(db, data, actor), (d) => revalidateEverywhere(d.meetingId), "addParticipantAction");
}

export async function removeParticipantAction(input: unknown): Promise<ActionResult> {
  return run(MeetingChildRef, input, async (data, actor, db) => {
    await removeParticipant(db, data.id, actor);
    return {};
  }, (d) => revalidateEverywhere(d.meetingId), "removeParticipantAction");
}

/** Planned headcounts, and the actual turnout once the meeting has happened. */
export async function setParticipantTotalsAction(input: unknown): Promise<ActionResult> {
  return run(ParticipantTotalsInput, input, async (data, actor, db) => {
    await setParticipantTotals(db, data, actor);
    return {};
  }, (d) => revalidateEverywhere(d.meetingId), "setParticipantTotalsAction");
}

/* -------------------------------- schedule -------------------------------- */

export async function proposeDateAction(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  return run(CandidateDateInput, input, (data, actor, db) => proposeDate(db, data, actor), (d) => revalidateEverywhere(d.meetingId), "proposeDateAction");
}

/** Accepting a candidate sets the meeting's confirmed slot and stands the others down. */
export async function acceptDateAction(input: unknown): Promise<ActionResult> {
  return run(MeetingChildRef, input, async (data, actor, db) => {
    await acceptDate(db, data.id, actor);
    return {};
  }, (d) => revalidateEverywhere(d.meetingId), "acceptDateAction");
}

export async function declineDateAction(input: unknown): Promise<ActionResult> {
  return run(DeclineDateInput, input, async (data, actor, db) => {
    await declineDate(db, data.id, actor, new Date(), data.note);
    return {};
  }, (d) => revalidateEverywhere(d.meetingId), "declineDateAction");
}

export async function updateLogisticsAction(input: unknown): Promise<ActionResultWith<{ changed: string[] }>> {
  return run(LogisticsInput, input, (data, actor, db) => updateLogistics(db, data, actor), (d) => revalidateEverywhere(d.meetingId), "updateLogisticsAction");
}

/* --------------------------- agenda and documents -------------------------- */

/** Adds a timed block, or edits the one named by `id`. */
export async function upsertAgendaItemAction(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  return run(AgendaItemInput, input, (data, actor, db) => upsertAgendaItem(db, data, actor), (d) => revalidateRecord(d.meetingId), "upsertAgendaItemAction");
}

export async function deleteAgendaItemAction(input: unknown): Promise<ActionResult> {
  return run(MeetingChildRef, input, async (data, actor, db) => {
    await deleteAgendaItem(db, data.id, actor);
    return {};
  }, (d) => revalidateRecord(d.meetingId), "deleteAgendaItemAction");
}

/** Records that a document exists somewhere else — a SharePoint link, or metadata alone. */
export async function addDocumentAction(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  return run(DocumentInput, input, async (data, actor, db) => {
    const meta = await addDocument(db, data, actor);
    return { id: meta.id };
  }, (d) => revalidateDocuments(d.meetingId), "addDocumentAction");
}

/**
 * Puts a real file on the shelf. A `FormData` payload rather than JSON, because that is how a
 * browser sends bytes; the fields beside the file are parsed like any other action's input,
 * and the service checks the file itself (size, type) before anything is stored.
 */
export async function uploadDocumentAction(formData: FormData): Promise<ActionResultWith<{ id: string; version: number }>> {
  const user = await requireUser("/meetings");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a file to upload." };

  const parsed = UploadFields.safeParse({
    meetingId: formData.get("meetingId"),
    kind: formData.get("kind"),
    title: formData.get("title") || undefined,
    reusable: formData.get("reusable") === "true",
  });
  if (!parsed.success) return { ok: false, error: firstMessage(parsed.error) };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const meta = await uploadDocument(await getDb(), { ...parsed.data, file: { name: file.name, mime: file.type, bytes } }, toPolicyUser(user));
    revalidateDocuments(parsed.data.meetingId);
    return { ok: true, id: meta.id, version: meta.version };
  } catch (error) {
    if (isAppError(error)) return { ok: false, error: error.message };
    console.error("uploadDocumentAction failed", error);
    return { ok: false, error: FAILED };
  }
}

/** "Reuse in a meeting": places an existing file in another meeting's slot, with provenance. */
export async function reuseDocumentAction(input: unknown): Promise<ActionResultWith<{ id: string; code: string; version: number }>> {
  return run(ReuseInput, input, async (data, actor, db) => {
    const meta = await reuseDocument(db, data, actor);
    const target = await makeMeetingsRepo(db).row(meta.meetingId);
    return { id: meta.id, code: target?.code ?? "", version: meta.version };
  }, (d) => revalidateDocuments(d.meetingId), "reuseDocumentAction");
}

export async function toggleReusableAction(input: unknown): Promise<ActionResult> {
  return run(DocumentReusableInput, input, async (data, actor, db) => {
    await toggleReusable(db, data.id, data.reusable, actor);
    return {};
  }, (d) => { revalidateRecord(d.meetingId); revalidatePath("/documents"); }, "toggleReusableAction");
}

export async function removeDocumentAction(input: unknown): Promise<ActionResult> {
  return run(MeetingChildRef, input, async (data, actor, db) => {
    await removeDocument(db, data.id, actor);
    return {};
  }, (d) => revalidateDocuments(d.meetingId), "removeDocumentAction");
}
