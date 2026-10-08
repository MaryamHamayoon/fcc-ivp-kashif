/**
 * The meeting record — one load per request, shared by the record layout and every tab page.
 *
 * `app/(app)/meetings/[id]/layout.tsx` and each tab's `page.tsx` render in parallel and all
 * need the same meeting, so the loader is wrapped in React's `cache()`: the first caller pays
 * for the query, the rest read the memo. React keys that memo by argument identity, and
 * `toPolicyUser()` mints a fresh object on every call, so the actor is passed through as a
 * stable string key (see `actorKey`) rather than as the object itself.
 *
 * `MeetingRecord` is `MeetingDetail` (every row and relation of the meeting) plus the values
 * the header, rail and tabs would otherwise each derive: what this user may do, where the
 * status may go next, and the counts the tab strip shows. Tabs should read from here rather
 * than re-querying — treat the shape as a published contract.
 *
 * Reading a meeting the user may not see is a 404, never a 403: the record's existence is
 * itself information.
 */
import { cache } from "react";
import type { Db } from "@/lib/db/factory";
import { makeMeetingsRepo, type MeetingDetail } from "@/lib/db/repos/meetings";
import type { CandidateDateRow } from "@/lib/db/types";
import { can, type PolicyUser, type Subject } from "@/lib/domain/policy";
import { allowedTransitions, isTerminal, resumeTarget } from "@/lib/domain/status-machine";
import type { MeetingStatus } from "@/lib/domain/types";
import { NotFoundError } from "./errors";

/** What the signed-in user may do to this meeting; every control in the record is gated on one of these. */
export type RecordPermissions = {
  /** Move the meeting to another status, including onto hold and to cancelled. */
  transition: boolean;
  /** Edit the meeting itself — details, dates, logistics, agenda, participants. */
  update: boolean;
  logActivity: boolean;
  addExpert: boolean;
  addDocument: boolean;
  /** Answer a briefing request as the expert who was asked. */
  respondAsExpert: boolean;
};

/** Cheap counts for the tab strip — computed here so no tab has to count twice. */
export type RecordCounts = {
  experts: number;
  expertsPending: number;
  participants: number;
  candidateDates: number;
  agendaItems: number;
  documents: number;
  activities: number;
  /** Unresolved activities that name someone we are waiting on. */
  openWaiting: number;
};

export type MeetingRecord = MeetingDetail & {
  /** Canonical path for this meeting; an IVP-code URL redirects here. */
  href: string;
  /** The instant the derived values (waiting-on ages, readiness) were computed against. */
  now: Date;
  permissions: RecordPermissions;
  /** Statuses this meeting may move to right now — empty for a held or terminal meeting. */
  allowed: MeetingStatus[];
  /** Guard for Confirmed and Completed: a candidate date has been accepted (or a slot is scheduled). */
  hasAcceptedDate: boolean;
  acceptedDate: CandidateDateRow | null;
  /** Closed or cancelled: the record is history, not work. */
  terminal: boolean;
  /** Where a held meeting lands when it is resumed. */
  resumesTo: MeetingStatus;
  counts: RecordCounts;
  regionName: string;
  countryName: string;
  /** Every country on the delegation, primary first. */
  countryNames: string[];
  orgName: string | null;
  orgShortName: string | null;
  requestorName: string | null;
  leadName: string | null;
  coordinatorName: string | null;
};

const CODE_PATTERN = /^IVP-\d{4}-\d+$/i;

/**
 * React `cache()` compares arguments by identity, so the actor travels as a stable string.
 * Only the fields the policy reads are included — two sessions of the same user share the memo.
 */
function actorKey(user: PolicyUser): string {
  return JSON.stringify({ id: user.id, role: user.role, regionIds: [...user.regionIds].sort(), staffId: user.staffId });
}

/** One "now" for the whole request, so the header and the rail cannot disagree by a second. */
const requestNow = cache((): Date => new Date());

function permissionsFor(user: PolicyUser, subject: Subject): RecordPermissions {
  return {
    transition: can(user, "meeting.transition", subject),
    update: can(user, "meeting.update", subject),
    logActivity: can(user, "activity.create", subject),
    addExpert: can(user, "meeting.update", subject),
    addDocument: can(user, "document.add", subject),
    respondAsExpert: can(user, "expert.respond", subject),
  };
}

function countsFor(detail: MeetingDetail): RecordCounts {
  return {
    experts: detail.experts.length,
    expertsPending: detail.experts.filter((e) => e.status === "requested" || e.status === "tbd").length,
    participants: detail.participants.length,
    candidateDates: detail.candidateDates.filter((d) => d.status === "proposed" || d.status === "accepted").length,
    agendaItems: detail.agendaItems.length,
    documents: detail.documents.length,
    activities: detail.activities.length,
    openWaiting: detail.activities.filter((a) => a.waitingOn !== "none" && a.resolvedAt === null).length,
  };
}

/** Decorates the loaded meeting with everything the record's screens derive from it. */
export function toRecord(detail: MeetingDetail, user: PolicyUser, now: Date): MeetingRecord {
  const acceptedDate = detail.candidateDates.find((d) => d.status === "accepted") ?? null;
  const subject: Subject = { kind: "meeting", regionId: detail.regionId, assignedStaffIds: detail.experts.map((e) => e.staffId) };

  return {
    ...detail,
    href: `/meetings/${detail.id}`,
    now,
    permissions: permissionsFor(user, subject),
    allowed: allowedTransitions(detail.status),
    hasAcceptedDate: detail.scheduledStart !== null || acceptedDate !== null,
    acceptedDate,
    terminal: isTerminal(detail.status),
    resumesTo: resumeTarget(detail.previousStatus),
    counts: countsFor(detail),
    regionName: detail.region.name,
    countryName: detail.primaryCountry.name,
    countryNames: detail.countries.map((c) => c.name),
    orgName: detail.organization?.name ?? null,
    orgShortName: detail.organization?.shortName ?? null,
    requestorName: detail.requestor?.name ?? null,
    leadName: detail.lead?.name ?? null,
    coordinatorName: detail.coordinator?.name ?? null,
  };
}

const load = cache(async (db: Db, idOrCode: string, key: string, nowMs: number): Promise<MeetingRecord> => {
  const user = JSON.parse(key) as PolicyUser;
  const now = new Date(nowMs);
  const repo = makeMeetingsRepo(db);

  // The canonical URL carries the id; an IVP code is accepted so a pasted code resolves too.
  const byCode = CODE_PATTERN.test(idOrCode);
  const detail = (await (byCode ? repo.getByCode(idOrCode, now) : repo.get(idOrCode, now))) ?? (await (byCode ? repo.get(idOrCode, now) : repo.getByCode(idOrCode, now)));
  if (!detail) throw new NotFoundError("Meeting");

  const record = toRecord(detail, user, now);
  // Not readable is reported as missing: whether a meeting exists is itself something to protect.
  if (!can(user, "meeting.read", { kind: "meeting", regionId: detail.regionId, assignedStaffIds: detail.experts.map((e) => e.staffId) })) {
    throw new NotFoundError("Meeting");
  }
  return record;
});

/**
 * Loads one meeting by id (`mtg_…`) or IVP code (`IVP-2026-012`) for `user`.
 *
 * Throws `NotFoundError` when it does not exist or the user may not read it. Safe to call
 * from the layout and from every tab page in the same request: they share one query.
 */
export function getMeetingRecord(db: Db, idOrCode: string, user: PolicyUser, now?: Date): Promise<MeetingRecord> {
  return load(db, idOrCode, actorKey(user), (now ?? requestNow()).getTime());
}
