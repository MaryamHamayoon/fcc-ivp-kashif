// @vitest-environment node
import {
  ACTIVE_STATUSES,
  PIPELINE_ORDER,
  allowedTransitions,
  canTransition,
  isTerminal,
  resumeTarget,
} from "@/lib/domain/status-machine";

const ctx = { hasAcceptedDate: true };

describe("status machine", () => {
  it("follows the forward path", () => {
    expect(canTransition("requested", "developing", ctx)).toEqual({ ok: true });
    expect(canTransition("developing", "clearance", ctx)).toEqual({ ok: true });
    expect(canTransition("clearance", "confirmed", ctx)).toEqual({ ok: true });
    expect(canTransition("confirmed", "completed", ctx)).toEqual({ ok: true });
    expect(canTransition("completed", "closed", ctx)).toEqual({ ok: true });
  });

  it("allows developing → confirmed when no clearance is needed", () => {
    expect(canTransition("developing", "confirmed", ctx).ok).toBe(true);
  });

  it("blocks skips and nonsensical backwards moves", () => {
    expect(canTransition("requested", "confirmed", ctx).ok).toBe(false);
    expect(canTransition("closed", "developing", ctx).ok).toBe(false);
    expect(canTransition("cancelled", "requested", ctx).ok).toBe(false);
    expect(canTransition("developing", "developing", ctx).ok).toBe(false);
  });

  it("requires an accepted date to confirm or complete", () => {
    expect(canTransition("developing", "confirmed", { hasAcceptedDate: false })).toEqual({
      ok: false,
      reason: "Confirming requires an accepted meeting date.",
    });
    expect(canTransition("confirmed", "completed", { hasAcceptedDate: false }).ok).toBe(false);
  });

  it("requires a reason and follow-up date to hold, and resumes to the previous state", () => {
    expect(canTransition("developing", "on_hold", { hasAcceptedDate: false }).ok).toBe(false);
    expect(
      canTransition("developing", "on_hold", {
        hasAcceptedDate: false,
        holdReason: "Awaiting their holidays",
        holdFollowUpAt: new Date("2026-09-15T12:00:00Z"),
      }).ok,
    ).toBe(true);
    expect(
      canTransition("completed", "on_hold", { hasAcceptedDate: true, holdReason: "x", holdFollowUpAt: new Date() }).ok,
    ).toBe(false);
    expect(resumeTarget("clearance")).toBe("clearance");
    expect(resumeTarget("on_hold")).toBe("developing");
    expect(resumeTarget(null)).toBe("developing");
  });

  it("requires a reason to cancel", () => {
    expect(canTransition("requested", "cancelled", { hasAcceptedDate: false }).ok).toBe(false);
    expect(canTransition("requested", "cancelled", { hasAcceptedDate: false, cancelReason: "Delegation withdrew" }).ok).toBe(true);
  });

  it("lists allowed transitions, terminal states, and orderings", () => {
    expect(allowedTransitions("confirmed")).toEqual(["completed", "developing", "on_hold", "cancelled"]);
    expect(allowedTransitions("closed")).toEqual([]);
    expect(isTerminal("closed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("on_hold")).toBe(false);
    expect(ACTIVE_STATUSES).toEqual(["requested", "developing", "clearance", "confirmed", "on_hold"]);
    expect(PIPELINE_ORDER).toEqual(["requested", "developing", "clearance", "confirmed", "completed", "closed"]);
  });
});
