import { AXIS_HEIGHT, LABEL_WIDTH, LANE_HEIGHT, layoutTimeline, PAD_BOTTOM, PAD_RIGHT, RADIUS, UNDATED_WIDTH } from "@/components/dossier/timeline";
import type { Timeline, TimelineMeeting } from "@/lib/domain/dossier";

const NOW = new Date("2026-08-29T14:00:00Z");
const meeting = (id: string, over: Partial<TimelineMeeting>): TimelineMeeting => ({ id, code: `IVP-${id}`, title: `Meeting ${id}`, status: "completed", date: new Date("2026-03-10T14:00:00Z"), participants: 6, laneId: "spectrum-sharing", fiscalYear: 2026, ...over });

const timeline: Timeline = {
  lanes: [
    { id: "spectrum-sharing", name: "Spectrum Sharing" },
    { id: "broadband-mapping", name: "Broadband Mapping" },
    { id: "other", name: "Other" },
  ],
  meetings: [
    meeting("a", { date: new Date("2026-09-15T14:00:00Z"), participants: 12, status: "confirmed" }),
    meeting("b", { date: new Date("2024-05-02T14:00:00Z"), participants: 0, fiscalYear: 2024 }),
    meeting("c", { date: new Date("2025-11-20T14:00:00Z"), participants: 3, laneId: "broadband-mapping" }),
    meeting("d", { date: null, participants: 0, laneId: "other", status: "requested", fiscalYear: 2027 }),
    meeting("e", { date: null, participants: 2, laneId: "other", status: "developing", fiscalYear: 2027 }),
  ],
  firstFy: 2024,
  lastFy: 2027,
};

describe("layoutTimeline", () => {
  const layout = layoutTimeline({ timeline, width: 800, now: NOW });

  it("lays one contiguous band per fiscal year from the first to the last, labelled the way the app says years", () => {
    expect(layout.bands.map((b) => b.label)).toEqual(["FY24", "FY25", "FY26", "FY27"]);
    expect(layout.bands[0]!.x0).toBeCloseTo(LABEL_WIDTH, 5);
    expect(layout.bands.at(-1)!.x1).toBeCloseTo(layout.plotRight, 5);
    for (let i = 1; i < layout.bands.length; i++) expect(layout.bands[i]!.x0).toBeCloseTo(layout.bands[i - 1]!.x1, 0);
    for (const b of layout.bands) expect(b.x1).toBeGreaterThan(b.x0);
  });

  it("stacks a row per lane below the axis and sizes the plot to them", () => {
    expect(layout.rows.map((r) => r.y)).toEqual([AXIS_HEIGHT + LANE_HEIGHT / 2, AXIS_HEIGHT + LANE_HEIGHT * 1.5, AXIS_HEIGHT + LANE_HEIGHT * 2.5]);
    expect(layout.height).toBe(AXIS_HEIGHT + 3 * LANE_HEIGHT + PAD_BOTTOM);
  });

  it("places dated marks left to right by date, in their lane's row", () => {
    const dated = layout.marks.filter((m) => m.meeting.date !== null);
    expect(dated.map((m) => m.meeting.id)).toEqual(["b", "c", "a"]);
    for (let i = 1; i < dated.length; i++) expect(dated[i]!.cx).toBeGreaterThan(dated[i - 1]!.cx);
    for (const m of dated) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.plotLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.plotRight);
    }
    expect(dated.find((m) => m.meeting.id === "c")!.cy).toBe(layout.rows[1]!.y);
  });

  it("keeps a column at the right edge for meetings without a date and spreads those in one lane across it", () => {
    expect(layout.plotRight).toBe(800 - PAD_RIGHT - UNDATED_WIDTH);
    expect(layout.undated).toEqual({ x0: layout.plotRight, x1: 800 - PAD_RIGHT });
    const undated = layout.marks.filter((m) => m.meeting.date === null);
    expect(undated.map((m) => m.meeting.id)).toEqual(["d", "e"]);
    for (const m of undated) {
      expect(m.cx).toBeGreaterThan(layout.plotRight);
      expect(m.cx).toBeLessThan(800 - PAD_RIGHT);
      expect(m.cy).toBe(layout.rows[2]!.y);
    }
    expect(undated[1]!.cx).toBeGreaterThan(undated[0]!.cx);
  });

  it("sizes marks by participants on a square-root scale between the smallest and largest radius", () => {
    const r = Object.fromEntries(layout.marks.map((m) => [m.meeting.id, m.r]));
    expect(r.b).toBe(RADIUS[0]);
    expect(r.a).toBe(RADIUS[1]);
    expect(r.c).toBeGreaterThan(RADIUS[0]);
    expect(r.c).toBeLessThan(RADIUS[1]);
    expect(r.c).toBeCloseTo(RADIUS[0] + (RADIUS[1] - RADIUS[0]) * Math.sqrt(3 / 12), 5);
  });

  it("marks today when the axis reaches it", () => {
    expect(layout.today).not.toBeNull();
    expect(layout.today!).toBeGreaterThan(layout.bands[2]!.x0);
    expect(layout.today!).toBeLessThan(layout.bands[2]!.x1);
    expect(layoutTimeline({ timeline: { ...timeline, firstFy: 2022, lastFy: 2023 }, width: 800, now: NOW }).today).toBeNull();
  });

  it("uses the whole width when every meeting has a date", () => {
    const dated = { ...timeline, meetings: timeline.meetings.filter((m) => m.date !== null) };
    const l = layoutTimeline({ timeline: dated, width: 640, now: NOW });
    expect(l.undated).toBeNull();
    expect(l.plotRight).toBe(640 - PAD_RIGHT);
    expect(l.marks).toHaveLength(3);
  });

  it("lays out an empty timeline as one year and no rows", () => {
    const l = layoutTimeline({ timeline: { lanes: [], meetings: [], firstFy: 2026, lastFy: 2026 }, width: 600, now: NOW });
    expect(l.bands.map((b) => b.label)).toEqual(["FY26"]);
    expect(l.rows).toEqual([]);
    expect(l.marks).toEqual([]);
    expect(l.height).toBe(AXIS_HEIGHT + PAD_BOTTOM);
  });
});
