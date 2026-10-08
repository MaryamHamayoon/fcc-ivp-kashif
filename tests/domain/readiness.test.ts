// @vitest-environment node
import { computeReadiness, type ReadinessInput } from "@/lib/domain/readiness";

const base: ReadinessInput = {
  status: "confirmed",
  format: "virtual",
  hasAcceptedDate: true,
  experts: [{ status: "confirmed" }],
  documents: [{ kind: "agenda_final" }, { kind: "briefing_deck" }, { kind: "participant_list" }],
  namedParticipants: 0,
  location: null,
  virtualLink: "https://teams.example/abc",
};

describe("readiness", () => {
  it("is 100% and ready when everything is in place", () => {
    const r = computeReadiness(base);
    expect(r.percent).toBe(100);
    expect(r.isReady).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.items.map((i) => i.key)).toEqual(["dates", "experts", "agenda", "materials", "participants", "logistics"]);
  });

  it("flags pending experts and missing materials", () => {
    const r = computeReadiness({
      ...base,
      experts: [{ status: "confirmed" }, { status: "requested" }],
      documents: [{ kind: "agenda_final" }],
    });
    expect(r.percent).toBe(50);
    expect(r.missing.map((m) => m.key)).toEqual(["experts", "materials", "participants"]);
    expect(r.isReady).toBe(false);
  });

  it("needs at least one confirmed expert; declined ones do not count", () => {
    expect(computeReadiness({ ...base, experts: [] }).items.find((i) => i.key === "experts")?.done).toBe(false);
    expect(computeReadiness({ ...base, experts: [{ status: "declined" }] }).items.find((i) => i.key === "experts")?.done).toBe(false);
    expect(
      computeReadiness({ ...base, experts: [{ status: "confirmed" }, { status: "declined" }] }).items.find((i) => i.key === "experts")?.done,
    ).toBe(true);
  });

  it("accepts named participants instead of a participant-list document", () => {
    const r = computeReadiness({ ...base, documents: [{ kind: "agenda_final" }, { kind: "briefing_deck" }], namedParticipants: 4 });
    expect(r.items.find((i) => i.key === "participants")?.done).toBe(true);
  });

  it("requires a location for in-person and hybrid, and a link for virtual and hybrid", () => {
    const logistics = (input: ReadinessInput) => computeReadiness(input).items.find((i) => i.key === "logistics")?.done;
    expect(logistics({ ...base, format: "in_person", virtualLink: null, location: null })).toBe(false);
    expect(logistics({ ...base, format: "in_person", virtualLink: null, location: "Room TW-C305" })).toBe(true);
    expect(logistics({ ...base, format: "hybrid", location: "Room TW-C305", virtualLink: null })).toBe(false);
    expect(logistics({ ...base, format: "hybrid", location: "Room TW-C305" })).toBe(true);
    expect(logistics({ ...base, format: "virtual", virtualLink: null })).toBe(false);
  });

  it("is never 'ready' unless the status is confirmed", () => {
    expect(computeReadiness({ ...base, status: "developing" }).isReady).toBe(false);
    expect(computeReadiness({ ...base, status: "developing" }).percent).toBe(100);
  });
});
