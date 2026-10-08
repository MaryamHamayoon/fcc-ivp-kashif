/**
 * Optional site passcode for public hosting. The cookie stores an HMAC of
 * the passcode, so rotating SITE_PASSCODE invalidates every visitor at once. No passcode → open.
 */
export const GATE_COOKIE = "ivp_gate";
export const GATE_TTL_SECONDS = 30 * 24 * 60 * 60;

const encoder = new TextEncoder();

export async function gateToken(passcode: string, secret: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, encoder.encode(`gate:${passcode}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function gateSatisfied(cookieValue: string | undefined, passcode: string | undefined, secret: string): Promise<boolean> {
  if (!passcode) return true;
  if (!cookieValue) return false;
  return constantTimeEqual(cookieValue, await gateToken(passcode, secret));
}
