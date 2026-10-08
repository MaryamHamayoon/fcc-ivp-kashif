"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GATE_COOKIE, GATE_TTL_SECONDS, gateToken } from "@/lib/auth/gate";
import { demoIdentityProvider } from "@/lib/auth/identity";
import { createSessionToken, getAuthSecret, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next-path";
import { getDb } from "@/lib/db/client";

const secureCookies = () => process.env.NODE_ENV === "production";

export async function signInAs(formData: FormData): Promise<void> {
  const userId = String(formData.get("userId") ?? "");
  const next = safeNext(formData.get("next"));
  const user = await demoIdentityProvider(await getDb()).authenticate({ userId });
  if (!user) redirect(`/login?error=account&next=${encodeURIComponent(next)}`);
  const token = await createSessionToken(user, getAuthSecret());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: SESSION_TTL_SECONDS });
  redirect(next);
}

export async function enterPasscode(formData: FormData): Promise<void> {
  const passcode = String(formData.get("passcode") ?? "").trim();
  const next = safeNext(formData.get("next"));
  const expected = process.env.SITE_PASSCODE;
  if (!expected || passcode !== expected) redirect(`/login?gate=1&error=passcode&next=${encodeURIComponent(next)}`);
  const store = await cookies();
  store.set(GATE_COOKIE, await gateToken(passcode, getAuthSecret()), { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: GATE_TTL_SECONDS });
  redirect(`/login?next=${encodeURIComponent(next)}`);
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
