// @vitest-environment node
import { seedAll } from "@/db/seed";
import { CreateMeetingInput } from "@/lib/api/schemas";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { logActivity, resolveActivity } from "@/lib/services/activities";
import { acceptDate, declineDate, proposeDate } from "@/lib/services/dates";
import { PolicyError } from "@/lib/services/errors";
import { addExpert, requestExpert, respondExpert } from "@/lib/services/experts";
import { createMeeting } from "@/lib/services/meetings";

const NOW = new Date("2026-08-29T14:00:00Z");
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
const tomas: PolicyUser = { id: "usr_tomas", role: "expert", regionIds: [], staffId: "stf_tomas" };
const otherExpert: PolicyUser = { id: "usr_other", role: "expert", regionIds: [], staffId: "stf_0001" };

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
      delegation: { headline: "NGSO Licensing Briefing", size: 4 },
      topics: [{ topicId: "ngso" }],
      dates: { preferredStart: "2026-10-14T14:00:00Z", format: "virtual" },
    }),
    coordinator,
    NOW,
  );
  meetingId = created.id;
});
afterEach(() => t.close());

const detail = () => makeMeetingsRepo(t.db).get(meetingId, NOW).then((m) => m!);

describe("activities", () => {
  it("logs a waiting-on entry and resolves it", async () => {
    const at = new Date("2026-08-20T14:00:00Z");
    const { id } = await logActivity(t.db, { meetingId, kind: "email_out", body: "Emailed POC to confirm 10/14 by 8/27.", waitingOn: "visitor", waitingOnLabel: "ARTCI POC", occurredAt: at, nextAction: "Follow up" }, coordinator, NOW);
    const waiting = (await detail()).waiting;
    expect(waiting).toMatchObject({ who: "visitor", label: "ARTCI POC", activityId: id, band: "warn" });
    expect(waiting!.businessDays).toBe(6); // Thu Aug 20 → Sat Aug 29: Fri, Mon–Fri

    await resolveActivity(t.db, id, coordinator, NOW);
    expect((await detail()).waiting).toBeNull();
    const resolved = (await detail()).activities.find((a) => a.id === id)!;
    expect(resolved.resolvedAt).toEqual(NOW);
    expect(resolved.resolvedById).toBe("usr_priya");
  });

  it("lets a note resolve an earlier wait in the same call", async () => {
    const ask = await logActivity(t.db, { meetingId, kind: "email_out", body: "Asked for bios.", waitingOn: "visitor", waitingOnLabel: "ARTCI POC" }, coordinator, NOW);
    await logActivity(t.db, { meetingId, kind: "email_in", body: "Bios received.", resolvesActivityId: ask.id }, coordinator, NOW);
    expect((await detail()).waiting).toBeNull();
  });

  it("refuses users without activity.create", async () => {
    const viewer: PolicyUser = { id: "usr_ingrid", role: "viewer", regionIds: [], staffId: null };
    await expect(logActivity(t.db, { meetingId, kind: "note", body: "x" }, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});

describe("experts", () => {
  it("adds, requests and confirms an expert, resolving the wait", async () => {
    const { id: meetingExpertId } = await addExpert(t.db, { meetingId, staffId: "stf_tomas", role: "lead" }, coordinator, NOW);
    expect((await detail()).experts[0]).toMatchObject({ staffId: "stf_tomas", status: "tbd", role: "lead" });

    await requestExpert(t.db, meetingExpertId, coordinator, NOW);
    let m = await detail();
    expect(m.experts[0]!.status).toBe("requested");
    expect(m.waiting).toMatchObject({ who: "expert", label: "Tomas Lindqvist" });
    expect(m.activities[0]).toMatchObject({ kind: "expert_requested" });

    await expect(respondExpert(t.db, { meetingExpertId, status: "confirmed" }, otherExpert, NOW)).rejects.toBeInstanceOf(PolicyError);
    await respondExpert(t.db, { meetingExpertId, status: "confirmed", note: "Happy to brief." }, tomas, NOW);
    m = await detail();
    expect(m.experts[0]).toMatchObject({ status: "confirmed", note: "Happy to brief." });
    expect(m.experts[0]!.respondedAt).toEqual(NOW);
    expect(m.waiting).toBeNull();
    expect(m.activities[0]).toMatchObject({ kind: "expert_confirmed" });
    expect(m.readiness.items.find((i) => i.key === "experts")?.done).toBe(true);
  });

  it("records a decline", async () => {
    const { id } = await addExpert(t.db, { meetingId, staffId: "stf_tomas" }, coordinator, NOW);
    await requestExpert(t.db, id, coordinator, NOW);
    await respondExpert(t.db, { meetingExpertId: id, status: "declined", note: "On travel." }, tomas, NOW);
    const m = await detail();
    expect(m.experts[0]!.status).toBe("declined");
    expect(m.activities[0]).toMatchObject({ kind: "expert_declined" });
    expect(m.waiting).toBeNull();
  });
});

describe("dates", () => {
  it("proposes, accepts and declines candidate dates", async () => {
    const start = new Date("2026-10-21T14:00:00Z");
    const { id } = await proposeDate(t.db, { meetingId, start, proposedBy: "fcc", note: "Expert available" }, coordinator, NOW);
    let m = await detail();
    expect(m.candidateDates).toHaveLength(2);
    expect(m.waiting).toMatchObject({ who: "visitor" });
    expect(m.activities[0]).toMatchObject({ kind: "date_proposed" });

    await acceptDate(t.db, id, coordinator, NOW);
    m = await detail();
    expect(m.scheduledStart).toEqual(start);
    expect(m.scheduledEnd!.getTime()).toBeGreaterThan(start.getTime());
    expect(m.candidateDates.find((d) => d.id === id)!.status).toBe("accepted");
    expect(m.waiting).toBeNull();
    expect(m.activities[0]).toMatchObject({ kind: "date_confirmed" });
    expect(m.readiness.items.find((i) => i.key === "dates")?.done).toBe(true);

    const other = m.candidateDates.find((d) => d.id !== id)!;
    await declineDate(t.db, other.id, coordinator, NOW);
    m = await detail();
    expect(m.candidateDates.find((d) => d.id === other.id)!.status).toBe("declined");
    expect(m.scheduledStart).toEqual(start);
  });
});
