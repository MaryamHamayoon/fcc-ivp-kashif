import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { computeReadiness, type ReadinessInput } from "@/lib/domain/readiness";

export const FIXTURE_NOW = new Date("2026-08-29T14:00:00Z");

/** Readiness the way the repository derives it, so fixtures cannot drift from the real shape. */
export function makeReadiness(over: Partial<ReadinessInput> = {}) {
  return computeReadiness({
    status: "confirmed",
    format: "in_person",
    hasAcceptedDate: true,
    experts: [{ status: "confirmed" }],
    documents: [{ kind: "agenda_final" }, { kind: "briefing_deck" }],
    namedParticipants: 6,
    location: "Room 8-B516",
    virtualLink: null,
    ...over,
  });
}

/** A realistic list row: a confirmed Côte d'Ivoire visit, ready to go. */
export function makeListItem(over: Partial<MeetingListItem> = {}): MeetingListItem {
  return {
    id: "mtg_artci",
    code: "IVP-2026-041",
    title: "Spectrum sharing study visit",
    status: "confirmed",
    previousStatus: null,
    format: "in_person",
    regionId: "af",
    regionName: "Africa",
    countryCode: "CI",
    countryName: "Côte d'Ivoire",
    countryCodes: ["CI"],
    orgId: "artci",
    orgName: "Autorité de Régulation des Télécommunications",
    orgShortName: "ARTCI",
    leadUserId: "usr_priya",
    leadName: "Priya Raman",
    coordinatorName: "Priya Raman",
    scheduledStart: new Date("2026-09-15T14:00:00Z"),
    scheduledEnd: new Date("2026-09-15T16:00:00Z"),
    nextCandidate: null,
    candidateDates: [],
    topics: [
      { id: "spectrum-sharing", name: "Spectrum Sharing" },
      { id: "spectrum-auctions", name: "Spectrum Auctions" },
    ],
    experts: [{ id: "mex_1", staffId: "stf_dana", name: "Dana Whitfield", bureauCode: "OEA", status: "confirmed", role: "briefer" }],
    readiness: makeReadiness(),
    waiting: null,
    ochAttending: false,
    priority: "normal",
    fiscalYear: 2026,
    delegationSize: 6,
    participantTotal: 12,
    holdFollowUpAt: null,
    requestedAt: new Date("2026-06-02T13:00:00Z"),
    updatedAt: new Date("2026-08-27T18:30:00Z"),
    ...over,
  };
}
