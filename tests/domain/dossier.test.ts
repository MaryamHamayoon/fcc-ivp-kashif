import { BRIEFER_LIMIT, buildDossier, MATERIAL_LIMIT, OTHER_LANE, type StaffInfo, TIMELINE_LANE_LIMIT } from "@/lib/domain/dossier";
import { makeLibraryItem } from "@/tests/fixtures/documents";
import { FIXTURE_NOW, makeListItem } from "@/tests/fixtures/meetings";

const topic = (id: string) => ({ id, name: id.replace(/-/g, " ") });
const expert = (staffId: string, status: "confirmed" | "requested" | "declined" = "confirmed", name = staffId) => ({ id: `mex_${staffId}_${Math.random()}`, staffId, name, bureauCode: null, status, role: "briefer" as const });

/** Six meetings across three fiscal years: four counted, one in play but undated, one cancelled. */
const meetings = [
  makeListItem({ id: "a", code: "IVP-2026-041", status: "confirmed", scheduledStart: new Date("2026-09-15T14:00:00Z"), fiscalYear: 2026, participantTotal: 12, topics: [topic("spectrum-sharing"), topic("spectrum-auctions")], experts: [expert("stf_dana"), expert("stf_tomas")] }),
  makeListItem({ id: "b", code: "IVP-2026-012", status: "completed", scheduledStart: new Date("2026-03-10T14:00:00Z"), fiscalYear: 2026, participantTotal: 8, topics: [topic("spectrum-sharing")], experts: [expert("stf_dana"), expert("stf_lee", "requested")] }),
  makeListItem({ id: "c", code: "IVP-2026-004", status: "closed", scheduledStart: new Date("2025-11-20T14:00:00Z"), fiscalYear: 2026, participantTotal: 5, topics: [topic("broadband-mapping")], experts: [expert("stf_tomas")] }),
  makeListItem({ id: "d", code: "IVP-2027-001", status: "requested", scheduledStart: null, nextCandidate: new Date("2026-10-05T14:00:00Z"), fiscalYear: 2027, participantTotal: 0, topics: [topic("orbital-debris")], experts: [] }),
  makeListItem({ id: "e", code: "IVP-2026-020", status: "cancelled", scheduledStart: new Date("2026-01-05T14:00:00Z"), fiscalYear: 2026, participantTotal: 4, topics: [], experts: [expert("stf_dana", "declined")] }),
  makeListItem({ id: "f", code: "IVP-2024-030", status: "completed", scheduledStart: new Date("2024-05-02T14:00:00Z"), fiscalYear: 2024, participantTotal: 9, topics: [topic("spectrum-sharing"), topic("ngso-systems")], experts: [expert("stf_dana")] }),
];

const staff = new Map<string, StaffInfo>([
  ["stf_dana", { name: "Dana Whitfield", bureauCode: "OEA", bureauName: "Office of Economics and Analytics" }],
  ["stf_tomas", { name: "Tomas Lindqvist", bureauCode: "SB", bureauName: "Space Bureau" }],
]);

const HREF = "/documents?countryCode=CI";
const build = (over: Parameters<typeof buildDossier>[0] = meetings, documents: Parameters<typeof buildDossier>[1] = []) => buildDossier(over, documents, staff, FIXTURE_NOW, HREF);

