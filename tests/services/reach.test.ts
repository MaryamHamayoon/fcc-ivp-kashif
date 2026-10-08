// @vitest-environment node
import { gzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import type { ReachData } from "@/lib/domain/reach";
import { getReachData, toReachMeeting } from "@/lib/services/reach";
import { makeListItem, makeReadiness } from "@/tests/fixtures/meetings";

const NOW = new Date("2026-09-28T16:00:00Z");
const admin: PolicyUser = { id: "usr_dana", role: "admin", regionIds: [], staffId: null };
const expert: PolicyUser = { id: "usr_tomas", role: "expert", regionIds: [], staffId: "stf_tomas" };
const KNOWN = new Set(["CI", "SN", "US"]);

describe("toReachMeeting", () => {
  it("takes the accepted date, else the earliest open proposal, and says which", () => {
    const accepted = new Date("2026-10-06T14:00:00Z");
    const proposal = new Date("2026-11-03T15:00:00Z");
    expect(toReachMeeting(makeListItem({ scheduledStart: accepted, nextCandidate: null }), KNOWN)).toMatchObject({ start: accepted, proposed: false });
    expect(toReachMeeting(makeListItem({ scheduledStart: null, nextCandidate: proposal }), KNOWN)).toMatchObject({ start: proposal, proposed: true });
    expect(toReachMeeting(makeListItem({ scheduledStart: null, nextCandidate: null }), KNOWN)).toMatchObject({ start: null, proposed: false });
  });

  it("keeps the foreign countries it can place, primary first, and never the United States", () => {
    expect(toReachMeeting(makeListItem({ countryCodes: ["CI", "US", "XX", "SN"] }), KNOWN).countries).toEqual(["CI", "SN"]);
  });

  it("names only the experts and bureaus still on the meeting", () => {
    const m = toReachMeeting(
      makeListItem({
        experts: [
          { id: "mex_1", staffId: "stf_1", name: "Rosa Liang", bureauCode: "WTB", status: "confirmed", role: "lead" },
          { id: "mex_2", staffId: "stf_2", name: "Omar Haddad", bureauCode: "WTB", status: "requested", role: "briefer" },
          { id: "mex_3", staffId: "stf_3", name: "Lena Brandt", bureauCode: "OET", status: "declined", role: "briefer" },
        ],
      }),
      KNOWN,
    );
    expect(m.bureaus).toEqual(["WTB"]);
    expect(m.experts).toEqual([
      { name: "Rosa Liang", bureau: "WTB", lead: true, confirmed: true },
      { name: "Omar Haddad", bureau: "WTB", lead: false, confirmed: false },
    ]);
  });

  it("carries readiness, what is missing, and who the meeting is waiting on", () => {
    const readiness = makeReadiness({ documents: [] });
    const m = toReachMeeting(
      makeListItem({
        readiness,
        priority: "high",
        ochAttending: true,
        waiting: { who: "expert", label: "FCC expert", since: new Date("2026-09-18T14:00:00Z"), businessDays: 6, band: "warn", activityId: "act_1", nextAction: null, nextActionDueAt: null },
      }),
      KNOWN,
    );
    expect(m.readiness).toBe(readiness.percent);
    expect(m.missing).toEqual(readiness.missing.map((item) => ({ label: item.label, detail: item.detail })));
    expect(m.missing.length).toBeGreaterThan(0);
    expect(m.waiting).toEqual({ who: "expert", label: "FCC expert", businessDays: 6, band: "warn" });
    expect(m).toMatchObject({ highPriority: true, och: true, participants: 12, region: "Africa", orgName: "Autorité de Régulation des Télécommunications" });
  });
});

describe("getReachData", () => {
  let t: TestDb;
  let data: ReachData;

  beforeAll(async () => {
    t = await createTestDb();
    await seedAll(t.db, { now: NOW });
    data = await getReachData(t.db, { user: admin, now: NOW });
  });
  afterAll(async () => {
    await t.close();
  });

  it("carries every meeting, soonest first, with the undated ones last", async () => {
    const total = await t.db.select({ id: s.meetings.id }).from(s.meetings);
    expect(data.asOf).toEqual(NOW);
    expect(data.meetings).toHaveLength(total.length);
    const starts = data.meetings.map((m) => m.start?.getTime() ?? Number.POSITIVE_INFINITY);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(data.meetings.every((m) => !m.proposed || m.start !== null)).toBe(true);
  });

  it("names exactly the countries its meetings reach, never the United States", () => {
    const named = new Set(data.meetings.flatMap((m) => m.countries));
    expect(named.has("US")).toBe(false);
    expect(new Set(data.countries.map((c) => c.cca2))).toEqual(named);
    expect(data.countries.every((c) => /^\d{3}$/.test(c.ccn3) && Number.isFinite(c.lat) && Number.isFinite(c.lng))).toBe(true);
    expect(data.bureaus.length).toBeGreaterThan(0);
  });

  it("shows an expert only their own briefings", async () => {
    const mine = await getReachData(t.db, { user: expert, now: NOW });
    const rows = await t.db.select({ id: s.meetingExperts.meetingId }).from(s.meetingExperts).where(eq(s.meetingExperts.staffId, "stf_tomas"));
    expect(mine.meetings.length).toBeGreaterThan(0);
    expect(new Set(mine.meetings.map((m) => m.id))).toEqual(new Set(rows.map((r) => r.id)));
  });

  it("stays inside its 300 KB budget, gzipped", () => {
    expect(gzipSync(JSON.stringify(data)).length).toBeLessThan(300 * 1024);
  });
});
