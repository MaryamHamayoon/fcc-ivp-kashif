import type { DocumentKind, ExpertStatus, MeetingFormat, MeetingStatus } from "./types";

/**
 * Readiness is derived, never typed: six checks that together say whether a meeting can be held
 * as planned. "Ready" additionally requires the meeting to be confirmed.
 */

export type ReadinessInput = {
  status: MeetingStatus;
  format: MeetingFormat;
  hasAcceptedDate: boolean;
  experts: { status: ExpertStatus }[];
  documents: { kind: DocumentKind }[];
  namedParticipants: number;
  location: string | null;
  virtualLink: string | null;
};

export type ReadinessKey = "dates" | "experts" | "agenda" | "materials" | "participants" | "logistics";

export type ReadinessItem = { key: ReadinessKey; label: string; done: boolean; detail: string };

export type Readiness = { percent: number; items: ReadinessItem[]; missing: ReadinessItem[]; isReady: boolean };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function computeReadiness(input: ReadinessInput): Readiness {
  const kinds = new Set(input.documents.map((d) => d.kind));
  const confirmed = input.experts.filter((e) => e.status === "confirmed").length;
  const pending = input.experts.filter((e) => e.status === "requested" || e.status === "tbd").length;
  const expertsDone = confirmed > 0 && pending === 0;

  const needsLocation = input.format === "in_person" || input.format === "hybrid";
  const needsLink = input.format === "virtual" || input.format === "hybrid";
  const hasLocation = !!input.location?.trim();
  const hasLink = !!input.virtualLink?.trim();
  const logisticsDone = (!needsLocation || hasLocation) && (!needsLink || hasLink);
  const logisticsMissing = [needsLocation && !hasLocation ? "room" : null, needsLink && !hasLink ? "virtual link" : null].filter(Boolean);

  const participantsDone = kinds.has("participant_list") || input.namedParticipants > 0;

  const items: ReadinessItem[] = [
    {
      key: "dates",
      label: "Date confirmed",
      done: input.hasAcceptedDate,
      detail: input.hasAcceptedDate ? "Meeting date accepted by both sides" : "No accepted meeting date yet",
    },
    {
      key: "experts",
      label: "Experts confirmed",
      done: expertsDone,
      detail:
        confirmed === 0
          ? "No confirmed briefer"
          : pending > 0
            ? `${plural(pending, "expert")} awaiting confirmation`
            : `${plural(confirmed, "briefer")} confirmed`,
    },
    {
      key: "agenda",
      label: "Final agenda",
      done: kinds.has("agenda_final"),
      detail: kinds.has("agenda_final") ? "Final agenda on file" : kinds.has("agenda_draft") ? "Draft agenda only" : "No agenda yet",
    },
    {
      key: "materials",
      label: "Briefing materials",
      done: kinds.has("briefing_deck"),
      detail: kinds.has("briefing_deck") ? "Briefing deck on file" : "No briefing deck yet",
    },
    {
      key: "participants",
      label: "Participant list",
      done: participantsDone,
      detail: participantsDone
        ? input.namedParticipants > 0
          ? `${plural(input.namedParticipants, "named participant")}`
          : "Participant list on file"
        : "No participant list yet",
    },
    {
      key: "logistics",
      label: "Logistics",
      done: logisticsDone,
      detail: logisticsDone ? "Location and access set" : `Missing ${logisticsMissing.join(" and ")}`,
    },
  ];

  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return {
    percent,
    items,
    missing: items.filter((i) => !i.done),
    isReady: input.status === "confirmed" && percent === 100,
  };
}
