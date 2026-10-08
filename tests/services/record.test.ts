// @vitest-environment node
import { eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { allowedTransitions } from "@/lib/domain/status-machine";
import { isAppError } from "@/lib/services/errors";
import { getMeetingRecord } from "@/lib/services/record";

const NOW = new Date("2026-08-29T14:00:00Z");
const admin: PolicyUser = { id: "usr_admin", role: "admin", regionIds: [], staffId: null };
const viewer: PolicyUser = { id: "usr_viewer", role: "viewer", regionIds: [], staffId: null };
/** An expert may only read the meetings they were actually asked to brief. */
const stranger: PolicyUser = { id: "usr_stranger", role: "expert", regionIds: [], staffId: "stf_nobody" };

let t: TestDb;
let sample: { id: string; code: string; regionId: string };

beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { now: NOW });
  const [row] = await t.db.select({ id: s.meetings.id, code: s.meetings.code, regionId: s.meetings.regionId }).from(s.meetings).where(eq(s.meetings.status, "confirmed")).limit(1);
  if (!row) throw new Error("seed produced no confirmed meeting");
  sample = row;
});
afterAll(async () => {
  await t.close();
});

describe("getMeetingRecord", () => {
  it("loads a meeting by id with everything the record derives", async () => {
    const record = await getMeetingRecord(t.db, sample.id, admin, NOW);

    expect(record.id).toBe(sample.id);
    expect(record.href).toBe(`/meetings/${sample.id}`);
    expect(record.now).toEqual(NOW);
    expect(record.regionName).not.toBe("");
    expect(record.countryNames[0]).toBe(record.countryName);
    expect(record.readiness.items).toHaveLength(6);
    expect(record.allowed).toEqual(allowedTransitions(record.status));
    expect(record.hasAcceptedDate).toBe(record.scheduledStart !== null || record.acceptedDate !== null);
    expect(record.terminal).toBe(false);
    expect(record.counts.experts).toBe(record.experts.length);
    expect(record.counts.openWaiting).toBe(record.activities.filter((a) => a.waitingOn !== "none" && a.resolvedAt === null).length);
  });

  it("accepts the IVP code as well as the id, and lands on the same record", async () => {
    const byCode = await getMeetingRecord(t.db, sample.code, admin, NOW);
    expect(byCode.id).toBe(sample.id);
    expect(byCode.href).toBe(`/meetings/${sample.id}`);
  });

  it("reports an unknown meeting as not found", async () => {
    await expect(getMeetingRecord(t.db, "mtg_does_not_exist", admin, NOW)).rejects.toSatisfy((e: unknown) => isAppError(e) && e.status === 404);
  });

  it("hides a meeting the reader may not see behind the same 404", async () => {
    await expect(getMeetingRecord(t.db, sample.id, stranger, NOW)).rejects.toSatisfy((e: unknown) => isAppError(e) && e.status === 404);
  });

  it("computes permissions from the policy, not the caller", async () => {
    const asAdmin = await getMeetingRecord(t.db, sample.id, admin, NOW);
    expect(asAdmin.permissions).toEqual({ transition: true, update: true, logActivity: true, addExpert: true, addDocument: true, respondAsExpert: true });

    const asViewer = await getMeetingRecord(t.db, sample.id, viewer, NOW);
    expect(asViewer.permissions).toEqual({ transition: false, update: false, logActivity: false, addExpert: false, addDocument: false, respondAsExpert: false });
  });
});
