// @vitest-environment node
import { eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { CreateMeetingInput } from "@/lib/api/schemas";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { deleteAgendaItem, reorderAgendaItems, upsertAgendaItem } from "@/lib/services/agenda";
import { PolicyError, ValidationError } from "@/lib/services/errors";
import { addExpert } from "@/lib/services/experts";
import { createMeeting } from "@/lib/services/meetings";

const NOW = new Date("2026-08-29T14:00:00Z");
const START = new Date("2026-11-04T15:00:00Z");
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
const viewer: PolicyUser = { id: "usr_ingrid", role: "viewer", regionIds: [], staffId: null };

let t: TestDb;
let meetingId: string;
let staffId: string;

beforeEach(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW, meetingCount: 0 });
  const created = await createMeeting(
    t.db,
    CreateMeetingInput.parse({
      requestor: { name: "Kouassi Mensah", organizationName: "ARTCI", organizationKind: "regulator", email: "k.mensah@artci.example" },
      countryCodes: ["CI"],
      regionId: "af",
      delegation: { headline: "Spectrum sharing study visit", size: 6 },
      topics: [{ topicId: "spectrum-sharing" }],
      dates: { preferredStart: START.toISOString(), format: "in_person" },
    }),
    coordinator,
    NOW,
  );
  meetingId = created.id;
  const [staff] = await t.db.select({ id: s.staffDirectory.id }).from(s.staffDirectory).limit(1);
  staffId = staff!.id;
});
afterEach(() => t.close());

const items = () => t.db.select().from(s.meetingAgendaItems).where(eq(s.meetingAgendaItems.meetingId, meetingId)).orderBy(s.meetingAgendaItems.sortOrder);

const block = (title: string, offsetMinutes = 0, lengthMinutes = 60) => ({
  meetingId,
  title,
  startsAt: new Date(START.getTime() + offsetMinutes * 60_000).toISOString(),
  endsAt: new Date(START.getTime() + (offsetMinutes + lengthMinutes) * 60_000).toISOString(),
});

describe("upsertAgendaItem", () => {
  it("appends blocks in the order they are added", async () => {
    const first = await upsertAgendaItem(t.db, block("Welcome and introductions", 0, 30), coordinator, NOW);
    await upsertAgendaItem(t.db, block("Shared spectrum access overview", 30, 60), coordinator, NOW);

    const rows = await items();
    expect(rows.map((r) => [r.title, r.sortOrder])).toEqual([
      ["Welcome and introductions", 1],
      ["Shared spectrum access overview", 2],
    ]);
    expect(rows[0]!.id).toBe(first.id);
    expect(rows[0]!.brieferStaffIds).toEqual([]);
  });

  it("edits the block named by id without moving it", async () => {
    const first = await upsertAgendaItem(t.db, block("Welcome", 0, 30), coordinator, NOW);
    await upsertAgendaItem(t.db, block("Overview", 30, 60), coordinator, NOW);

    await upsertAgendaItem(t.db, { ...block("Welcome and introductions", 0, 45), id: first.id, notes: "Coffee in the room." }, coordinator, NOW);

    const rows = await items();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.title).toBe("Welcome and introductions");
    expect(rows[0]!.sortOrder).toBe(1);
    expect(rows[0]!.notes).toBe("Coffee in the room.");
  });

  it("names briefers who are already on the meeting", async () => {
    await addExpert(t.db, { meetingId, staffId, role: "briefer" }, coordinator, NOW);
    const created = await upsertAgendaItem(t.db, { ...block("Overview"), brieferStaffIds: [staffId, staffId] }, coordinator, NOW);

    const [row] = await t.db.select().from(s.meetingAgendaItems).where(eq(s.meetingAgendaItems.id, created.id));
    expect(row?.brieferStaffIds).toEqual([staffId]); // deduplicated
  });

  it("refuses a briefer who is not on the meeting — the agenda names people, it does not recruit them", async () => {
    await expect(upsertAgendaItem(t.db, { ...block("Overview"), brieferStaffIds: [staffId] }, coordinator, NOW)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a block that ends before it starts", async () => {
    await expect(upsertAgendaItem(t.db, { meetingId, title: "Backwards", startsAt: START.toISOString(), endsAt: new Date(START.getTime() - 60_000).toISOString() }, coordinator, NOW)).rejects.toThrow();
  });

  it("keeps an untimed block, so an agenda can be drafted before the day is planned", async () => {
    const created = await upsertAgendaItem(t.db, { meetingId, title: "Closing remarks" }, coordinator, NOW);
    const [row] = await t.db.select().from(s.meetingAgendaItems).where(eq(s.meetingAgendaItems.id, created.id));
    expect(row?.startsAt).toBeNull();
    expect(row?.endsAt).toBeNull();
  });

  it("does not write to the activity log — drafting is not a commitment", async () => {
    await upsertAgendaItem(t.db, block("Welcome"), coordinator, NOW);
    const logged = await t.db.select().from(s.activities).where(eq(s.activities.meetingId, meetingId));
    expect(logged.every((a) => a.kind !== "system")).toBe(true);
  });

  it("refuses a reader who may not edit the meeting", async () => {
    await expect(upsertAgendaItem(t.db, block("Welcome"), viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});

describe("deleteAgendaItem", () => {
  it("removes the block", async () => {
    const created = await upsertAgendaItem(t.db, block("Welcome"), coordinator, NOW);
    await deleteAgendaItem(t.db, created.id, coordinator, NOW);
    expect(await items()).toHaveLength(0);
  });
});

describe("reorderAgendaItems", () => {
  it("renumbers the blocks into the order given", async () => {
    const a = await upsertAgendaItem(t.db, block("Session A", 0), coordinator, NOW);
    const b = await upsertAgendaItem(t.db, block("Session B", 60), coordinator, NOW);
    const c = await upsertAgendaItem(t.db, block("Session C", 120), coordinator, NOW);

    await reorderAgendaItems(t.db, { meetingId, orderedIds: [c.id, a.id, b.id] }, coordinator, NOW);
    expect((await items()).map((r) => r.title)).toEqual(["Session C", "Session A", "Session B"]);
  });
});
