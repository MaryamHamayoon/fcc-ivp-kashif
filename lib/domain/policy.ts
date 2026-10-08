import type { Role } from "./types";

/**
 * Role-based access control as a pure function. Enforced in every server action and route
 * handler; also used by the UI to hide controls the user cannot use.
 */

export type Action =
  | "meeting.read"
  | "meeting.create"
  | "meeting.update"
  | "meeting.transition"
  | "activity.create"
  | "expert.respond"
  | "document.add"
  | "directory.read"
  | "reports.read"
  | "admin.manage";

export type PolicyUser = { id: string; role: Role; regionIds: string[]; staffId: string | null };

export type Subject = { kind: "meeting"; regionId: string | null; assignedStaffIds: string[] } | { kind: "system" };

export type ReadableScope = { all: true } | { staffId: string };

const READ_ACTIONS: readonly Action[] = ["meeting.read", "directory.read", "reports.read"];

function inRegion(user: PolicyUser, subject: Subject): boolean {
  return subject.kind === "meeting" && subject.regionId !== null && user.regionIds.includes(subject.regionId);
}

function assigned(user: PolicyUser, subject: Subject): boolean {
  return subject.kind === "meeting" && user.staffId !== null && subject.assignedStaffIds.includes(user.staffId);
}

const RULES: Record<Role, (action: Action, subject: Subject, user: PolicyUser) => boolean> = {
  admin: () => true,
  coordinator: (action) => action !== "admin.manage",
  regional_lead: (action, subject, user) => {
    if (READ_ACTIONS.includes(action) || action === "meeting.create") return true;
    if (action === "admin.manage" || action === "expert.respond") return false;
    return inRegion(user, subject); // update, transition, activity.create, document.add
  },
  expert: (action, subject, user) => {
    if (action === "directory.read") return true;
    if (action === "meeting.read" || action === "expert.respond" || action === "document.add") return assigned(user, subject);
    return false;
  },
  executive: (action) => READ_ACTIONS.includes(action),
  viewer: (action) => action === "meeting.read" || action === "directory.read",
};

export function can(user: PolicyUser, action: Action, subject: Subject): boolean {
  return RULES[user.role](action, subject, user);
}

/** How repositories should restrict list/detail reads for this user. */
export function readableScope(user: PolicyUser): ReadableScope {
  if (user.role === "expert") return { staffId: user.staffId ?? "" };
  return { all: true };
}
