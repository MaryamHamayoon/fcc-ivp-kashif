import { businessDaysBetween } from "./business-days";
import { WAITING_ON_LABELS, type WaitingOn } from "./types";

/**
 * The "waiting-on" engine: the latest unresolved activity that names who we are waiting on,
 * aged in business days and banded for display.
 */

export type AgeBand = "ok" | "warn" | "alert";

export type WaitingActivity = {
  id: string;
  waitingOn: WaitingOn;
  waitingOnLabel: string | null;
  occurredAt: Date;
  resolvedAt: Date | null;
  nextAction: string | null;
  nextActionDueAt: Date | null;
};

export type WaitingState = {
  who: Exclude<WaitingOn, "none">;
  label: string;
  since: Date;
  businessDays: number;
  band: AgeBand;
  activityId: string;
  nextAction: string | null;
  nextActionDueAt: Date | null;
} | null;

/** 0–5 business days ok, 6–14 warn, 15+ alert. */
export function ageBand(businessDays: number): AgeBand {
  if (businessDays >= 15) return "alert";
  if (businessDays >= 6) return "warn";
  return "ok";
}

export function computeWaitingOn(activities: WaitingActivity[], now: Date): WaitingState {
  let latest: WaitingActivity | null = null;
  for (const a of activities) {
    if (a.waitingOn === "none" || a.resolvedAt) continue;
    if (!latest || a.occurredAt.getTime() > latest.occurredAt.getTime()) latest = a;
  }
  if (!latest) return null;
  const businessDays = businessDaysBetween(latest.occurredAt, now);
  return {
    who: latest.waitingOn as Exclude<WaitingOn, "none">,
    label: latest.waitingOnLabel?.trim() || WAITING_ON_LABELS[latest.waitingOn],
    since: latest.occurredAt,
    businessDays,
    band: ageBand(businessDays),
    activityId: latest.id,
    nextAction: latest.nextAction,
    nextActionDueAt: latest.nextActionDueAt,
  };
}
