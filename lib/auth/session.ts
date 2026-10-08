import { jwtVerify, SignJWT } from "jose";
import { ROLES, type Role } from "@/lib/domain/types";

/**
 * Signed, httpOnly cookie sessions (HS256 via jose). Runs in the Node.js proxy and in server
 * components. Phase 4 swaps the demo identity provider for Entra ID / Windows auth; the session
 * shape stays the same.
 */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  regionIds: string[];
  staffId: string | null;
  bureauCode: string | null;
};

export const SESSION_COOKIE = "ivp_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ISSUER = "ivp";
const DEV_SECRET = "ivp-dev-secret-change-me";

const key = (secret: string) => new TextEncoder().encode(secret);

export async function createSessionToken(user: SessionUser, secret: string, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ u: user })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key(secret));
}

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object") return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u.id === "string" &&
    typeof u.name === "string" &&
    typeof u.email === "string" &&
    typeof u.role === "string" &&
    (ROLES as readonly string[]).includes(u.role) &&
    Array.isArray(u.regionIds) &&
    (u.staffId === null || typeof u.staffId === "string") &&
    (u.bureauCode === null || typeof u.bureauCode === "string")
  );
}

/** Returns the user for a valid, unexpired token; null for anything else (never throws). */
export async function verifySessionToken(token: string, secret: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, algorithms: ["HS256"] });
    const user = payload.u;
    return isSessionUser(user) ? { ...user, regionIds: user.regionIds.filter((r): r is string => typeof r === "string") } : null;
  } catch {
    return null;
  }
}

export function getAuthSecret(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured && configured.length >= 16) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production (32+ random characters).");
  }
  return DEV_SECRET;
}
