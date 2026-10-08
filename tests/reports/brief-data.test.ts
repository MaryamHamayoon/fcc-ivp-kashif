// @vitest-environment node
import type { ReportMeeting } from "@/lib/domain/reports";
import { BRIEF_LIST_LIMIT, BRIEF_RANK_LIMIT, briefFor } from "@/lib/reports/brief-data";
import { buildReports } from "@/lib/services/reports";
import { makeReportDataset, REPORT_NOW, reportMeetings } from "@/tests/fixtures/reports";

const DAY = 86_400_000;
const at = (days: number) => new Date(REPORT_NOW.getTime() + days * DAY);
const base = reportMeetings[0]!;
const meeting = (n: number, over: Partial<ReportMeeting>): ReportMeeting => ({ ...base, id: `x${n}`, code: `IVP-2026-${String(n).padStart(3, "0")}`, ...over });

const brief = (meetings: ReportMeeting[]) => {
  const ds = makeReportDataset({ meetings });
  return briefFor(ds, buildReports(ds, "topic", "meetings"));
};

describe("briefFor", () => {
  it("names the year and the one before, keeps the headline and the four figures", () => {
    const b = brief(reportMeetings);
    expect(b.fy).toBe(2026);
    expect(b.fyLabel).toBe("FY26");
    expect(b.priorLabel).toBe("FY25");
    expect(b.generatedAt).toEqual(REPORT_NOW);
    expect(b.headline).not.toBe("");
    expect(b.figures.map((f) => f.id)).toEqual(["engagements", "countries", "participants", "completed"]);
    expect(b.meetingCount).toBe(reportMeetings.length);
  });

  it("lists what is next: dated, still ahead, inside thirty days, soonest first, at most five", () => {
    const b = brief([
      meeting(1, { status: "confirmed", scheduledStart: at(20) }),
      meeting(2, { status: "developing", scheduledStart: at(3) }),
      meeting(3, { status: "completed", scheduledStart: at(2) }),
      meeting(4, { status: "confirmed", scheduledStart: at(31) }),
      meeting(5, { status: "requested", scheduledStart: at(10) }),
      meeting(6, { status: "clearance", scheduledStart: at(1) }),
      meeting(7, { status: "confirmed", scheduledStart: at(-1) }),
      meeting(8, { status: "confirmed", scheduledStart: null }),
      meeting(9, { status: "confirmed", scheduledStart: at(29) }),
      meeting(10, { status: "confirmed", scheduledStart: at(5) }),
    ]);
    expect(b.next).toHaveLength(BRIEF_LIST_LIMIT);
    expect(b.next.map((m) => m.meetingId)).toEqual(["x6", "x2", "x10", "x5", "x1"]);
    expect(b.next[0]).toMatchObject({ code: "IVP-2026-006", status: "clearance", countryName: base.countryName, orgName: base.orgName });
  });

  it("lists what is stuck: the longest waits first, ties by code, at most five", () => {
    const wait = (label: string, businessDays: number) => ({ label, businessDays });
    const b = brief([
      meeting(1, { waiting: wait("Bureau expert", 3) }),
      meeting(2, { waiting: wait("OIA", 9) }),
      meeting(3, { waiting: null }),
      meeting(4, { waiting: wait("Delegation", 1) }),
      meeting(5, { waiting: wait("Delegation", 9) }),
      meeting(6, { waiting: wait("OIA", 5) }),
      meeting(7, { waiting: wait("Regional lead", 12) }),
    ]);
    expect(b.stuck).toHaveLength(BRIEF_LIST_LIMIT);
    expect(b.stuck.map((m) => [m.code, m.days])).toEqual([
      ["IVP-2026-007", 12],
      ["IVP-2026-002", 9],
      ["IVP-2026-005", 9],
      ["IVP-2026-006", 5],
      ["IVP-2026-001", 3],
    ]);
    expect(b.stuck[0]).toMatchObject({ meetingId: "x7", who: "Regional lead", title: base.title });
  });

  it("caps the rankings, drops empty categories and formats, and keeps regions beside countries", () => {
    const b = brief(reportMeetings);
    expect(b.where.countries.length).toBeLessThanOrEqual(BRIEF_RANK_LIMIT);
    expect(b.where.regions.length).toBeLessThanOrEqual(BRIEF_RANK_LIMIT);
    expect(b.what.length).toBeLessThanOrEqual(BRIEF_RANK_LIMIT);
    expect(b.where.countries.length).toBeGreaterThan(0);
    for (const c of b.participants) expect(c.planned + c.actual).toBeGreaterThan(0);
    for (const f of b.formats) expect(f.count).toBeGreaterThan(0);
    expect(b.formats.map((f) => f.key)).toEqual(expect.arrayContaining(["virtual"]));
  });

  it("briefs an empty year without charts to draw", () => {
    const b = brief([]);
    expect(b.meetingCount).toBe(0);
    expect(b.next).toEqual([]);
    expect(b.stuck).toEqual([]);
    expect(b.where.countries).toEqual([]);
    expect(b.participants).toEqual([]);
    expect(b.formats).toEqual([]);
    expect(b.figures.every((f) => f.value === 0)).toBe(true);
  });
});
