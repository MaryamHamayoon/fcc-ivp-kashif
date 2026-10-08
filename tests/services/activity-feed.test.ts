// @vitest-environment node
import { eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { ActivityFeedQuery } from "@/lib/api/schemas";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import { sinceFor, weekRange } from "@/lib/domain/activity-feed";
import type { PolicyUser } from "@/lib/domain/policy";
import { ACTIVITY_KINDS } from "@/lib/domain/types";
import { activityOptions, listActivity, PULSE_WEEKS } from "@/lib/services/activity-feed";
import { PolicyError } from "@/lib/services/errors";

const NOW = new Date("2026-08-29T14:00:00Z");
const q = (over: Record<string, unknown> = {}) => ActivityFeedQuery.parse(over);

let t: TestDb;
let coordinator: PolicyUser;
let expert: PolicyUser;
let expertMeetings: Set<string>;
let everything: number;

beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW });

  // Whoever has logged the most is the coordinator these tests sign in as.
  const authored = await t.db.select({ authorId: s.activities.authorId }).from(s.activities);
  const tally = new Map<string, number>();
  for (const row of authored) if (row.authorId) tally.set(row.authorId, (tally.get(row.authorId) ?? 0) + 1);
  const [busiest] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  coordinator = { id: busiest![0], role: "coordinator", regionIds: [], staffId: null };
  everything = authored.length;

  const assignments = await t.db.select({ staffId: s.meetingExperts.staffId, meetingId: s.meetingExperts.meetingId }).from(s.meetingExperts);
  const staffId = assignments[0]!.staffId;
  expert = { id: "usr_expert", role: "expert", regionIds: [], staffId };
  expertMeetings = new Set(assignments.filter((r) => r.staffId === staffId).map((r) => r.meetingId));
}, 60_000);
afterAll(() => t.close());

