// @vitest-environment node
import { eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { CreateMeetingInput, type CreateMeetingInputRaw, type UpdateMeetingInputRaw } from "@/lib/api/schemas";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { editMeetingDetails } from "@/lib/services/edit";
import { PolicyError } from "@/lib/services/errors";
import { createMeeting } from "@/lib/services/meetings";

const NOW = new Date("2026-08-29T14:00:00Z");
const PURPOSE = "Compare approaches to shared spectrum access in the 3.5 GHz band.";
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
const viewer: PolicyUser = { id: "usr_ingrid", role: "viewer", regionIds: [], staffId: null };

// Region "af" auto-assigns usr_amara as lead (the seeded regional_lead for that region); the
// coordinator actor auto-assigns itself (usr_priya) as coordinator. Both come from `createMeeting`
// with no explicit override, so the "unchanged" payload below has to name them to be a true no-op.
const request = (over: Partial<CreateMeetingInputRaw> = {}): CreateMeetingInput =>
  CreateMeetingInput.parse({
    requestor: { name: "Kouassi Mensah", organizationName: "ARTCI", organizationKind: "regulator", email: "k.mensah@artci.example" },
    countryCodes: ["CI"],
    regionId: "af",
    delegation: { headline: "Spectrum sharing study visit", purpose: PURPOSE, size: 6 },
    topics: [{ topicId: "spectrum-sharing" }],
    dates: { preferredStart: "2026-11-04T15:00:00Z", format: "in_person" },
    ...over,
  });

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW, meetingCount: 0 });
});
afterEach(() => t.close());

const make = async (over: Partial<CreateMeetingInputRaw> = {}) => (await createMeeting(t.db, request(over), coordinator, NOW)).id;
const meetingRow = async (id: string) => (await t.db.select().from(s.meetings).where(eq(s.meetings.id, id)))[0]!;
const systemActivities = async (id: string) => (await t.db.select().from(s.activities).where(eq(s.activities.meetingId, id))).filter((a) => a.kind === "system");

/** Exactly what `make()` produces — a valid `UpdateMeetingInput` payload that changes nothing. */
const unchangedPayload = (meetingId: string): UpdateMeetingInputRaw => ({
  meetingId,
  title: "Spectrum sharing study visit",
  purpose: PURPOSE,
  format: "in_person",
  ochAttending: false,
  priority: "normal",
  delegationSize: 6,
  leadUserId: "usr_amara",
  coordinatorUserId: "usr_priya",
  topicIds: ["spectrum-sharing"],
});

describe("editMeetingDetails", () => {
  it("logs one system activity naming every scalar that changed, and saves the row", async () => {
    const id = await make();

    const { changed } = await editMeetingDetails(
      t.db,
      {
        ...unchangedPayload(id),
        title: "Spectrum sharing and 6G study visit",
        purpose: `${PURPOSE} Updated after the scoping call.`,
        format: "hybrid",
        ochAttending: true,
        priority: "high",
        delegationSize: 9,
      },
      coordinator,
      NOW,
    );

    expect(changed).toEqual(["title changed", "purpose revised", "format In person → Hybrid", "OCH attending", "priority Normal → High priority", "delegation 6 → 9"]);

    const after = await meetingRow(id);
    expect(after.title).toBe("Spectrum sharing and 6G study visit");
    expect(after.format).toBe("hybrid");
    expect(after.ochAttending).toBe(true);
    expect(after.priority).toBe("high");
    expect(after.delegationSize).toBe(9);
    expect(after.updatedAt).toEqual(NOW);

    const logged = await systemActivities(id);
    expect(logged).toHaveLength(1);
    expect(logged[0]!.body).toBe("Details updated — title changed; purpose revised; format In person → Hybrid; OCH attending; priority Normal → High priority; delegation 6 → 9.");
  });

  it("stays quiet and leaves the row untouched when nothing actually changed", async () => {
    const id = await make();
    const before = await meetingRow(id);

    const { changed } = await editMeetingDetails(t.db, unchangedPayload(id), coordinator, new Date(NOW.getTime() + 3_600_000));

    expect(changed).toEqual([]);
    const after = await meetingRow(id);
    expect(after.updatedAt).toEqual(before.updatedAt); // untouched — still the instant createMeeting stamped
    expect(await systemActivities(id)).toHaveLength(0);
  });

  it("names the newly assigned lead", async () => {
    const id = await make();

    const { changed } = await editMeetingDetails(t.db, { ...unchangedPayload(id), leadUserId: "usr_kenji" }, coordinator, NOW);

    expect(changed).toEqual(["lead set to Kenji Sato"]);
    expect((await meetingRow(id)).leadUserId).toBe("usr_kenji");
    const logged = await systemActivities(id);
    expect(logged[0]!.body).toBe("Details updated — lead set to Kenji Sato.");
  });

  it("notes a cleared lead", async () => {
    const id = await make();

    const { changed } = await editMeetingDetails(t.db, { ...unchangedPayload(id), leadUserId: null }, coordinator, NOW);

    expect(changed).toEqual(["lead cleared"]);
    expect((await meetingRow(id)).leadUserId).toBeNull();
  });

  it("resolves both lead and coordinator names from a single lookup when both change together", async () => {
    const id = await make();

    const { changed } = await editMeetingDetails(t.db, { ...unchangedPayload(id), leadUserId: "usr_kenji", coordinatorUserId: "usr_elena" }, coordinator, NOW);

    expect(changed).toEqual(["lead set to Kenji Sato", "coordinator set to Elena Petrova"]);
    const after = await meetingRow(id);
    expect(after.leadUserId).toBe("usr_kenji");
    expect(after.coordinatorUserId).toBe("usr_elena");
  });

  it("logs only the topics line when just the ranked topic list changed", async () => {
    const id = await make();

    const { changed } = await editMeetingDetails(t.db, { ...unchangedPayload(id), topicIds: ["spectrum-auctions"] }, coordinator, NOW);

    expect(changed).toEqual([]); // no scalar changes to report
    const logged = await systemActivities(id);
    expect(logged).toHaveLength(1);
    expect(logged[0]!.body).toBe("Topics updated — Spectrum Auctions.");
  });

  it("refuses a reader who may not edit the meeting", async () => {
    const id = await make();
    await expect(editMeetingDetails(t.db, unchangedPayload(id), viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});
