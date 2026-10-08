// @vitest-environment node
import { GATE_COOKIE, gateSatisfied, gateToken } from "@/lib/auth/gate";

const secret = "gate-secret-with-plenty-of-length-for-hmac";

describe("site passcode gate", () => {
  it("is open when no passcode is configured", async () => {
    expect(await gateSatisfied(undefined, undefined, secret)).toBe(true);
    expect(await gateSatisfied(undefined, "", secret)).toBe(true);
    expect(GATE_COOKIE).toBe("ivp_gate");
  });

  it("accepts the token derived from the configured passcode and nothing else", async () => {
    const token = await gateToken("open-sesame", secret);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await gateSatisfied(token, "open-sesame", secret)).toBe(true);
    expect(await gateSatisfied(undefined, "open-sesame", secret)).toBe(false);
    expect(await gateSatisfied("not-the-token", "open-sesame", secret)).toBe(false);
    expect(await gateSatisfied(await gateToken("wrong", secret), "open-sesame", secret)).toBe(false);
    expect(await gateSatisfied(await gateToken("open-sesame", "other-secret-with-plenty-of-length"), "open-sesame", secret)).toBe(false);
  });
});
