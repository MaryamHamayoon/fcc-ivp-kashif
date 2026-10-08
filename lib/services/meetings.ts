import { eq, inArray, or, sql } from "drizzle-orm";
import type { CreateMeetingInput, TransitionInput } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeActivitiesRepo } from "@/lib/db/repos/activities";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import { fiscalYearOf } from "@/lib/domain/fiscal-year";
import { formatIvpCode } from "@/lib/domain/ivp-code";
import type { PolicyUser } from "@/lib/domain/policy";
import { canTransition, resumeTarget, type TransitionResult } from "@/lib/domain/status-machine";
import { STATUS_LABELS, type MeetingStatus, type OrgKind, type ParticipantCategory } from "@/lib/domain/types";
import { assertCan, requireMeeting } from "./access";
import { NotFoundError, ValidationError } from "./errors";
import { fmtDate, fmtShort } from "./format";
import { foldText } from "@/lib/db/repos/search";

export type TransitionOutcome = TransitionResult & { status?: MeetingStatus };

function delegationCategory(kind: OrgKind): ParticipantCategory {
  if (kind === "industry") return "industry";
  if (kind === "academia") return "academia_ngo";
  if (kind === "international_org") return "other";
  return "foreign_gov";
}

async function audit(db: Db, entityId: string, action: string, diff: Record<string, unknown>, userId: string, at: Date) {
  await db.insert(s.auditLog).values({ id: newId("aud"), entity: "meeting", entityId, action, diff, userId, at });
}

/** Finds an organization by name or acronym (accent- and case-insensitive) or creates it. */
async function resolveOrganization(db: Db, name: string, kind: OrgKind, countryCode: string, at: Date): Promise<string> {
  const folded = foldText(name.trim());
  const [existing] = await db
    .select({ id: s.organizations.id })
    .from(s.organizations)
    .where(or(sql`lower(${s.organizations.name}) = ${name.trim().toLowerCase()}`, sql`lower(coalesce(${s.organizations.shortName}, '')) = ${folded}`, sql`lower(${s.organizations.name}) = ${folded}`))
    .limit(1);
  if (existing) return existing.id;
  const id = newId("org");
  await db.insert(s.organizations).values({ id, name: name.trim(), shortName: null, kind, countryCode, createdAt: at });
  return id;
}

