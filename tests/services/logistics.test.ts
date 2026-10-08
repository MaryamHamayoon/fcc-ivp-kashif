// @vitest-environment node
import { eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { CreateMeetingInput, type CreateMeetingInputRaw } from "@/lib/api/schemas";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { PolicyError } from "@/lib/services/errors";
import { updateLogistics } from "@/lib/services/logistics";
import { createMeeting } from "@/lib/services/meetings";

const NOW = new Date("2026-08-29T14:00:00Z");
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
const viewer: PolicyUser = { id: "usr_ingrid", role: "viewer", regionIds: [], staffId: null };
const EMBASSY = "Embassy of Côte d’Ivoire";

const request = (over: Partial<CreateMeetingInputRaw> = {}): CreateMeetingInput =>
  CreateMeetingInput.parse({
    requestor: { name: "Kouassi Mensah", organizationName: "ARTCI", organizationKind: "regulator", email: "k.mensah@artci.example" },
    countryCodes: ["CI"],
    regionId: "af",
    delegation: { headline: "Spectrum sharing study visit", size: 6 },
    topics: [{ topicId: "spectrum-sharing" }],
    dates: { preferredStart: "2026-11-04T15:00:00Z", format: "in_person" },
    logistics: { needsAv: false, interpreter: "none" },
    ...over,
  });

let t: TestDb;

beforeEach(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW, meetingCount: 0 });
});
afterEach(() => t.close());

const make = async (over: Partial<CreateMeetingInputRaw> = {}) => (await createMeeting(t.db, request(over), coordinator, NOW)).id;
const meeting = (id: string) => makeMeetingsRepo(t.db).get(id, NOW);
const activities = (id: string) => t.db.select().from(s.activities).where(eq(s.activities.meetingId, id));

describe("updateLogistics", () => {
  it("saves the room, the kit and the people who make the day work", async () => {
    const id = await make();

    const { changed } = await updateLogistics(
      t.db,
      { meetingId: id, location: "  Room 8-B516, 45 L Street NE  ", needsAv: true, interpreter: "simultaneous", accommodations: "Step-free access from the L Street entrance.", localContact: EMBASSY },
      coordinator,
      NOW,
    );

    const after = await meeting(id);
    expect(after!.location).toBe("Room 8-B516, 45 L Street NE"); // trimmed
    expect(after!.needsAv).toBe(true);
    expect(after!.interpreter).toBe("simultaneous");
    expect(after!.accommodations).toContain("Step-free access");
    expect(after!.localContact).toBe(EMBASSY);
    expect(changed).toContain("room set to Room 8-B516, 45 L Street NE");
    expect(after!.updatedAt).toEqual(NOW);
  });

  it("completes the logistics readiness check for an in-person meeting", async () => {
    const id = await make();
    const before = await meeting(id);
    expect(before!.readiness.items.find((i) => i.key === "logistics")?.done).toBe(false);

    await updateLogistics(t.db, { meetingId: id, location: "Room 8-B516", needsAv: false, interpreter: "none" }, coordinator, NOW);

    const after = await meeting(id);
    expect(after!.readiness.items.find((i) => i.key === "logistics")?.done).toBe(true);
  });

  it("asks a virtual meeting for a link rather than a room", async () => {
    const id = await make({ dates: { preferredStart: "2026-11-04T15:00:00Z", format: "virtual" } });

    await updateLogistics(t.db, { meetingId: id, virtualLink: "https://fcc.zoomgov.example/j/123", needsAv: false, interpreter: "none" }, coordinator, NOW);

    const after = await meeting(id);
    expect(after!.virtualLink).toBe("https://fcc.zoomgov.example/j/123");
    expect(after!.readiness.items.find((i) => i.key === "logistics")?.done).toBe(true);
  });

  it("writes one readable line to the timeline, naming only what moved", async () => {
    const id = await make();
    await updateLogistics(t.db, { meetingId: id, location: "Room 8-B516", needsAv: true, interpreter: "consecutive" }, coordinator, NOW);

    const logged = (await activities(id)).filter((a) => a.kind === "system");
    expect(logged).toHaveLength(1);
    expect(logged[0]!.body).toBe("Logistics updated — room set to Room 8-B516; A/V requested; consecutive interpretation.");
  });

  it("stays quiet when nothing actually changed", async () => {
    const id = await make();
    await updateLogistics(t.db, { meetingId: id, location: "Room 8-B516", needsAv: false, interpreter: "none" }, coordinator, NOW);
    const first = (await activities(id)).length;

    const { changed } = await updateLogistics(t.db, { meetingId: id, location: "Room 8-B516", needsAv: false, interpreter: "none" }, coordinator, NOW);
    expect(changed).toEqual([]);
    expect((await activities(id)).length).toBe(first);
  });

  it("treats an emptied field as cleared, not as blank text", async () => {
    const id = await make();
    await updateLogistics(t.db, { meetingId: id, location: "Room 8-B516", needsAv: false, interpreter: "none" }, coordinator, NOW);
    await updateLogistics(t.db, { meetingId: id, location: "   ", needsAv: false, interpreter: "none" }, coordinator, NOW);

    const after = await meeting(id);
    expect(after!.location).toBeNull();
  });

  it("refuses a reader who may not edit the meeting", async () => {
    const id = await make();
    await expect(updateLogistics(t.db, { meetingId: id, location: "Room 8-B516", needsAv: false, interpreter: "none" }, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});
