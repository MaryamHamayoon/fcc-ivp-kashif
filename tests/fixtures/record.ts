import type { MeetingDetail } from "@/lib/db/repos/meetings";
import type { PolicyUser } from "@/lib/domain/policy";
import { computeWaitingOn } from "@/lib/domain/waiting-on";
import { type MeetingRecord, toRecord } from "@/lib/services/record";
import { makeReadiness } from "./meetings";

export const RECORD_NOW = new Date("2026-08-29T14:00:00Z");

const region = { id: "af", name: "Africa", sortOrder: 1 };
const ci = { cca2: "CI", cca3: "CIV", ccn3: "384", name: "Côte d'Ivoire", regionId: "af", lat: 7.54, lng: -5.55 };
const artci = { id: "org_artci", name: "Autorité de Régulation des Télécommunications de Côte d'Ivoire", shortName: "ARTCI", kind: "regulator" as const, countryCode: "CI", website: null, createdAt: RECORD_NOW };
const requestor = { id: "ctc_kone", name: "Aminata Koné", title: "Director of International Cooperation", organizationId: "org_artci", email: "a.kone@example.org", phone: null, notes: null, createdAt: RECORD_NOW };

const user = (id: string, name: string, role: PolicyUser["role"]) => ({ id, name, email: `${id}@fcc.gov`, role, staffId: null, bureauCode: null, regionIds: ["af"], blurb: null, active: true, createdAt: RECORD_NOW });
const priya = user("usr_priya", "Priya Raman", "regional_lead");
const marcus = user("usr_marcus", "Marcus Bell", "coordinator");

const oea = { code: "OEA", name: "Office of Economics and Analytics", kind: "office" as const, sortOrder: 3 };
const dana = { id: "stf_dana", name: "Dana Whitfield", email: "dana.whitfield@fcc.gov", title: "Spectrum Policy Analyst", bureauCode: "OEA", phone: null, active: true };

const MEETING_ID = "mtg_artci";