export async function createMeeting(db: Db, input: CreateMeetingInput, actor: PolicyUser, now = new Date()): Promise<{ id: string; code: string }> {
  assertCan(actor, "meeting.create", { kind: "system" });
  const meetings = makeMeetingsRepo(db);
  const activities = makeActivitiesRepo(db);

  const codes = [...new Set(input.countryCodes.map((c) => c.toUpperCase()))];
  const known = await db.select({ cca2: s.countries.cca2 }).from(s.countries).where(inArray(s.countries.cca2, codes));
  const missing = codes.filter((c) => !known.some((k) => k.cca2 === c));
  if (missing.length) throw new ValidationError(`Unknown country code: ${missing.join(", ")}`);
  const [region] = await db.select({ id: s.regions.id }).from(s.regions).where(eq(s.regions.id, input.regionId)).limit(1);
  if (!region) throw new ValidationError(`Unknown region: ${input.regionId}`);
  const topicRows = await db.select({ id: s.topics.id }).from(s.topics).where(inArray(s.topics.id, input.topics.map((t) => t.topicId)));
  const missingTopics = input.topics.filter((t) => !topicRows.some((r) => r.id === t.topicId));
  if (missingTopics.length) throw new ValidationError(`Unknown topic: ${missingTopics.map((t) => t.topicId).join(", ")}`);

  const primaryCountry = codes[0]!;
  const organizationId = await resolveOrganization(db, input.requestor.organizationName, input.requestor.organizationKind, primaryCountry, now);
  const contactId = newId("ctc");
  await db.insert(s.contacts).values({
    id: contactId,
    name: input.requestor.name,
    title: input.requestor.title ?? null,
    organizationId,
    email: input.requestor.email,
    phone: input.requestor.phone ?? null,
    createdAt: now,
  });

  const fiscalYear = fiscalYearOf(input.dates.preferredStart);
  const sequence = await meetings.nextSequence(fiscalYear);
  const code = formatIvpCode(fiscalYear, sequence);
  const id = newId("mtg");

  let leadUserId = input.leadUserId ?? null;
  if (!leadUserId) {
    const [lead] = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(sql`${s.users.role} = 'regional_lead' AND ${s.users.active} AND ${s.users.regionIds} ? ${input.regionId}`)
      .limit(1);
    leadUserId = lead?.id ?? null;
  }

  await meetings.insert({
    id,
    code,
    fiscalYear,
    sequence,
    title: input.delegation.headline,
    status: "requested",
    previousStatus: null,
    format: input.dates.format,
    regionId: input.regionId,
    primaryCountryCode: primaryCountry,
    organizationId,
    requestorContactId: contactId,
    leadUserId,
    coordinatorUserId: actor.role === "coordinator" || actor.role === "admin" ? actor.id : null,
    timezone: input.dates.timezone,
    purpose: input.delegation.purpose ?? null,
    ochAttending: input.ochRequested,
    priority: input.ochRequested ? "high" : "normal",
    delegationSize: input.delegation.size,
    needsAv: input.logistics.needsAv,
    interpreter: input.logistics.interpreter,
    accommodations: input.logistics.accommodations ?? null,
    localContact: input.logistics.localContact ?? null,
    backgroundUrl: input.logistics.backgroundUrl ?? null,
    viaIntermediary: input.requestor.viaIntermediary ?? null,
    requestedAt: now,
    createdById: actor.id,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(s.meetingCountries).values(codes.map((countryCode) => ({ meetingId: id, countryCode })));
  await db.insert(s.meetingTopics).values(input.topics.map((t, i) => ({ id: newId("mtp"), meetingId: id, topicId: t.topicId, rank: i + 1, detail: t.detail ?? null })));

  const dates = [{ start: input.dates.preferredStart, end: input.dates.preferredEnd ?? null }];
  if (input.dates.alternateStart) dates.push({ start: input.dates.alternateStart, end: null });
  await db.insert(s.meetingCandidateDates).values(dates.map((d) => ({ id: newId("cdt"), meetingId: id, start: d.start, end: d.end, proposedBy: "visitor" as const, status: "proposed" as const, createdAt: now })));

  const category = delegationCategory(input.requestor.organizationKind);
  await db.insert(s.meetingParticipants).values([
    { id: newId("ppl"), meetingId: id, name: input.requestor.name, title: input.requestor.title ?? null, organizationId, contactId, category, isInterpreter: false },
    ...input.delegation.members.map((m) => ({ id: newId("ppl"), meetingId: id, name: m.name, title: m.title ?? null, organizationId, contactId: null, category: m.category, isInterpreter: m.isInterpreter })),
  ]);
  // The intake already asked how many are coming: that number is the planned headcount until someone refines it.
  await db.insert(s.meetingParticipantTotals).values({ id: newId("pct"), meetingId: id, category, planned: input.delegation.size, actual: null });

  await activities.insert({
    id: newId("act"),
    meetingId: id,
    kind: "status_change",
    body: `${code} created — status Requested. Preferred date ${fmtDate(input.dates.preferredStart)}${input.dates.alternateStart ? `, alternate ${fmtShort(input.dates.alternateStart)}` : ""}.`,
    occurredAt: now,
    authorId: actor.id,
    createdAt: now,
  });
  await audit(db, id, "create", { code, status: "requested" }, actor.id, now);
  return { id, code };
}

export async function transitionMeeting(db: Db, input: TransitionInput, actor: PolicyUser, now = new Date()): Promise<TransitionOutcome> {
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "meeting.transition");
  const meetings = makeMeetingsRepo(db);
  const activities = makeActivitiesRepo(db);

  const [accepted] = await db
    .select({ id: s.meetingCandidateDates.id })
    .from(s.meetingCandidateDates)
    .where(sql`${s.meetingCandidateDates.meetingId} = ${meeting.id} AND ${s.meetingCandidateDates.status} = 'accepted'`)
    .limit(1);
  const result = canTransition(meeting.status, input.to, {
    hasAcceptedDate: meeting.scheduledStart !== null || Boolean(accepted),
    holdReason: input.holdReason,
    holdFollowUpAt: input.holdFollowUpAt,
    cancelReason: input.cancelReason,
  });
  if (!result.ok) return result;

  const from = meeting.status;
  const to = input.to;
  const keepsPrevious = to === "on_hold" || to === "cancelled";
  await meetings.setStatus(
    meeting.id,
    to,
    keepsPrevious ? from : null,
    {
      holdReason: to === "on_hold" ? (input.holdReason ?? null) : null,
      holdFollowUpAt: to === "on_hold" ? (input.holdFollowUpAt ?? null) : null,
      cancelReason: to === "cancelled" ? (input.cancelReason ?? null) : null,
      ...(to === "completed" ? { completedAt: meeting.scheduledEnd ?? now } : {}),
      ...(to === "closed" ? { closedAt: now } : {}),
    },
    now,
  );

  const note = input.note?.trim();
  let body: string;
  let kind: "status_change" | "hold" = "status_change";
  if (to === "on_hold") {
    kind = "hold";
    body = `On hold — ${input.holdReason}${input.holdReason?.endsWith(".") ? "" : "."} Follow up ${fmtShort(input.holdFollowUpAt!)}.`;
  } else if (to === "cancelled") {
    body = `Status: ${STATUS_LABELS[from]} → Cancelled. ${input.cancelReason}`;
  } else {
    body = `Status: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}.`;
  }
  if (note) body += ` ${note}`;

  await activities.insert({ id: newId("act"), meetingId: meeting.id, kind, body, occurredAt: now, authorId: actor.id, createdAt: now });
  await audit(db, meeting.id, "transition", { from, to, holdReason: input.holdReason, cancelReason: input.cancelReason, note }, actor.id, now);
  return { ok: true, status: to };
}

export async function resumeMeeting(db: Db, meetingId: string, actor: PolicyUser, now = new Date()): Promise<TransitionOutcome> {
  const { meeting } = await requireMeeting(db, meetingId, actor, "meeting.transition");
  if (meeting.status !== "on_hold") return { ok: false, reason: "Only meetings on hold can be resumed." };
  const target = resumeTarget(meeting.previousStatus);
  await makeMeetingsRepo(db).setStatus(meeting.id, target, null, {}, now);
  await makeActivitiesRepo(db).insert({
    id: newId("act"),
    meetingId: meeting.id,
    kind: "resume",
    body: `Resumed — back to ${STATUS_LABELS[target]}.`,
    occurredAt: now,
    authorId: actor.id,
    createdAt: now,
  });
  await audit(db, meeting.id, "transition", { from: "on_hold", to: target, resumed: true }, actor.id, now);
  return { ok: true, status: target };
}

/** Editable header/logistics fields (the meeting record's header uses this). */
export type MeetingPatch = Partial<Pick<typeof s.meetings.$inferInsert, "title" | "purpose" | "format" | "location" | "virtualLink" | "ochAttending" | "priority" | "delegationSize" | "needsAv" | "interpreter" | "accommodations" | "localContact" | "leadUserId" | "coordinatorUserId" | "timezone">>;

export async function updateMeeting(db: Db, meetingId: string, patch: MeetingPatch, actor: PolicyUser, now = new Date()): Promise<void> {
  const { meeting } = await requireMeeting(db, meetingId, actor, "meeting.update");
  if (!meeting) throw new NotFoundError("Meeting");
  await makeMeetingsRepo(db).update(meeting.id, patch, now);
  await audit(db, meeting.id, "update", patch, actor.id, now);
}
