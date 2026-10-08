// @vitest-environment node
import { eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { CreateMeetingInput, type CreateMeetingInputRaw } from "@/lib/api/schemas";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { PolicyError } from "@/lib/services/errors";
import { createMeeting } from "@/lib/services/meetings";
import { addParticipant, removeParticipant, setParticipantTotals } from "@/lib/services/participants";

const NOW = new Date("2026-08-29T14:00:00Z");
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
const viewer: PolicyUser = { id: "usr_ingrid", role: "viewer", regionIds: [], staffId: null };

const request = (over: Partial<CreateMeetingInputRaw> = {}): CreateMeetingInput =>
  CreateMeetingInput.parse({
    requestor: { name: "Kouassi Mensah", title: "Director General", organizationName: "ARTCI", organizationKind: "regulator", email: "k.mensah@artci.example" },
    countryCodes: ["CI"],
    regionId: "af",
    delegation: { headline: "Spectrum sharing study visit", size: 6, members: [] },
    topics: [{ topicId: "spectrum-sharing" }],
    dates: { preferredStart: "2026-11-04T15:00:00Z", format: "in_person" },
    ochRequested: false,
    ...over,
  });

let t: TestDb;
let meetingId: string;

beforeEach(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW, meetingCount: 0 });
  meetingId = (await createMeeting(t.db, request(), coordinator, NOW)).id;
});
afterEach(() => t.close());

const totals = () => t.db.select().from(s.meetingParticipantTotals).where(eq(s.meetingParticipantTotals.meetingId, meetingId));
const activities = () => t.db.select().from(s.activities).where(eq(s.activities.meetingId, meetingId));

describe("addParticipant", () => {
  it("adds a named person and hangs a foreign-government name off the requesting organization", async () => {
    const { id } = await addParticipant(t.db, { meetingId, name: "Awa Traoré", title: "Head of Spectrum", category: "foreign_gov" }, coordinator, NOW);

    const detail = await makeMeetingsRepo(t.db).get(meetingId, NOW);
    const added = detail!.participants.find((p) => p.id === id);
    expect(added?.name).toBe("Awa Traoré");
    expect(added?.title).toBe("Head of Spectrum");
    expect(added?.organizationId).toBe(detail!.organizationId);
    expect(added?.isInterpreter).toBe(false);
  });

  it("leaves an FCC name unattached to the visiting organization", async () => {
    const { id } = await addParticipant(t.db, { meetingId, name: "Dana Whitfield", category: "fcc" }, coordinator, NOW);
    const [row] = await t.db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.id, id));
    expect(row?.organizationId).toBeNull();
  });

  it("marks an interpreter as one", async () => {
    const { id } = await addParticipant(t.db, { meetingId, name: "Lina Fontaine", category: "other", isInterpreter: true }, coordinator, NOW);
    const [row] = await t.db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.id, id));
    expect(row?.isInterpreter).toBe(true);
  });

  it("refuses a reader who may not edit the meeting", async () => {
    await expect(addParticipant(t.db, { meetingId, name: "Awa Traoré" }, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});

describe("removeParticipant", () => {
  it("takes the person off the roster", async () => {
    const { id } = await addParticipant(t.db, { meetingId, name: "Awa Traoré" }, coordinator, NOW);
    await removeParticipant(t.db, id, coordinator, NOW);
    const rows = await t.db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.id, id));
    expect(rows).toHaveLength(0);
  });
});

describe("setParticipantTotals", () => {
  it("writes planned headcounts per category and updates them in place", async () => {
    await setParticipantTotals(t.db, { meetingId, totals: [{ category: "fcc", planned: 4 }, { category: "foreign_gov", planned: 6 }] }, coordinator, NOW);
    expect((await totals()).map((row) => [row.category, row.planned, row.actual]).sort()).toEqual([["fcc", 4, null], ["foreign_gov", 6, null]]);

    await setParticipantTotals(t.db, { meetingId, totals: [{ category: "fcc", planned: 5 }] }, coordinator, NOW);
    const after = await totals();
    expect(after).toHaveLength(2); // the category that was not sent is left alone
    expect(after.find((row) => row.category === "fcc")?.planned).toBe(5);
    expect(after.find((row) => row.category === "foreign_gov")?.planned).toBe(6);
  });

  it("logs the turnout once, when actual counts first arrive", async () => {
    await setParticipantTotals(t.db, { meetingId, totals: [{ category: "fcc", planned: 4 }, { category: "foreign_gov", planned: 6 }] }, coordinator, NOW);
    expect((await activities()).filter((a) => a.kind === "system")).toHaveLength(0);

    await setParticipantTotals(t.db, { meetingId, totals: [{ category: "fcc", planned: 4, actual: 5 }, { category: "foreign_gov", planned: 6, actual: 6 }] }, coordinator, NOW);
    const logged = (await activities()).filter((a) => a.kind === "system");
    expect(logged).toHaveLength(1);
    expect(logged[0]!.body).toContain("11 attended against 10 planned");

    // Correcting a count that was already recorded is an edit, not news.
    await setParticipantTotals(t.db, { meetingId, totals: [{ category: "fcc", planned: 4, actual: 4 }] }, coordinator, NOW);
    expect((await activities()).filter((a) => a.kind === "system")).toHaveLength(1);
  });

  it("keeps actual null until somebody counts, so the report can tell the difference", async () => {
    await setParticipantTotals(t.db, { meetingId, totals: [{ category: "industry", planned: 2 }] }, coordinator, NOW);
    expect((await totals())[0]?.actual).toBeNull();
  });

  it("refuses a reader who may not edit the meeting", async () => {
    await expect(setParticipantTotals(t.db, { meetingId, totals: [{ category: "fcc", planned: 1 }] }, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});
