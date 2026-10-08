// @vitest-environment node
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { cardRange } from "@/lib/domain/reach";
import { OIA_REGIONS } from "@/lib/domain/regions";
import { COUNTED_STATUSES } from "@/lib/domain/tallies";
import { type DashboardData, getDashboardData } from "@/lib/services/dashboard";
import { getReachData } from "@/lib/services/reach";

const NOW = new Date("2026-08-29T14:00:00Z");
const DAY = 86_400_000;
const admin: PolicyUser = { id: "usr_dana", role: "admin", regionIds: [], staffId: null };
const expert: PolicyUser = { id: "usr_tomas", role: "expert", regionIds: [], staffId: "stf_tomas" };

let t: TestDb;
let data: DashboardData;

beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { now: NOW });
  data = await getDashboardData(t.db, { now: NOW, user: admin });
});
afterAll(async () => {
  await t.close();
});

async function countedInFy(fy: number): Promise<number> {
  const rows = await t.db
    .select({ id: s.meetings.id })
    .from(s.meetings)
    .where(and(eq(s.meetings.fiscalYear, fy), inArray(s.meetings.status, [...COUNTED_STATUSES])));
  return rows.length;
}

describe("dashboard data", () => {
  it("frames the current fiscal year", () => {
    expect(data.asOf).toEqual(NOW);
    expect(data.fiscalYear).toBe(2026);
  });

  it("counts engagements this fiscal year against last, month by month", async () => {
    const { meetingsFy } = data.kpis;
    expect(meetingsFy.value).toBe(await countedInFy(2026));
    expect(meetingsFy.prior).toBe(await countedInFy(2025));
    expect(meetingsFy.value).toBeGreaterThan(0);
    expect(meetingsFy.series).toHaveLength(12);
    expect(meetingsFy.series.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(meetingsFy.value);
    expect(meetingsFy.series[11]).toBe(0); // September has not happened yet
    expect(data.kpis.countriesFy.value).toBeGreaterThan(0);
    expect(data.kpis.participantsFy.value).toBeGreaterThan(0);
  });

  it("counts what is scheduled in the next 30 days", async () => {
    const rows = await t.db
      .select({ id: s.meetings.id })
      .from(s.meetings)
      .where(and(inArray(s.meetings.status, ["confirmed", "clearance", "developing"]), gte(s.meetings.scheduledStart, NOW), lte(s.meetings.scheduledStart, new Date(NOW.getTime() + 30 * DAY))));
    expect(rows.length).toBeGreaterThan(0);
    expect(data.kpis.upcoming30.value).toBe(rows.length);
    expect(data.kpis.upcoming30.series).toHaveLength(12);
  });

  it("gives the Global reach card both of its ranges, counted by the map's own functions", async () => {
    const full = await getReachData(t.db, { now: NOW, user: admin });
    expect(data.reach.next30).toEqual(cardRange(full, "next30", NOW));
    expect(data.reach.thisYear).toEqual(cardRange(full, "this", NOW));
    expect(data.reach.thisYear.countries.length).toBeGreaterThan(data.reach.next30.countries.length);
    expect(data.reach.next30.countries.length).toBeGreaterThan(0);
    expect(data.reach.thisYear.countries.every((c) => c.next.length <= 3)).toBe(true);
  });

  it("frames every region the card can focus, in OIA's order", () => {
    const names = data.reach.regions.map((r) => r.name);
    expect(names).toEqual(OIA_REGIONS.map((r) => r.name).filter((n) => names.includes(n)));
    expect(names).toEqual(expect.arrayContaining(["Africa", "Americas", "Asia-Pacific", "Europe"]));
    for (const { bounds } of data.reach.regions) {
      const [[west, south], [east, north]] = bounds;
      expect(east).toBeGreaterThan(west);
      expect(north).toBeGreaterThan(south);
    }
  });

  it("lists the next meetings on the calendar, soonest first, counted the way the Upcoming view counts them", async () => {
    const ahead = await t.db
      .select({ scheduledStart: s.meetings.scheduledStart })
      .from(s.meetings)
      .where(and(inArray(s.meetings.status, ["requested", "developing", "clearance", "confirmed"]), gte(s.meetings.scheduledStart, NOW)));
    expect(ahead.length).toBeGreaterThan(8);
    expect(data.upcomingTotal).toBe(ahead.length);
    expect(data.upcoming).toHaveLength(8);

    const starts = data.upcoming.map((m) => m.scheduledStart?.getTime() ?? Number.NaN);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[0]).toBe(Math.min(...ahead.map((row) => row.scheduledStart?.getTime() ?? Number.POSITIVE_INFINITY)));
    expect(starts.every((start) => start >= NOW.getTime())).toBe(true);
  });

  it("tallies cadence and bureaus for the year", () => {
    expect(data.analytics.cadence).toHaveLength(12);
    expect(data.analytics.cadence.map((c) => c.month)).toEqual(["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
    expect(data.analytics.bureaus.length).toBeGreaterThan(0);
  });

  it("splits the year's counted meetings by format, against last year's split", async () => {
    const { formats } = data.analytics;
    expect(formats.length).toBeGreaterThan(0);
    expect(formats.reduce((sum, f) => sum + f.count, 0)).toBe(await countedInFy(2026));
    expect(formats.reduce((sum, f) => sum + f.share, 0)).toBeCloseTo(1);
    expect(formats.reduce((sum, f) => sum + f.participants, 0)).toBe(data.kpis.participantsFy.value);
    // FY25 is seeded too, so every format carries a comparison.
    expect(formats.every((f) => f.priorShare !== null && f.deltaPoints !== null)).toBe(true);
  });

  it("traces the year's top topics back to the regions that raised them", () => {
    const { topics } = data.analytics;
    expect(topics.topics.length).toBeGreaterThan(0);
    expect(topics.topics.length).toBeLessThanOrEqual(8);
    expect(topics.regions.length).toBeGreaterThan(1);
    const linked = topics.links.reduce((sum, l) => sum + l.count, 0);
    expect(topics.topics.reduce((sum, topic) => sum + topic.meetings, 0)).toBe(linked);
    expect(topics.regions.reduce((sum, region) => sum + region.mentions, 0)).toBe(linked);
  });

  it("narrows everything to an expert's own briefings", async () => {
    const mine = await getDashboardData(t.db, { now: NOW, user: expert });
    expect(mine.kpis.meetingsFy.value).toBeLessThan(data.kpis.meetingsFy.value);
    expect(mine.upcomingTotal).toBeLessThan(data.upcomingTotal);
    expect(mine.upcoming.every((m) => m.experts.some((e) => e.staffId === expert.staffId))).toBe(true);
    expect(mine.analytics.topics.links.reduce((sum, l) => sum + l.count, 0)).toBeLessThan(data.analytics.topics.links.reduce((sum, l) => sum + l.count, 0));
    const theirs = new Set((await getReachData(t.db, { now: NOW, user: expert })).meetings.flatMap((m) => m.countries));
    expect(mine.reach.thisYear.countries.every((c) => theirs.has(c.cca2))).toBe(true);
    expect(mine.reach.thisYear.countries.length).toBeLessThan(data.reach.thisYear.countries.length);
  });

  it("can look back at a prior fiscal year", async () => {
    const last = await getDashboardData(t.db, { fy: 2025, now: NOW, user: admin });
    expect(last.fiscalYear).toBe(2025);
    expect(last.kpis.meetingsFy.value).toBe(await countedInFy(2025));
    expect(last.kpis.meetingsFy.series.reduce((a, b) => a + b, 0)).toBe(last.kpis.meetingsFy.value);
  });
});
