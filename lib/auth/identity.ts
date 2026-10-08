import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/factory";
import * as s from "@/lib/db/schema";
import { type Role, ROLES } from "@/lib/domain/types";
import type { SessionUser } from "./session";

export type DemoAccount = { id: string; name: string; email: string; role: Role; title: string | null; bureauCode: string | null; blurb: string };

/**
 * Where identities come from. Phase 1 ships the demo provider (pick a seeded user);
 * Phase 4 adds Microsoft Entra ID (OIDC) or IIS Windows Authentication behind the same interface.
 */
export interface IdentityProvider {
  listDemoAccounts(): Promise<DemoAccount[]>;
  authenticate(input: { userId: string }): Promise<SessionUser | null>;
}

const ROLE_ORDER: Role[] = ["admin", "coordinator", "regional_lead", "expert", "executive", "viewer"];

/**
 * Who the sign-in screen signs you in as. Phase 1 has no directory to ask, so accepting the
 * system-use notice signs you in as the program administrator; roles come with SSO in Phase 4.
 * `as` names a role for the test suite (and the odd demo), never a person: the first active
 * account in that role is chosen, and an unknown role falls back to the administrator.
 */
export function defaultIdentity(accounts: readonly DemoAccount[], as?: string | null): DemoAccount | null {
  const wanted = (ROLES as readonly string[]).includes(as ?? "") ? (as as Role) : "admin";
  return accounts.find((account) => account.role === wanted) ?? accounts.find((account) => account.role === "admin") ?? accounts[0] ?? null;
}

export function demoIdentityProvider(db: Db): IdentityProvider {
  return {
    async listDemoAccounts() {
      const rows = await db.query.users.findMany({ where: eq(s.users.active, true), with: { staff: true } });
      return rows
        .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name, "en"))
        .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, title: u.staff?.title ?? null, bureauCode: u.bureauCode, blurb: u.blurb ?? "" }));
    },

    async authenticate({ userId }) {
      const u = await db.query.users.findFirst({ where: and(eq(s.users.id, userId), eq(s.users.active, true)) });
      if (!u) return null;
      return { id: u.id, name: u.name, email: u.email, role: u.role, regionIds: u.regionIds, staffId: u.staffId, bureauCode: u.bureauCode };
    },
  };
}