describe("listActivity", () => {
  it("shows a coordinator the whole program's log, newest first", async () => {
    const { items, total } = await listActivity(t.db, q(), coordinator, NOW);
    expect(total).toBe(everything);
    expect(items).toHaveLength(50);
    const times = items.map((i) => i.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(items[0]).toMatchObject({ meetingCode: expect.stringMatching(/^IVP-/), countryCode: expect.stringMatching(/^[A-Z]{2}$/), orgName: expect.any(String) });
  });

  it("turns the pages without repeating or dropping an entry", async () => {
    const first = await listActivity(t.db, q({ pageSize: 25 }), coordinator, NOW);
    const second = await listActivity(t.db, q({ pageSize: 25, page: 2 }), coordinator, NOW);
    const fifty = await listActivity(t.db, q({ pageSize: 50 }), coordinator, NOW);
    expect([...first.items, ...second.items].map((i) => i.id)).toEqual(fifty.items.map((i) => i.id));
    expect(second.total).toBe(first.total);
  });

  it("reads oldest first when asked", async () => {
    const { items } = await listActivity(t.db, q({ sort: "oldest", pageSize: 25 }), coordinator, NOW);
    const times = items.map((i) => i.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("narrows to waits still open, and to what the reader logged", async () => {
    const open = await listActivity(t.db, q({ scope: "open", pageSize: 200 }), coordinator, NOW);
    expect(open.total).toBeGreaterThan(0);
    for (const i of open.items) {
      expect(i.waitingOn, i.id).not.toBe("none");
      expect(i.resolvedAt, i.id).toBeNull();
    }
    const mine = await listActivity(t.db, q({ scope: "mine", pageSize: 200 }), coordinator, NOW);
    expect(mine.total).toBeGreaterThan(0);
    for (const i of mine.items) expect(i.authorId, i.id).toBe(coordinator.id);
  });

  it("counts what each scope would show, whichever one is on screen", async () => {
    const all = await listActivity(t.db, q({ kind: ["email_out"] }), coordinator, NOW);
    const open = await listActivity(t.db, q({ kind: ["email_out"], scope: "open" }), coordinator, NOW);
    const mine = await listActivity(t.db, q({ kind: ["email_out"], scope: "mine" }), coordinator, NOW);
    expect(all.counts).toEqual({ all: all.total, open: open.total, mine: mine.total });
    expect(open.counts).toEqual(all.counts);
    expect(all.counts.open).toBeLessThan(all.counts.all);
  });

  it("filters by kind, party, author, region, fiscal year and meeting status", async () => {
    const kinds = await listActivity(t.db, q({ kind: ["call", "note"], pageSize: 200 }), coordinator, NOW);
    expect(kinds.total).toBeGreaterThan(0);
    for (const i of kinds.items) expect(["call", "note"]).toContain(i.kind);

    const och = await listActivity(t.db, q({ waitingOn: "och", pageSize: 200 }), coordinator, NOW);
    expect(och.total).toBeGreaterThan(0);
    for (const i of och.items) expect(i.waitingOn).toBe("och");

    const authored = await listActivity(t.db, q({ authorId: coordinator.id, pageSize: 200 }), coordinator, NOW);
    expect(authored.total).toBeGreaterThan(0);
    for (const i of authored.items) expect(i.authorId).toBe(coordinator.id);

    const africa = await listActivity(t.db, q({ regionId: "af", pageSize: 200 }), coordinator, NOW);
    const africanMeetings = new Set((await t.db.select({ id: s.meetings.id }).from(s.meetings).where(eq(s.meetings.regionId, "af"))).map((m) => m.id));
    expect(africa.total).toBeGreaterThan(0);
    for (const i of africa.items) expect(africanMeetings.has(i.meetingId), i.id).toBe(true);

    const held = await listActivity(t.db, q({ status: ["on_hold"], fy: 2026, pageSize: 200 }), coordinator, NOW);
    for (const i of held.items) expect(i.meetingStatus).toBe("on_hold");
    expect(held.total).toBeLessThan(everything);
  });

  it("keeps to a time window, or to one week of the pulse", async () => {
    const recent = await listActivity(t.db, q({ when: "30d", pageSize: 200 }), coordinator, NOW);
    expect(recent.total).toBeGreaterThan(0);
    for (const i of recent.items) expect(i.occurredAt.getTime()).toBeGreaterThanOrEqual(sinceFor("30d", NOW).getTime());

    const { start, end } = weekRange("2026-08-17");
    const week = await listActivity(t.db, q({ week: "2026-08-17", pageSize: 200 }), coordinator, NOW);
    expect(week.total).toBeGreaterThan(0);
    for (const i of week.items) {
      expect(i.occurredAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(i.occurredAt.getTime()).toBeLessThan(end.getTime());
    }
  });

  it("finds an entry by what it says, by its meeting, by who came and by who logged it", async () => {
    const { items } = await listActivity(t.db, q({ pageSize: 200 }), coordinator, NOW);
    const searchable = (w: string) => /^[a-z]{6,}$/i.test(w);
    const sample = items.find((i) => i.authorName && i.body.split(/\s+/).some(searchable))!;
    const word = sample.body.split(/\s+/).find(searchable)!;

    const byBody = await listActivity(t.db, q({ q: word.toUpperCase(), pageSize: 200 }), coordinator, NOW);
    expect(byBody.items.some((i) => i.id === sample.id)).toBe(true);

    const byCode = await listActivity(t.db, q({ q: sample.meetingCode.toLowerCase(), pageSize: 200 }), coordinator, NOW);
    expect(byCode.total).toBeGreaterThan(0);
    for (const i of byCode.items) expect(i.meetingCode).toBe(sample.meetingCode);

    const byAuthor = await listActivity(t.db, q({ q: sample.authorName!.split(" ")[0], pageSize: 200 }), coordinator, NOW);
    expect(byAuthor.items.some((i) => i.authorId === sample.authorId)).toBe(true);

    const nothing = await listActivity(t.db, q({ q: "zzzz-not-in-any-entry" }), coordinator, NOW);
    expect(nothing).toMatchObject({ total: 0, items: [], counts: { all: 0, open: 0, mine: 0 } });
  });

  it("draws the pulse from the same filters, but not from the time filters that would flatten it", async () => {
    const plain = await listActivity(t.db, q({ kind: ["email_out"] }), coordinator, NOW);
    expect(plain.pulse).toHaveLength(PULSE_WEEKS);
    expect(plain.pulse[plain.pulse.length - 1]?.week).toBe("2026-08-24");
    expect(plain.pulse.reduce((sum, w) => sum + w.count, 0)).toBeGreaterThan(0);
    expect(plain.pulse.reduce((sum, w) => sum + w.count, 0)).toBeLessThanOrEqual(plain.total);

    const oneWeek = await listActivity(t.db, q({ kind: ["email_out"], week: "2026-08-17" }), coordinator, NOW);
    expect(oneWeek.pulse).toEqual(plain.pulse);
    expect(oneWeek.total).toBe(plain.pulse.find((w) => w.week === "2026-08-17")?.count);
  });

  it("narrows an expert to the log of their own briefings", async () => {
    const { items, total, counts } = await listActivity(t.db, q({ pageSize: 200 }), expert, NOW);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(everything);
    expect(counts.all).toBe(total);
    for (const i of items) expect(expertMeetings.has(i.meetingId), i.id).toBe(true);
  });

  it("refuses an expert with no staff record rather than showing nothing quietly", async () => {
    const orphan: PolicyUser = { id: "usr_ghost", role: "expert", regionIds: [], staffId: null };
    await expect(listActivity(t.db, q(), orphan, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});

describe("activityOptions", () => {
  it("offers the kinds in display order, and only authors, regions and years the log really has", async () => {
    const options = await activityOptions(t.db, coordinator);
    expect(options.kinds.map((k) => k.value)).toEqual([...ACTIVITY_KINDS]);
    expect(options.authors.some((a) => a.id === coordinator.id)).toBe(true);
    expect(options.authors.map((a) => a.name)).toEqual([...options.authors.map((a) => a.name)].sort((a, b) => a.localeCompare(b, "en")));
    expect(options.regions.length).toBeGreaterThan(1);
    expect(options.fiscalYears).toEqual([...options.fiscalYears].sort((a, b) => b - a));
    expect(options.fiscalYears).toContain(2026);
  });

  it("offers an expert only the people who wrote in their own briefings' logs", async () => {
    const all = await activityOptions(t.db, coordinator);
    const mine = await activityOptions(t.db, expert);
    expect(mine.authors.length).toBeLessThanOrEqual(all.authors.length);
    expect(mine.authors.length).toBeGreaterThan(0);
  });
});
