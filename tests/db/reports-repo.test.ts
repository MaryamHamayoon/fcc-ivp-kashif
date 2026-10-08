// @vitest-environment node
import { gt } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { makeReportsRepo, type ReportsRepo } from "@/lib/db/repos/reports";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import { EXPERT_STATUSES, PARTICIPANT_CATEGORIES } from "@/lib/domain/types";

const NOW = new Date("2026-08-29T14:00:00Z");

let t: TestDb;
let repo: ReportsRepo;
let ids: string[];

beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW });
  repo = makeReportsRepo(t.db);
  ids = (await t.db.select({ id: s.meetings.id }).from(s.meetings)).map((r) => r.id);
}, 60_000);
afterAll(() => t.close());

describe("reports repository", () => {
  it("returns nothing when asked about no meetings", async () => {
    expect(await repo.participantRows([])).toEqual([]);
    expect(await repo.expertRows([])).toEqual([]);
  });

  it("gives every participant row its category and counts, and no actual for a meeting still ahead", async () => {
    const rows = await repo.participantRows(ids);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(PARTICIPANT_CATEGORIES).toContain(row.category);
      expect(row.planned).toBeGreaterThanOrEqual(0);
      if (row.actual !== null) expect(row.actual).toBeGreaterThanOrEqual(0);
    }
    const ahead = new Set((await t.db.select({ id: s.meetings.id }).from(s.meetings).where(gt(s.meetings.scheduledStart, NOW))).map((r) => r.id));
    expect(ahead.size).toBeGreaterThan(0);
    for (const row of rows.filter((r) => ahead.has(r.meetingId))) expect(row.actual, row.meetingId).toBeNull();
  });

  it("names each expert and the bureau that lent them", async () => {
    const rows = await repo.expertRows(ids);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.name.length).toBeGreaterThan(0);
      expect(EXPERT_STATUSES).toContain(row.status);
      if (row.bureauCode) expect(row.bureauName, row.bureauCode).not.toBeNull();
      if (row.respondedAt) expect(row.requestedAt).not.toBeNull();
    }
    expect(rows.some((r) => r.bureauCode !== null)).toBe(true);
  });

  it("answers only for the meetings asked about", async () => {
    const some = ids.slice(0, 5);
    const asked = new Set(some);
    for (const row of await repo.participantRows(some)) expect(asked.has(row.meetingId)).toBe(true);
    for (const row of await repo.expertRows(some)) expect(asked.has(row.meetingId)).toBe(true);
  });
});
