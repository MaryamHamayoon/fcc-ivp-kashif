// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { MeetingListQuery } from "@/lib/api/schemas";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import { ACTIVE_STATUSES, MEETING_VIEWS } from "@/lib/domain/status-machine";

const NOW = new Date("2026-08-29T14:00:00Z");
const q = (over: Partial<Parameters<typeof MeetingListQuery.parse>[0] & Record<string, unknown>> = {}) => MeetingListQuery.parse(over);

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW });
}, 60_000);
afterAll(() => t.close());

describe("meetings repo · list", () => {
  it("default view lists active meetings only, dated before undated, with a correct total", async () => {
    const repo = makeMeetingsRepo(t.db);
    // An active meeting with no dates at all must sort last under the date sort.
    await t.db.insert(s.meetings).values({
      id: "mtg_undated",
      code: "IVP-2027-900",
      fiscalYear: 2027,
      sequence: 900,
      title: "Undated request",
      status: "requested",
      regionId: "af",
      primaryCountryCode: "CI",
      requestedAt: NOW,
    });
    // Two on-hold meetings whose accepted date has already lapsed — the exact stale-date bug:
    // they must sort into their own "past" bucket after every upcoming meeting, most recent first.
    await t.db.insert(s.meetings).values([
      {
        id: "mtg_pastnear",
        code: "IVP-2027-901",
        fiscalYear: 2027,
        sequence: 901,
        title: "On hold, date lapsed 5 days ago",
        status: "on_hold",
        regionId: "af",
        primaryCountryCode: "CI",
        requestedAt: NOW,
        scheduledStart: new Date(NOW.getTime() - 5 * 86_400_000),
      },
      {
        id: "mtg_pastfar",
        code: "IVP-2027-902",
        fiscalYear: 2027,
        sequence: 902,
        title: "On hold, date lapsed 20 days ago",
        status: "on_hold",
        regionId: "af",
        primaryCountryCode: "CI",
        requestedAt: NOW,
        scheduledStart: new Date(NOW.getTime() - 20 * 86_400_000),
      },
    ]);

    try {
      const { items, total } = await repo.list(q({ pageSize: 200 }), { all: true }, NOW);
      expect(total).toBe(items.length);
      expect(total).toBeGreaterThan(10);
      for (const m of items) expect(ACTIVE_STATUSES).toContain(m.status);

      // Bucket 1 — upcoming (accepted date >= now): ascending, soonest first.
      const upcoming = items.map((m, i) => ({ m, i })).filter(({ m }) => m.scheduledStart !== null && m.scheduledStart.getTime() >= NOW.getTime());
      const upcomingTimes = upcoming.map(({ m }) => m.scheduledStart!.getTime());
      expect(upcomingTimes).toEqual([...upcomingTimes].sort((a, b) => a - b));

      // Bucket 2 — lapsed accepted dates: most recent first, and strictly after every upcoming meeting.
      const pastNearRank = items.findIndex((m) => m.id === "mtg_pastnear");
      const pastFarRank = items.findIndex((m) => m.id === "mtg_pastfar");
      expect(pastNearRank).toBeGreaterThan(-1);
      expect(pastFarRank).toBeGreaterThan(-1);
      expect(pastNearRank).toBeLessThan(pastFarRank); // 5 days ago is more recent than 20 days ago
      const lastUpcomingRank = upcoming.length ? upcoming[upcoming.length - 1]!.i : -1;
      expect(pastNearRank).toBeGreaterThan(lastUpcomingRank);

      // Bucket 3 — no accepted date at all sorts last, after every dated meeting (accepted or lapsed).
      expect(items[items.length - 1]?.id).toBe("mtg_undated");
      const undatedIndex = items.findIndex((m) => m.scheduledStart === null && m.nextCandidate === null);
      expect(items.slice(undatedIndex).every((m) => m.scheduledStart === null && m.nextCandidate === null)).toBe(true);
      expect(pastFarRank).toBeLessThan(undatedIndex);
    } finally {
      await t.db.delete(s.meetings).where(eq(s.meetings.id, "mtg_undated"));
      await t.db.delete(s.meetings).where(eq(s.meetings.id, "mtg_pastnear"));
      await t.db.delete(s.meetings).where(eq(s.meetings.id, "mtg_pastfar"));
    }
  });

  it("filters by status, fiscal year and free text", async () => {
    const repo = makeMeetingsRepo(t.db);
    const onHold = await repo.list(q({ view: "all", status: ["on_hold"], pageSize: 200 }), { all: true }, NOW);
    const [counted] = await t.db.select({ n: sql<number>`count(*)::int` }).from(s.meetings).where(eq(s.meetings.status, "on_hold"));
    expect(onHold.total).toBe(counted!.n);
    expect(onHold.items.every((m) => m.status === "on_hold")).toBe(true);

    const fy25 = await repo.list(q({ view: "all", fy: 2025, pageSize: 200 }), { all: true }, NOW);
    expect(fy25.total).toBeGreaterThan(40);
    expect(fy25.items.every((m) => m.fiscalYear === 2025)).toBe(true);

    const [anyOrg] = await t.db.select({ id: s.organizations.id, shortName: s.organizations.shortName }).from(s.organizations).innerJoin(s.meetings, eq(s.meetings.organizationId, s.organizations.id)).limit(1);
    const text = anyOrg!.shortName!;
    const byText = await repo.list(q({ view: "all", q: text, pageSize: 200 }), { all: true }, NOW);
    expect(byText.total).toBeGreaterThan(0);
    for (const m of byText.items) {
      const hay = [m.orgName, m.orgShortName, m.title, m.countryName, m.code].join(" ").toLowerCase();
      expect(hay).toContain(text.toLowerCase());
    }
  });

  it("paginates and restricts an expert's scope to assigned meetings", async () => {
    const repo = makeMeetingsRepo(t.db);
    const page1 = await repo.list(q({ view: "all", pageSize: 10, page: 1 }), { all: true }, NOW);
    const page2 = await repo.list(q({ view: "all", pageSize: 10, page: 2 }), { all: true }, NOW);
    expect(page1.items).toHaveLength(10);
    expect(page2.items).toHaveLength(10);
    expect(page1.total).toBe(page2.total);
    expect(page1.items.map((m) => m.id)).not.toEqual(page2.items.map((m) => m.id));

    const scoped = await repo.list(q({ view: "all", pageSize: 200 }), { staffId: "stf_tomas" }, NOW);
    expect(scoped.total).toBeGreaterThan(0);
    expect(scoped.items.every((m) => m.experts.some((e) => e.staffId === "stf_tomas"))).toBe(true);
    expect(scoped.total).toBeLessThan(page1.total);
  });

  it("sorts by readiness, status and country when asked", async () => {
    const repo = makeMeetingsRepo(t.db);
    const byReadiness = await repo.list(q({ sort: "readiness", dir: "desc", pageSize: 200 }), { all: true }, NOW);
    const pct = byReadiness.items.map((m) => m.readiness.percent);
    expect(pct).toEqual([...pct].sort((a, b) => b - a));
    const byCountry = await repo.list(q({ sort: "country", pageSize: 200 }), { all: true }, NOW);
    const names = byCountry.items.map((m) => m.countryName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });
});

describe("meetings repo · counts", () => {
  it("counts every scope at once and agrees with the list, with a status filter narrowing within each scope", async () => {
    const repo = makeMeetingsRepo(t.db);
    const plain = await repo.countByView(q({}), { all: true }, NOW);
    expect(plain.all).toBeGreaterThan(plain.active);
    expect(plain.active).toBeGreaterThanOrEqual(plain.upcoming);
    for (const view of MEETING_VIEWS) expect(plain[view]).toBe((await repo.list(q({ view, pageSize: 200 }), { all: true }, NOW)).total);

    const held = await repo.countByView(q({ status: ["on_hold"] }), { all: true }, NOW);
    expect(held.on_hold).toBe(plain.on_hold);
    expect(held.completed).toBe(0);
    expect(held.upcoming).toBe(0);
    for (const view of MEETING_VIEWS) expect(held[view]).toBe((await repo.list(q({ view, status: ["on_hold"], pageSize: 200 }), { all: true }, NOW)).total);
  });
});

describe("meetings repo · get", () => {
  it("returns the full record with derived readiness, waiting state and organization history", async () => {
    const repo = makeMeetingsRepo(t.db);
    const [row] = await t.db
      .select({ id: s.meetings.id, organizationId: s.meetings.organizationId })
      .from(s.meetings)
      .where(eq(s.meetings.status, "confirmed"))
      .limit(1);
    const m = await repo.get(row!.id);
    expect(m).not.toBeNull();
    expect(m!.region.name).toBeTruthy();
    expect(m!.primaryCountry.name).toBeTruthy();
    expect(m!.organization?.name).toBeTruthy();
    expect(m!.topics[0]?.topic.name).toBeTruthy();
    expect(m!.experts.every((e) => e.staff.name)).toBe(true);
    expect(m!.readiness.items).toHaveLength(6);
    expect(m!.activities.length).toBeGreaterThan(0);
    expect(m!.activities[0]!.occurredAt.getTime()).toBeGreaterThanOrEqual(m!.activities[m!.activities.length - 1]!.occurredAt.getTime());
    expect(m!.history.every((h) => h.id !== m!.id)).toBe(true);
    expect(await repo.getByCode(m!.code)).toMatchObject({ id: m!.id });
    expect(await repo.get("nope")).toBeNull();
  });

  it("computes the next sequence per fiscal year", async () => {
    const repo = makeMeetingsRepo(t.db);
    const [row] = await t.db.select({ max: sql<number>`max(${s.meetings.sequence})::int` }).from(s.meetings).where(eq(s.meetings.fiscalYear, 2026));
    expect(await repo.nextSequence(2026)).toBe(row!.max + 1);
    expect(await repo.nextSequence(2031)).toBe(1);
  });

  it("lists meetings needing attention and meetings within a calendar range", async () => {
    const repo = makeMeetingsRepo(t.db);
    const attention = await repo.forAttention(NOW);
    expect(attention.length).toBeGreaterThan(0);
    expect(attention.every((m) => typeof m.readinessPercent === "number" && typeof m.expertsPending === "number")).toBe(true);
    const range = { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-09-30T23:59:59Z") };
    const cal = await repo.forCalendar(range);
    expect(cal.length).toBeGreaterThan(0);
    for (const m of cal) {
      const when = m.scheduledStart ?? m.nextCandidate;
      expect(when).not.toBeNull();
      expect(when!.getTime()).toBeGreaterThanOrEqual(range.start.getTime());
      expect(when!.getTime()).toBeLessThanOrEqual(range.end.getTime());
    }
  });
});
