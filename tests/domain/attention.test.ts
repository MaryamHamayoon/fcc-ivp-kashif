// @vitest-environment node
import { computeAttention, type AttentionMeeting } from "@/lib/domain/attention";

const now = new Date("2026-08-29T14:00:00Z");

function meeting(overrides: Partial<AttentionMeeting> & { id: string }): AttentionMeeting {
  return {
    code: `IVP-2026-${overrides.id.padStart(3, "0")}`,
    title: "Spectrum briefing",
    orgName: "ARTCI",
    countryName: "Côte d'Ivoire",
    leadName: "Priya Raman",
    status: "developing",
    scheduledStart: null,
    requestedAt: new Date("2026-06-01T12:00:00Z"),
    holdFollowUpAt: null,
    updatedAt: new Date("2026-08-28T12:00:00Z"),
    readinessPercent: 100,
    expertsPending: 0,
    waiting: null,
    actualCountsEntered: true,
    ...overrides,
  };
}

const waitingAlert = {
  who: "visitor" as const,
  label: "ARTCI POC",
  since: new Date("2026-08-06T12:00:00Z"),
  businessDays: 16,
  band: "alert" as const,
  activityId: "a1",
  nextAction: null,
  nextActionDueAt: null,
};

describe("attention rules", () => {
  const items = computeAttention(
    [
      meeting({ id: "1", waiting: waitingAlert }),
      meeting({ id: "2", status: "confirmed", scheduledStart: new Date("2026-09-08T14:00:00Z"), expertsPending: 2, readinessPercent: 60 }),
      meeting({ id: "3", status: "on_hold", holdFollowUpAt: new Date("2026-08-28T12:00:00Z") }),
      meeting({ id: "4", status: "requested", updatedAt: new Date("2026-08-21T12:00:00Z") }),
      meeting({ id: "5", status: "completed", scheduledStart: new Date("2026-08-26T14:00:00Z"), actualCountsEntered: false }),
      meeting({ id: "6", status: "confirmed", scheduledStart: new Date("2026-10-20T14:00:00Z"), expertsPending: 1, readinessPercent: 40 }),
    ],
    now,
  );

  it("raises one item per triggered rule", () => {
    const kinds = items.map((i) => `${i.meetingId}:${i.kind}`).sort();
    expect(kinds).toEqual([
      "1:waiting_aging",
      "2:experts_unconfirmed",
      "2:not_ready",
      "3:hold_overdue",
      "4:request_stale",
      "5:counts_missing",
    ]);
  });

  it("assigns severities", () => {
    const byKey = Object.fromEntries(items.map((i) => [`${i.meetingId}:${i.kind}`, i]));
    expect(byKey["1:waiting_aging"]?.severity).toBe("alert");
    expect(byKey["2:experts_unconfirmed"]?.severity).toBe("warn"); // 10 days out
    expect(byKey["2:not_ready"]?.severity).toBe("warn");
    expect(byKey["3:hold_overdue"]?.severity).toBe("warn");
    expect(byKey["4:request_stale"]?.severity).toBe("info");
    expect(byKey["5:counts_missing"]?.severity).toBe("info");
  });

  it("escalates to alert inside seven days", () => {
    const soon = computeAttention(
      [meeting({ id: "9", status: "confirmed", scheduledStart: new Date("2026-09-02T14:00:00Z"), expertsPending: 1, readinessPercent: 80 })],
      now,
    );
    expect(soon.map((i) => i.severity)).toEqual(["alert", "alert"]);
  });

  it("orders alerts first, then warnings, then info", () => {
    const sev = items.map((i) => i.severity);
    expect(sev).toEqual(["alert", "warn", "warn", "warn", "info", "info"]);
    expect(items[0]?.kind).toBe("waiting_aging");
  });

  it("links to the record and describes the situation", () => {
    for (const i of items) expect(i.href).toBe(`/meetings/${i.meetingId}`);
    expect(items[0]?.detail).toBe("Waiting on ARTCI POC · 16 business days");
    expect(items[0]?.ageDays).toBe(16);
    expect(items[0]?.title).toBe("ARTCI · Côte d'Ivoire");
  });

  it("ignores a waiting state that is not yet aged", () => {
    const fresh = computeAttention([meeting({ id: "7", waiting: { ...waitingAlert, businessDays: 3, band: "ok" } })], now);
    expect(fresh).toEqual([]);
  });
});