describe("buildDossier", () => {
  describe("figures", () => {
    it("counts engagements all time and this fiscal year, sums their participants, brackets first and last", () => {
      const { figures } = build();
      expect(figures.fy).toBe(2026);
      expect(figures.engagements).toBe(4);
      expect(figures.engagementsFy).toBe(3);
      expect(figures.participants).toBe(12 + 8 + 5 + 9);
      expect(figures.firstAt).toEqual(new Date("2024-05-02T14:00:00Z"));
      expect(figures.lastAt).toEqual(new Date("2026-03-10T14:00:00Z"));
    });

    it("names the next meeting: the earliest future date still in play, a candidate date counting", () => {
      expect(build().figures.next).toEqual({ id: "a", code: "IVP-2026-041", start: new Date("2026-09-15T14:00:00Z"), status: "confirmed" });
      const later = meetings.map((m) => (m.id === "a" ? { ...m, scheduledStart: new Date("2026-08-01T14:00:00Z") } : m));
      expect(build(later).figures.next).toEqual({ id: "d", code: "IVP-2027-001", start: new Date("2026-10-05T14:00:00Z"), status: "requested" });
      const nothingAhead = later.filter((m) => m.id !== "d");
      expect(build(nothingAhead).figures.next).toBeNull();
    });
  });

  describe("timeline", () => {
    it("lays the top topics out as lanes, Other last, files each meeting under its first lane, and drops a lane nothing lands in", () => {
      const { timeline } = build();
      // "ngso-systems" and "spectrum-auctions" are topics here too, but every meeting on them sits
      // under spectrum-sharing first, so their rows would be empty and are not drawn.
      expect(timeline.lanes.map((l) => l.id)).toEqual(["spectrum-sharing", "broadband-mapping", OTHER_LANE]);
      expect(timeline.lanes.at(-1)).toEqual({ id: OTHER_LANE, name: "Other" });
      const lane = Object.fromEntries(timeline.meetings.map((m) => [m.id, m.laneId]));
      expect(lane).toEqual({ a: "spectrum-sharing", b: "spectrum-sharing", c: "broadband-mapping", d: OTHER_LANE, e: OTHER_LANE, f: "spectrum-sharing" });
    });

    it("caps the lanes at five topics and leaves Other out when nothing needs it", () => {
      const many = Array.from({ length: 7 }, (_, i) => makeListItem({ id: `t${i}`, status: "completed", scheduledStart: new Date(`2026-0${(i % 6) + 1}-10T14:00:00Z`), topics: [topic(`topic-${i}`), topic("spectrum-sharing")] }));
      const { timeline } = build(many);
      expect(timeline.lanes).toHaveLength(TIMELINE_LANE_LIMIT);
      expect(timeline.lanes[0]!.id).toBe("spectrum-sharing");
      expect(timeline.lanes.some((l) => l.id === OTHER_LANE)).toBe(false);
      // A meeting sits in the first of its own topics that made a lane; the rest fall back to the shared one.
      expect(timeline.meetings.map((m) => m.laneId)).toEqual(["topic-0", "topic-1", "topic-2", "topic-3", "spectrum-sharing", "spectrum-sharing", "spectrum-sharing"]);
    });

    it("dates a meeting by its schedule, then its candidate, else leaves it undated, and spans the years to the next one", () => {
      const { timeline } = build();
      const byId = Object.fromEntries(timeline.meetings.map((m) => [m.id, m]));
      expect(byId.a).toMatchObject({ code: "IVP-2026-041", title: "Spectrum sharing study visit", status: "confirmed", date: new Date("2026-09-15T14:00:00Z"), participants: 12, fiscalYear: 2026 });
      expect(byId.d!.date).toEqual(new Date("2026-10-05T14:00:00Z"));
      expect(build(meetings.map((m) => (m.id === "d" ? { ...m, nextCandidate: null } : m))).timeline.meetings.find((m) => m.id === "d")!.date).toBeNull();
      expect(timeline.firstFy).toBe(2024);
      expect(timeline.lastFy).toBe(2027);
    });

    it("ends at the last year on file when nothing lies ahead", () => {
      const past = meetings.filter((m) => m.id !== "a" && m.id !== "d");
      expect(build(past).timeline.lastFy).toBe(2026);
    });
  });

  describe("briefers", () => {
    it("counts confirmed experts per person, names them from the directory, most asked first", () => {
      const { briefers } = build();
      expect(briefers).toEqual([
        { staffId: "stf_dana", name: "Dana Whitfield", bureauCode: "OEA", bureauName: "Office of Economics and Analytics", count: 3 },
        { staffId: "stf_tomas", name: "Tomas Lindqvist", bureauCode: "SB", bureauName: "Space Bureau", count: 2 },
      ]);
    });

    it("falls back to the assignment's own name when the directory has no row, and caps the list at eight", () => {
      const crowd = Array.from({ length: 10 }, (_, i) => expert(`stf_x${i}`, "confirmed", `Expert ${i}`));
      const { briefers } = build([makeListItem({ id: "z", experts: crowd.map((e) => ({ ...e, bureauCode: "WTB" })) })]);
      expect(briefers).toHaveLength(BRIEFER_LIMIT);
      expect(briefers[0]).toEqual({ staffId: "stf_x0", name: "Expert 0", bureauCode: "WTB", bureauName: null, count: 1 });
      expect(briefers.map((b) => b.name)).toEqual([...briefers.map((b) => b.name)].sort((a, b) => a.localeCompare(b, "en")));
    });
  });

  describe("materials", () => {
    it("shelves current documents reusable first then newest, capped at six, and counts them all", () => {
      const docs = Array.from({ length: 9 }, (_, i) => makeLibraryItem({ id: `doc${i}`, title: `Document ${i}`, reusable: i % 3 === 0, addedAt: new Date(`2026-0${(i % 8) + 1}-01T00:00:00Z`) }));
      docs.push(makeLibraryItem({ id: "old", title: "Superseded", isCurrent: false, reusable: true, addedAt: new Date("2026-08-30T00:00:00Z") }));
      const { materials, materialsTotal, materialsHref } = build(meetings, docs);
      expect(materialsTotal).toBe(9);
      expect(materialsHref).toBe(HREF);
      expect(materials).toHaveLength(MATERIAL_LIMIT);
      expect(materials.map((m) => m.id)).toEqual(["doc6", "doc3", "doc0", "doc7", "doc5", "doc4"]);
      expect(materials[0]).toMatchObject({ title: "Document 6", kind: "briefing_deck", kindLabel: "Briefing Deck", meetingId: "mtg_artci", meetingCode: "IVP-2026-041", reusable: true, preview: "pdf", scheme: "seed", mime: "application/pdf" });
    });
  });

  it("briefs nobody without complaint: zeros, no lanes, this year alone", () => {
    const d = build([]);
    expect(d.figures).toEqual({ engagements: 0, engagementsFy: 0, fy: 2026, participants: 0, firstAt: null, lastAt: null, next: null });
    expect(d.timeline).toEqual({ lanes: [], meetings: [], firstFy: 2026, lastFy: 2026 });
    expect(d.briefers).toEqual([]);
    expect(d.materials).toEqual([]);
    expect(d.materialsTotal).toBe(0);
  });
});