/** A confirmed Côte d'Ivoire study visit: dates accepted, one briefer confirmed, the delegation owing us a roster. */
export function makeDetail(over: Partial<MeetingDetail> = {}): MeetingDetail {
  const activities = [
    {
      id: "act_2",
      seq: 2,
      meetingId: MEETING_ID,
      kind: "email_out" as const,
      body: "Sent the draft agenda and asked for the final delegation roster.",
      occurredAt: new Date("2026-08-07T13:00:00Z"),
      authorId: priya.id,
      waitingOn: "visitor" as const,
      waitingOnLabel: "ARTCI POC",
      nextAction: "Re-send the roster request",
      nextActionDueAt: new Date("2026-09-02T13:00:00Z"),
      resolvedAt: null,
      resolvedById: null,
      createdAt: new Date("2026-08-07T13:00:00Z"),
      author: priya,
    },
    {
      id: "act_1",
      seq: 1,
      meetingId: MEETING_ID,
      kind: "status_change" as const,
      body: "Status → Confirmed",
      occurredAt: new Date("2026-07-30T15:00:00Z"),
      authorId: marcus.id,
      waitingOn: "none" as const,
      waitingOnLabel: null,
      nextAction: null,
      nextActionDueAt: null,
      resolvedAt: null,
      resolvedById: null,
      createdAt: new Date("2026-07-30T15:00:00Z"),
      author: marcus,
    },
  ];

  return {
    id: MEETING_ID,
    code: "IVP-2026-041",
    fiscalYear: 2026,
    sequence: 41,
    title: "Spectrum sharing study visit",
    status: "confirmed",
    previousStatus: null,
    format: "in_person",
    regionId: "af",
    primaryCountryCode: "CI",
    organizationId: artci.id,
    requestorContactId: requestor.id,
    leadUserId: priya.id,
    coordinatorUserId: marcus.id,
    scheduledStart: new Date("2026-09-15T14:00:00Z"),
    scheduledEnd: new Date("2026-09-15T16:00:00Z"),
    timezone: "America/New_York",
    location: "Room 8-B516, 45 L Street NE",
    virtualLink: null,
    purpose: "Compare approaches to shared spectrum access in the 3.5 GHz band.",
    ochAttending: false,
    priority: "normal",
    holdReason: null,
    holdFollowUpAt: null,
    cancelReason: null,
    delegationSize: 6,
    needsAv: true,
    interpreter: "consecutive",
    accommodations: null,
    localContact: "Embassy of Côte d'Ivoire, Washington",
    backgroundUrl: null,
    viaIntermediary: "U.S. Department of State",
    requestedAt: new Date("2026-06-02T13:00:00Z"),
    completedAt: null,
    closedAt: null,
    createdById: marcus.id,
    createdAt: new Date("2026-06-02T13:00:00Z"),
    updatedAt: new Date("2026-08-27T18:30:00Z"),

    region,
    primaryCountry: ci,
    organization: artci,
    requestor,
    lead: priya,
    coordinator: marcus,
    countries: [ci],
    candidateDates: [
      { id: "cd_1", meetingId: MEETING_ID, start: new Date("2026-09-15T14:00:00Z"), end: new Date("2026-09-15T16:00:00Z"), proposedBy: "fcc", status: "accepted", note: null, createdAt: new Date("2026-07-20T13:00:00Z") },
      { id: "cd_2", meetingId: MEETING_ID, start: new Date("2026-09-22T14:00:00Z"), end: null, proposedBy: "visitor", status: "declined", note: null, createdAt: new Date("2026-07-14T13:00:00Z") },
    ],
    topics: [
      { id: "mt_1", meetingId: MEETING_ID, topicId: "spectrum-sharing", rank: 1, detail: "How does the CBRS tiered model handle incumbent protection?", topic: { id: "spectrum-sharing", name: "Spectrum Sharing", slug: "spectrum-sharing", parentId: null, sortOrder: 1 } },
      { id: "mt_2", meetingId: MEETING_ID, topicId: "spectrum-auctions", rank: 2, detail: null, topic: { id: "spectrum-auctions", name: "Spectrum Auctions", slug: "spectrum-auctions", parentId: null, sortOrder: 2 } },
    ],
    experts: [
      { id: "mex_1", meetingId: MEETING_ID, staffId: dana.id, bureauCode: "OEA", role: "briefer", status: "confirmed", requestedAt: new Date("2026-07-08T13:00:00Z"), respondedAt: new Date("2026-07-10T13:00:00Z"), note: null, createdAt: new Date("2026-07-08T13:00:00Z"), staff: { ...dana, bureau: oea } },
    ],
    participants: [{ id: "mp_1", meetingId: MEETING_ID, name: "Aminata Koné", title: "Director of International Cooperation", organizationId: artci.id, contactId: requestor.id, category: "foreign_gov", isInterpreter: false, attended: null }],
    participantTotals: [
      { id: "pt_1", meetingId: MEETING_ID, category: "fcc", planned: 4, actual: null },
      { id: "pt_2", meetingId: MEETING_ID, category: "other_usg", planned: 1, actual: null },
      { id: "pt_3", meetingId: MEETING_ID, category: "foreign_gov", planned: 6, actual: null },
      { id: "pt_4", meetingId: MEETING_ID, category: "industry", planned: 2, actual: null },
    ],
    documents: [
      { id: "doc_1", meetingId: MEETING_ID, kind: "agenda_final", title: "Final agenda — ARTCI study visit", storageKey: null, version: 2, reusable: false, addedById: priya.id, addedAt: new Date("2026-08-18T13:00:00Z"), filename: null, mime: null, size: null, sha256: null, sourceDocumentId: null, addedBy: priya },
      { id: "doc_2", meetingId: MEETING_ID, kind: "briefing_deck", title: "CBRS overview deck", storageKey: null, version: 1, reusable: true, addedById: priya.id, addedAt: new Date("2026-08-20T13:00:00Z"), filename: null, mime: null, size: null, sha256: null, sourceDocumentId: null, addedBy: priya },
    ],
    agendaItems: [{ id: "ag_1", meetingId: MEETING_ID, sortOrder: 1, startsAt: new Date("2026-09-15T14:00:00Z"), endsAt: new Date("2026-09-15T15:00:00Z"), title: "Shared spectrum access overview", topicId: "spectrum-sharing", brieferStaffIds: [dana.id], notes: null }],
    activities,

    readiness: makeReadiness({ documents: [{ kind: "agenda_final" }, { kind: "briefing_deck" }], namedParticipants: 1 }),
    waiting: computeWaitingOn(activities, RECORD_NOW),
    history: [{ id: "mtg_prior", code: "IVP-2025-018", title: "Universal service funding exchange", scheduledStart: new Date("2025-03-11T14:00:00Z"), status: "closed" }],
    ...over,
  };
}

export const ADMIN: PolicyUser = { id: "usr_admin", role: "admin", regionIds: [], staffId: null };
export const VIEWER: PolicyUser = { id: "usr_viewer", role: "viewer", regionIds: [], staffId: null };

/** The record as the layout hands it to the header, rail and tabs. */
export function makeRecord(over: Partial<MeetingDetail> = {}, actor: PolicyUser = ADMIN): MeetingRecord {
  return toRecord(makeDetail(over), actor, RECORD_NOW);
}
