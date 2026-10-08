// @vitest-environment node
import { createSessionToken, getAuthSecret, SESSION_COOKIE, verifySessionToken, type SessionUser } from "@/lib/auth/session";

const user: SessionUser = { id: "usr_priya", name: "Priya Natarajan", email: "priya.natarajan@fcc.gov", role: "coordinator", regionIds: [], staffId: "stf_priya", bureauCode: "OIA" };
const secret = "test-secret-at-least-32-characters-long!!";

describe("session tokens", () => {
  it("round-trips a user through a signed token", async () => {
    const token = await createSessionToken(user, secret);
    expect(token.split(".")).toHaveLength(3);
    expect(await verifySessionToken(token, secret)).toEqual(user);
    expect(SESSION_COOKIE).toBe("ivp_session");
  });

  it("rejects tampered tokens and wrong secrets", async () => {
    const token = await createSessionToken(user, secret);
    const [h, p, sig] = token.split(".") as [string, string, string];
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), role: "admin" })).toString("base64url");
    expect(await verifySessionToken(`${h}.${forgedPayload}.${sig}`, secret)).toBeNull();
    expect(await verifySessionToken(token, "another-secret-that-is-also-long-enough")).toBeNull();
    expect(await verifySessionToken("garbage", secret)).toBeNull();
  });

  it("expires", async () => {
    vi.useFakeTimers({ now: new Date("2026-08-29T14:00:00Z") });
    try {
      const token = await createSessionToken(user, secret, 60);
      expect(await verifySessionToken(token, secret)).not.toBeNull();
      vi.setSystemTime(new Date("2026-08-29T14:02:00Z"));
      expect(await verifySessionToken(token, secret)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses AUTH_SECRET, falling back to a dev default outside production", () => {
    const prev = { secret: process.env.AUTH_SECRET, env: process.env.NODE_ENV };
    try {
      process.env.AUTH_SECRET = "configured-secret-value-with-enough-length";
      expect(getAuthSecret()).toBe("configured-secret-value-with-enough-length");
      delete process.env.AUTH_SECRET;
      expect(getAuthSecret()).toMatch(/dev/);
      Object.assign(process.env, { NODE_ENV: "production" });
      expect(() => getAuthSecret()).toThrow(/AUTH_SECRET/);
    } finally {
      if (prev.secret === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = prev.secret;
      Object.assign(process.env, { NODE_ENV: prev.env });
    }
  });
});
