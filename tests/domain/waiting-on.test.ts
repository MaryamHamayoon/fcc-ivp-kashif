// @vitest-environment node
import { ageBand, computeWaitingOn } from "@/lib/domain/waiting-on";
import type { WaitingOn } from "@/lib/domain/types";

const now = new Date("2026-08-29T14:00:00Z");

const a = (id: string, waitingOn: WaitingOn, occurredAt: string, resolvedAt: string | null = null, label: string | null = null) => ({
  id,
  waitingOn,
  waitingOnLabel: label,
  occurredAt: new Date(occurredAt),
  resolvedAt: resolvedAt ? new Date(resolvedAt) : null,
  nextAction: null,
  nextActionDueAt: null,
});

describe("waiting-on", () => {
  it("bands ages: 0–5 ok, 6–14 warn, 15+ alert", () => {
    expect(ageBand(0)).toBe("ok");
    expect(ageBand(5)).toBe("ok");
    expect(ageBand(6)).toBe("warn");
    expect(ageBand(14)).toBe("warn");
    expect(ageBand(15)).toBe("alert");
  });

  it("returns the latest unresolved waiting activity with its business-day age", () => {
    const w = computeWaitingOn(
      [
        a("1", "expert", "2026-07-16T12:00:00Z", "2026-07-23T12:00:00Z"),
        a("2", "visitor", "2026-08-06T12:00:00Z", null, "ARTCI POC"),
        a("3", "none", "2026-08-10T12:00:00Z"),
      ],
      now,
    );
    expect(w?.activityId).toBe("2");
    expect(w?.who).toBe("visitor");
    expect(w?.label).toBe("ARTCI POC");
    expect(w?.businessDays).toBe(16);
    expect(w?.band).toBe("alert");
    expect(w?.since.toISOString()).toBe("2026-08-06T12:00:00.000Z");
  });

  it("prefers the most recent unresolved entry when several are pending", () => {
    const w = computeWaitingOn(
      [a("old", "expert", "2026-08-03T12:00:00Z", null, "Space Bureau"), a("new", "visitor", "2026-08-25T12:00:00Z", null, "NCC POC")],
      now,
    );
    expect(w?.activityId).toBe("new");
    expect(w?.businessDays).toBe(3); // Tue Aug 25 → Sat Aug 29: Wed, Thu, Fri
    expect(w?.band).toBe("ok");
  });

  it("returns null when nothing is pending", () => {
    expect(computeWaitingOn([a("1", "visitor", "2026-08-06T12:00:00Z", "2026-08-07T12:00:00Z")], now)).toBeNull();
    expect(computeWaitingOn([], now)).toBeNull();
  });

  it("falls back to a generic label per target", () => {
    expect(computeWaitingOn([a("1", "expert", "2026-08-27T12:00:00Z")], now)?.label).toBe("FCC expert");
    expect(computeWaitingOn([a("1", "och", "2026-08-27T12:00:00Z")], now)?.label).toBe("Office of the Chairman");
  });

  it("carries the next action through", () => {
    const w = computeWaitingOn(
      [{ ...a("1", "visitor", "2026-08-27T12:00:00Z", null, "TRAI"), nextAction: "Ping Joseph", nextActionDueAt: new Date("2026-09-01T12:00:00Z") }],
      now,
    );
    expect(w?.nextAction).toBe("Ping Joseph");
    expect(w?.nextActionDueAt?.toISOString()).toBe("2026-09-01T12:00:00.000Z");
  });
});
