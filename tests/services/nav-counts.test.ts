// @vitest-environment node
import { and, eq, gte, inArray } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { ACTIVE_STATUSES } from "@/lib/domain/status-machine";
import { navCounts } from "@/lib/services/nav-counts";

const NOW = new Date("2026-08-29T14:00:00Z");
const admin: PolicyUser = { id: "usr_dana", role: "admin", regionIds: [], staffId: null };
const expert: PolicyUser = { id: "usr_tomas", role: "expert", regionIds: [], staffId: "stf_tomas" };

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { now: NOW });
});
afterAll(async () => {
  await t.close();
});

/** The same rows the rail's pills claim to count, asked for in SQL rather than through the repo. */
async function countActive(): Promise<number> {
  const rows = await t.db
    .select({ id: s.meetings.id })
    .from(s.meetings)
    .where(inArray(s.meetings.status, [...ACTIVE_STATUSES]));
  return rows.length;
}

async function countUpcoming(): Promise<number> {
  const rows = await t.db
    .select({ id: s.meetings.id })
    .from(s.meetings)
    .where(and(inArray(s.meetings.status, ["requested", "developing", "clearance", "confirmed"]), gte(s.meetings.scheduledStart, NOW)));
  return rows.length;
}

describe("navCounts", () => {
  it("counts what the Active and Upcoming rows lead to, not a number of its own", async () => {
    const counts = await navCounts(t.db, admin, NOW);
    expect(counts.active).toBe(await countActive());
    expect(counts.upcoming).toBe(await countUpcoming());
    expect(counts.active).toBeGreaterThan(0);
    expect(counts.upcoming).toBeGreaterThan(0);
    // Everything upcoming is still in play, so it can never be the larger of the two.
    expect(counts.upcoming).toBeLessThanOrEqual(counts.active);
  });

  it("shows an expert only the briefings they are on", async () => {
    const mine = await t.db
      .select({ id: s.meetingExperts.meetingId })
      .from(s.meetingExperts)
      .where(eq(s.meetingExperts.staffId, "stf_tomas"));
    expect(mine.length).toBeGreaterThan(0);

    const counts = await navCounts(t.db, expert, NOW);
    const all = await navCounts(t.db, admin, NOW);
    expect(counts.active).toBeLessThan(all.active);
    expect(counts.active).toBeLessThanOrEqual(mine.length);
  });

  it("counts against the clock it is given, not the wall clock", async () => {
    const later = new Date(NOW.getTime() + 400 * 86_400_000);
    const counts = await navCounts(t.db, admin, later);
    expect(counts.upcoming).toBe(0); // nothing seeded is scheduled more than a year out
    expect(counts.active).toBe(await countActive()); // "active" is a status, and statuses do not age
  });
});
