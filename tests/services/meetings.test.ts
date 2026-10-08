// @vitest-environment node
import { eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { CreateMeetingInput, type CreateMeetingInputRaw } from "@/lib/api/schemas";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { acceptDate } from "@/lib/services/dates";
import { PolicyError } from "@/lib/services/errors";
import { createMeeting, resumeMeeting, transitionMeeting } from "@/lib/services/meetings";

const NOW = new Date("2026-08-29T14:00:00Z");
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
const viewer: PolicyUser = { id: "usr_ingrid", role: "viewer", regionIds: [], staffId: "stf_ingrid" };

const sample = (over: Partial<CreateMeetingInputRaw> = {}): CreateMeetingInput =>
  CreateMeetingInput.parse({
    requestor: { name: "Kouassi Mensah", title: "Director General", organizationName: "ARTCI", organizationKind: "regulator", email: "k.mensah@artci.example" },
    countryCodes: ["CI"],
    regionId: "af",
    delegation: { headline: "Spectrum Sharing Study Visit", purpose: "Compare CBRS-style sharing frameworks.", size: 6, members: [{ name: "Awa Traoré", title: "Head of Spectrum" }] },
    topics: [{ topicId: "spectrum-sharing", detail: "Three-tier access" }, { topicId: "spectrum-auctions" }],
    dates: { preferredStart: "2026-11-04T15:00:00Z", alternateStart: "2026-11-11T15:00:00Z", format: "in_person" },
    logistics: { needsAv: true },
    ochRequested: false,
    ...over,
  });

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW, meetingCount: 0 });
});
afterEach(() => t.close());

describe("createMeeting", () => {
  it("assigns the next IVP code for the fiscal year of the preferred date and records the request", async () => {
    const first = await createMeeting(t.db, sample(), coordinator, NOW);
    expect(first.code).toBe("IVP-2027-001");
    const second = await createMeeting(t.db, sample({ delegation: { headline: "Second visit", size: 3 } }), coordinator, NOW);
    expect(second.code).toBe("IVP-2027-002");

    const m = await makeMeetingsRepo(t.db).get(first.id);
    expect(m).not.toBeNull();
    expect(m!.status).toBe("requested");
    expect(m!.organizationId).toBe("artci"); // matched the existing organization by short name
    expect(m!.requestor?.name).toBe("Kouassi Mensah");
    expect(m!.candidateDates.map((d) => d.status)).toEqual(["proposed", "proposed"]);
    expect(m!.candidateDates.every((d) => d.proposedBy === "visitor")).toBe(true);
    expect(m!.topics.map((x) => x.topicId)).toEqual(["spectrum-sharing", "spectrum-auctions"]);
    expect(m!.participants.map((p) => p.name)).toEqual(expect.arrayContaining(["Kouassi Mensah", "Awa Traoré"]));
    expect(m!.activities.some((a) => a.kind === "status_change")).toBe(true);
    expect(m!.needsAv).toBe(true);
    expect(m!.regionId).toBe("af");
    expect(m!.delegationSize).toBe(6);
    expect(m!.participantTotals.find((x) => x.category === "foreign_gov")?.planned).toBe(6); // derived from the delegation size
  });

  it("creates a new organization when none matches", async () => {
    const created = await createMeeting(t.db, sample({ requestor: { name: "Ana Souza", organizationName: "Agência Nova", organizationKind: "ministry", email: "ana@nova.example" } }), coordinator, NOW);
    const m = await makeMeetingsRepo(t.db).get(created.id);
    expect(m!.organization?.name).toBe("Agência Nova");
    expect(m!.organization?.countryCode).toBe("CI");
  });

  it("refuses users who cannot create meetings", async () => {
    await expect(createMeeting(t.db, sample(), viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});

describe("transitionMeeting", () => {
  it("enforces the status machine, writes activity and audit rows, and supports hold/resume", async () => {
    const { id } = await createMeeting(t.db, sample(), coordinator, NOW);
    const repo = makeMeetingsRepo(t.db);

    expect(await transitionMeeting(t.db, { meetingId: id, to: "developing" }, coordinator, NOW)).toEqual({ ok: true, status: "developing" });
    expect(await transitionMeeting(t.db, { meetingId: id, to: "confirmed" }, coordinator, NOW)).toEqual({ ok: false, reason: "Confirming requires an accepted meeting date." });

    const before = await repo.get(id);
    await acceptDate(t.db, before!.candidateDates[0]!.id, coordinator, NOW);
    expect(await transitionMeeting(t.db, { meetingId: id, to: "confirmed", note: "Cleared by front office." }, coordinator, NOW)).toEqual({ ok: true, status: "confirmed" });

    const confirmed = await repo.get(id);
    expect(confirmed!.status).toBe("confirmed");
    expect(confirmed!.scheduledStart).not.toBeNull();
    expect(confirmed!.activities[0]).toMatchObject({ kind: "status_change" });
    expect(confirmed!.activities[0]!.body).toContain("Confirmed");
    const audit = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, id));
    expect(audit.some((a) => a.action === "transition" && (a.diff as { to?: string }).to === "confirmed")).toBe(true);

    expect(await transitionMeeting(t.db, { meetingId: id, to: "on_hold" }, coordinator, NOW)).toMatchObject({ ok: false });
    expect(await transitionMeeting(t.db, { meetingId: id, to: "on_hold", holdReason: "Visa delays", holdFollowUpAt: new Date("2026-09-15T14:00:00Z") }, coordinator, NOW)).toEqual({ ok: true, status: "on_hold" });
    const held = await repo.get(id);
    expect(held!.previousStatus).toBe("confirmed");
    expect(held!.holdReason).toBe("Visa delays");
    expect(held!.activities[0]).toMatchObject({ kind: "hold" });

    expect(await resumeMeeting(t.db, id, coordinator, NOW)).toEqual({ ok: true, status: "confirmed" });
    const resumed = await repo.get(id);
    expect(resumed!.status).toBe("confirmed");
    expect(resumed!.previousStatus).toBeNull();
    expect(resumed!.holdReason).toBeNull();
    expect(resumed!.activities[0]).toMatchObject({ kind: "resume" });
  });

  it("refuses transitions from users without permission and unknown meetings", async () => {
    const { id } = await createMeeting(t.db, sample(), coordinator, NOW);
    await expect(transitionMeeting(t.db, { meetingId: id, to: "developing" }, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
    await expect(transitionMeeting(t.db, { meetingId: "nope", to: "developing" }, coordinator, NOW)).rejects.toThrow(/not found/i);
  });
});
