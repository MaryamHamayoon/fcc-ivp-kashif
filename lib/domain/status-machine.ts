import type { MeetingStatus } from "./types";

/**
 * The single meeting lifecycle:
 *   requested → developing → clearance → confirmed → completed → closed
 * with `on_hold` reachable from any pre-completed state (resume returns to the previous state)
 * and `cancelled` reachable from any pre-completed state.
 */

export type TransitionContext = {
  hasAcceptedDate: boolean;
  holdReason?: string;
  holdFollowUpAt?: Date | null;
  cancelReason?: string;
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

export const PIPELINE_ORDER: readonly MeetingStatus[] = [
  "requested",
  "developing",
  "clearance",
  "confirmed",
  "completed",
  "closed",
];

export const ACTIVE_STATUSES: readonly MeetingStatus[] = ["requested", "developing", "clearance", "confirmed", "on_hold"];

/** The coarse cuts of the meetings list — the scope tabs — and the statuses each admits (null: every status). */
export const MEETING_VIEWS = ["active", "upcoming", "developing", "on_hold", "completed", "all"] as const;
export type MeetingView = (typeof MEETING_VIEWS)[number];

/** "Upcoming" also needs an accepted date still ahead; that half is the caller's, since it depends on now. */
export const VIEW_STATUSES: Record<MeetingView, readonly MeetingStatus[] | null> = {
  active: ACTIVE_STATUSES,
  upcoming: ["requested", "developing", "clearance", "confirmed"],
  developing: ["requested", "developing", "clearance"],
  on_hold: ["on_hold"],
  completed: ["completed", "closed"],
  all: null,
};

const FORWARD: Record<MeetingStatus, readonly MeetingStatus[]> = {
  requested: ["developing", "on_hold", "cancelled"],
  developing: ["clearance", "confirmed", "on_hold", "cancelled"],
  clearance: ["confirmed", "developing", "on_hold", "cancelled"],
  confirmed: ["completed", "developing", "on_hold", "cancelled"],
  completed: ["closed"],
  closed: [],
  on_hold: [], // left only through resume()
  cancelled: [],
};

export function allowedTransitions(from: MeetingStatus): MeetingStatus[] {
  return [...FORWARD[from]];
}

export function isTerminal(status: MeetingStatus): boolean {
  return status === "closed" || status === "cancelled";
}

/** Where a held meeting goes when resumed. */
export function resumeTarget(previous: MeetingStatus | null): MeetingStatus {
  return previous && previous !== "on_hold" ? previous : "developing";
}

export function canTransition(from: MeetingStatus, to: MeetingStatus, ctx: TransitionContext): TransitionResult {
  if (!FORWARD[from].includes(to)) return { ok: false, reason: `Cannot move from ${from} to ${to}.` };
  if (to === "confirmed" && !ctx.hasAcceptedDate) return { ok: false, reason: "Confirming requires an accepted meeting date." };
  if (to === "completed" && !ctx.hasAcceptedDate) return { ok: false, reason: "Completing requires an accepted meeting date." };
  if (to === "on_hold" && (!ctx.holdReason?.trim() || !ctx.holdFollowUpAt)) {
    return { ok: false, reason: "Putting a meeting on hold requires a reason and a follow-up date." };
  }
  if (to === "cancelled" && !ctx.cancelReason?.trim()) return { ok: false, reason: "Cancelling requires a reason." };
  return { ok: true };
}
