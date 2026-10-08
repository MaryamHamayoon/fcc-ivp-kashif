// @vitest-environment node
import { asc, eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { CreateMeetingInput } from "@/lib/api/schemas";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { PolicyError, ValidationError } from "@/lib/services/errors";
import { createMeeting } from "@/lib/services/meetings";
import { setMeetingTopics } from "@/lib/services/topics";

const NOW = new Date("2026-08-29T14:00:00Z");
const START = new Date("2026-11-04T15:00:00Z");
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
const viewer: PolicyUser = { id: "usr_ingrid", role: "viewer", regionIds: [], staffId: null };

let t: TestDb;
let meetingId: string;

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
      topics: [{ topicId: "spectrum-sharing", detail: "How does the CBRS tiered model handle incumbent protection?" }],
      dates: { preferredStart: START.toISOString(), format: "in_person" },
    }),
    coordinator,
    NOW,
  );
  meetingId = created.id;
});
afterEach(() => t.close());

const rows = () => t.db.select().from(s.meetingTopics).where(eq(s.meetingTopics.meetingId, meetingId)).orderBy(asc(s.meetingTopics.rank));
const activities = () => t.db.select().from(s.activities).where(eq(s.activities.meetingId, meetingId));
const meetingRow = async () => (await t.db.select().from(s.meetings).where(eq(s.meetings.id, meetingId)))[0]!;

describe("setMeetingTopics", () => {
  it("replaces the topic list, turning the given order into rank", async () => {
    await setMeetingTopics(t.db, meetingId, ["spectrum-auctions", "imt"], coordinator, NOW);
    expect((await rows()).map((r) => [r.topicId, r.rank])).toEqual([
      ["spectrum-auctions", 1],
      ["imt", 2],
    ]);
  });

  it("keeps the detail already on a topic that stays selected", async () => {
    await setMeetingTopics(t.db, meetingId, ["spectrum-sharing", "imt"], coordinator, NOW);
    const found = (await rows()).find((r) => r.topicId === "spectrum-sharing");
    expect(found?.detail).toBe("How does the CBRS tiered model handle incumbent protection?");
  });

  it("starts a newly added topic with no detail — there is nowhere on this form to type one", async () => {
    await setMeetingTopics(t.db, meetingId, ["spectrum-sharing", "imt"], coordinator, NOW);
    const found = (await rows()).find((r) => r.topicId === "imt");
    expect(found?.detail).toBeNull();
  });

  it("logs one system activity naming the new set, only when it actually changed", async () => {
    await setMeetingTopics(t.db, meetingId, ["spectrum-auctions"], coordinator, NOW);
    const logged = (await activities()).filter((a) => a.kind === "system");
    expect(logged).toHaveLength(1);
    expect(logged[0]!.body).toBe("Topics updated — Spectrum Auctions.");
  });

  it("stays quiet when the set and order are unchanged", async () => {
    await setMeetingTopics(t.db, meetingId, ["spectrum-sharing"], coordinator, new Date(NOW.getTime() + 3600_000));
    expect((await activities()).filter((a) => a.kind === "system")).toHaveLength(0);
    expect((await meetingRow()).updatedAt).toEqual(NOW); // untouched — still the instant createMeeting stamped
  });

  it("treats a reorder of the same topics as a change", async () => {
    await setMeetingTopics(t.db, meetingId, ["spectrum-sharing", "spectrum-auctions"], coordinator, NOW);
    await setMeetingTopics(t.db, meetingId, ["spectrum-auctions", "spectrum-sharing"], coordinator, new Date(NOW.getTime() + 60_000));

    expect((await rows()).map((r) => r.topicId)).toEqual(["spectrum-auctions", "spectrum-sharing"]);
    expect((await activities()).filter((a) => a.kind === "system")).toHaveLength(2);
  });

  it("deduplicates a repeated id, keeping its first position", async () => {
    await setMeetingTopics(t.db, meetingId, ["spectrum-auctions", "spectrum-auctions", "imt"], coordinator, NOW);
    expect((await rows()).map((r) => r.topicId)).toEqual(["spectrum-auctions", "imt"]);
  });

  it("touches the meeting when the set changes", async () => {
    const later = new Date(NOW.getTime() + 3600_000);
    await setMeetingTopics(t.db, meetingId, ["imt"], coordinator, later);
    expect((await meetingRow()).updatedAt).toEqual(later);
  });

  it("refuses an unknown topic id", async () => {
    await expect(setMeetingTopics(t.db, meetingId, ["not-a-real-topic"], coordinator, NOW)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a reader who may not edit the meeting", async () => {
    await expect(setMeetingTopics(t.db, meetingId, ["imt"], viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});
