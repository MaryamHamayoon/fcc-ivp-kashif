import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Action, type PolicyUser, type Subject } from "@/lib/domain/policy";
import { getAuthSecret, SESSION_COOKIE, verifySessionToken, type SessionUser } from "./session";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token, getAuthSecret());
}

/** Redirects to the sign-in page (remembering where the user was going) when signed out. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export function toPolicyUser(user: SessionUser): PolicyUser {
  return { id: user.id, role: user.role, regionIds: user.regionIds, staffId: user.staffId };
}

/** Requires a signed-in user who may perform `action`; otherwise shows the 403 page. */
export async function requireCan(action: Action, subject: Subject, next?: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!can(toPolicyUser(user), action, subject)) redirect("/forbidden");
  return user;
}
