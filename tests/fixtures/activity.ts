import type { ActivityFeedItem } from "@/lib/db/repos/activities";

/** One believable line of the program-wide feed; override what a test cares about. */
export function makeFeedItem(over: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
  return {
    id: "act_1",
    kind: "email_out",
    body: "Sent the draft agenda to the ARTCI point of contact and asked for the delegation list.",
    occurredAt: new Date("2026-08-28T15:10:00Z"),
    authorId: "usr_priya",
    authorName: "Priya Raman",
    waitingOn: "none",
    waitingOnLabel: null,
    nextAction: null,
    nextActionDueAt: null,
    resolvedAt: null,
    resolvedByName: null,
    meetingId: "mtg_1",
    meetingCode: "IVP-2026-041",
    meetingTitle: "ARTCI study visit on spectrum valuation",
    meetingStatus: "developing",
    orgName: "ARTCI",
    countryCode: "CI",
    countryName: "Côte d'Ivoire",
    ...over,
  };
}
