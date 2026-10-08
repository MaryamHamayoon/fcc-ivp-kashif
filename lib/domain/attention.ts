import { businessDaysBetween } from "./business-days";
import { isTerminal } from "./status-machine";
import type { MeetingStatus } from "./types";
import type { WaitingState } from "./waiting-on";

/**
 * Attention rules: what an executive or coordinator must look at today.
 * Pure function over a compact projection of each meeting.
 */

export type AttentionKind =
  | "waiting_aging"
  | "experts_unconfirmed"
  | "not_ready"
  | "hold_overdue"
  | "request_stale"
  | "counts_missing";

export type AttentionSeverity = "alert" | "warn" | "info";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  meetingId: string;
  meetingCode: string;
  title: string;
  detail: string;
  ageDays: number | null;
  dueAt: Date | null;
  href: string;
  /** Who owns the meeting, for the dashboard rail. */
  leadName: string | null;
};

export type AttentionMeeting = {
  id: string;
  code: string;
  title: string;
  orgName: string;
  countryName: string;
  leadName: string | null;
  status: MeetingStatus;
  scheduledStart: Date | null;
  requestedAt: Date;
  holdFollowUpAt: Date | null;
  updatedAt: Date;
  readinessPercent: number;
  expertsPending: number;
  waiting: WaitingState;
  actualCountsEntered: boolean;
};

const DAY = 86_400_000;
const SEVERITY_RANK: Record<AttentionSeverity, number> = { alert: 0, warn: 1, info: 2 };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const ATTENTION_KIND_LABELS: Record<AttentionKind, string> = {
  waiting_aging: "Waiting too long",
  experts_unconfirmed: "Experts unconfirmed",
  not_ready: "Not ready",
  hold_overdue: "Hold follow-up overdue",
  request_stale: "Untouched request",
  counts_missing: "Counts missing",
};

export function computeAttention(meetings: AttentionMeeting[], now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const m of meetings) {
    const title = `${m.orgName} · ${m.countryName}`;
    const href = `/meetings/${m.id}`;
    const push = (kind: AttentionKind, severity: AttentionSeverity, detail: string, ageDays: number | null, dueAt: Date | null) =>
      items.push({ id: `${m.id}:${kind}`, kind, severity, meetingId: m.id, meetingCode: m.code, title, detail, ageDays, dueAt, href, leadName: m.leadName });

    const daysUntil = m.scheduledStart ? Math.ceil((m.scheduledStart.getTime() - now.getTime()) / DAY) : null;
    const upcomingWithin = (days: number) => daysUntil !== null && daysUntil >= 0 && daysUntil <= days;
    const inPlay = !isTerminal(m.status) && m.status !== "completed";

    if (m.waiting && inPlay && m.waiting.businessDays >= 7) {
      push(
        "waiting_aging",
        m.waiting.band === "alert" ? "alert" : "warn",
        `Waiting on ${m.waiting.label} · ${plural(m.waiting.businessDays, "business day")}`,
        m.waiting.businessDays,
        m.waiting.nextActionDueAt,
      );
    }

    if (m.expertsPending > 0 && inPlay && m.status !== "on_hold" && upcomingWithin(14)) {
      push(
        "experts_unconfirmed",
        upcomingWithin(7) ? "alert" : "warn",
        `${plural(m.expertsPending, "expert")} not confirmed · meeting in ${plural(daysUntil ?? 0, "day")}`,
        null,
        m.scheduledStart,
      );
    }

    if (m.status === "confirmed" && m.readinessPercent < 100 && upcomingWithin(14)) {
      push(
        "not_ready",
        upcomingWithin(7) ? "alert" : "warn",
        `Readiness ${m.readinessPercent}% · meeting in ${plural(daysUntil ?? 0, "day")}`,
        null,
        m.scheduledStart,
      );
    }

    if (m.status === "on_hold" && m.holdFollowUpAt && m.holdFollowUpAt.getTime() < now.getTime()) {
      const overdue = businessDaysBetween(m.holdFollowUpAt, now);
      push(
        "hold_overdue",
        overdue > 5 ? "alert" : "warn",
        overdue === 0 ? "On hold · follow-up date has passed" : `On hold · follow-up overdue by ${plural(overdue, "business day")}`,
        overdue,
        m.holdFollowUpAt,
      );
    }

    if (m.status === "requested" && !m.waiting) {
      const stale = businessDaysBetween(m.updatedAt, now);
      if (stale >= 3) push("request_stale", "info", `New request untouched for ${plural(stale, "business day")}`, stale, null);
    }

    if (m.status === "completed" && !m.actualCountsEntered) {
      const since = m.scheduledStart ? Math.max(0, Math.floor((now.getTime() - m.scheduledStart.getTime()) / DAY)) : null;
      push("counts_missing", "info", "Completed · actual participant counts not entered", since, null);
    }
  }

  return items.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.dueAt && b.dueAt ? a.dueAt.getTime() - b.dueAt.getTime() : 0) ||
      (b.ageDays ?? 0) - (a.ageDays ?? 0),
  );
}
