// @vitest-environment node
import { seedAll } from "@/db/seed";
import { DocumentLibraryQuery } from "@/lib/api/schemas";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { DOCUMENT_KINDS, MEETING_STATUSES } from "@/lib/domain/types";
import { NotFoundError, PolicyError } from "@/lib/services/errors";
import { getDocumentDetail, libraryOptions, listLibrary } from "@/lib/services/library";

const NOW = new Date("2026-08-29T14:00:00Z");
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
const executive: PolicyUser = { id: "usr_exec", role: "executive", regionIds: [], staffId: null };
const q = (over: Record<string, unknown> = {}) => DocumentLibraryQuery.parse(over);

let t: TestDb;
let expert: PolicyUser;
let expertMeetings: Set<string>;

beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW });
  const rows = await t.db.select({ staffId: s.meetingExperts.staffId, meetingId: s.meetingExperts.meetingId }).from(s.meetingExperts);
  const staffId = rows[0]!.staffId;
  expert = { id: "usr_expert", role: "expert", regionIds: [], staffId };
  expertMeetings = new Set(rows.filter((r) => r.staffId === staffId).map((r) => r.meetingId));
}, 60_000);
afterAll(() => t.close());

describe("listLibrary", () => {
  it("shows a coordinator the whole shelf", async () => {
    const { items, total } = await listLibrary(t.db, q({ pageSize: 200 }), coordinator);
    expect(total).toBeGreaterThan(100);
    expect(items.length).toBeGreaterThan(0);
  });

  it("shows an executive the same shelf, read-only", async () => {
    const all = await listLibrary(t.db, q({ pageSize: 10 }), coordinator);
    const exec = await listLibrary(t.db, q({ pageSize: 10 }), executive);
    expect(exec.total).toBe(all.total);
  });

  it("narrows an expert to their own briefings", async () => {
    const { items, total } = await listLibrary(t.db, q({ pageSize: 200 }), expert);
    expect(total).toBeGreaterThan(0);
    for (const d of items) expect(expertMeetings.has(d.meetingId), d.id).toBe(true);
  });

  it("refuses an expert with no staff record rather than showing nothing quietly", async () => {
    const orphan: PolicyUser = { id: "usr_ghost", role: "expert", regionIds: [], staffId: null };
    await expect(listLibrary(t.db, q(), orphan)).rejects.toBeInstanceOf(PolicyError);
  });
});

describe("libraryOptions", () => {
  it("offers every filter value that exists on the shelf, in display order", async () => {
    const options = await libraryOptions(t.db, coordinator);

    expect(options.kinds.map((k) => k.value)).toEqual([...DOCUMENT_KINDS]);
    expect(options.statuses.map((k) => k.value)).toEqual([...MEETING_STATUSES]);
    expect(options.fiscalYears.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < options.fiscalYears.length; i++) expect(options.fiscalYears[i - 1]).toBeGreaterThan(options.fiscalYears[i]!);
    expect(options.countries.length).toBeGreaterThan(5);
    for (let i = 1; i < options.countries.length; i++) expect(options.countries[i - 1]!.name.localeCompare(options.countries[i]!.name, "en")).toBeLessThan(0);
    expect(options.regions.length).toBeGreaterThanOrEqual(5);
    expect(options.topics.length).toBeGreaterThan(5);
    expect(options.organizations.length).toBeGreaterThan(5);
    expect(options.reusableTopics.length).toBeGreaterThan(0);
    expect(options.reusableTotal).toBeGreaterThan(0);
    expect(options.reusableTotal).toBeLessThanOrEqual(options.reusableTopics.reduce((sum, t) => sum + t.count, 0));
    for (let i = 1; i < options.reusableTopics.length; i++) expect(options.reusableTopics[i - 1]!.count).toBeGreaterThanOrEqual(options.reusableTopics[i]!.count);
  });

  it("only lists what an expert can actually reach", async () => {
    const all = await libraryOptions(t.db, coordinator);
    const mine = await libraryOptions(t.db, expert);
    expect(mine.countries.length).toBeLessThan(all.countries.length);
    expect(mine.kinds).toEqual(all.kinds);
  });
});

describe("getDocumentDetail", () => {
  it("gives a reader the document with every version of its slot", async () => {
    const { items } = await listLibrary(t.db, q({ pageSize: 10 }), coordinator);
    const detail = await getDocumentDetail(t.db, items[0]!.id, executive);
    expect(detail.item.id).toBe(items[0]!.id);
    expect(detail.versions.length).toBeGreaterThanOrEqual(1);
    expect(detail.versions.some((v) => v.id === items[0]!.id)).toBe(true);
  });

  it("answers not found, never forbidden, for a document an expert is not assigned to", async () => {
    const { items } = await listLibrary(t.db, q({ pageSize: 200 }), coordinator);
    const outside = items.find((d) => !expertMeetings.has(d.meetingId));
    expect(outside).toBeDefined();
    await expect(getDocumentDetail(t.db, outside!.id, expert)).rejects.toBeInstanceOf(NotFoundError);
    const staffless: PolicyUser = { id: "usr_ghost", role: "expert", regionIds: [], staffId: null };
    await expect(getDocumentDetail(t.db, outside!.id, staffless)).rejects.toBeInstanceOf(NotFoundError);
  });
});
