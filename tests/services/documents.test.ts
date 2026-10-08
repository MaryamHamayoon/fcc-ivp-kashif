// @vitest-environment node
import { eq } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { CreateMeetingInput } from "@/lib/api/schemas";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import { MAX_UPLOAD_BYTES } from "@/lib/domain/documents";
import type { PolicyUser } from "@/lib/domain/policy";
import { getIntegrations } from "@/lib/integrations";
import { addDocument, openDocument, removeDocument, reuseDocument, toggleReusable, uploadDocument } from "@/lib/services/documents";
import { NotFoundError, PolicyError, ValidationError } from "@/lib/services/errors";
import { createMeeting } from "@/lib/services/meetings";

const NOW = new Date("2026-08-29T14:00:00Z");
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
      topics: [{ topicId: "spectrum-sharing" }],
      dates: { preferredStart: "2026-11-04T15:00:00Z", format: "in_person" },
    }),
    coordinator,
    NOW,
  );
  meetingId = created.id;
});
afterEach(() => t.close());

const shelf = () => getIntegrations(t.db).documentStore.list(meetingId);
const activities = () => t.db.select().from(s.activities).where(eq(s.activities.meetingId, meetingId));
const blobs = () => t.db.select({ id: s.documentBlobs.id }).from(s.documentBlobs);

const pdf = (text = "%PDF-1.4 hello") => ({ name: "Deck.pdf", mime: "application/pdf", bytes: new TextEncoder().encode(text) });

/** A second meeting on the same topic, so a file has somewhere to travel to. */
async function secondMeeting(): Promise<string> {
  const created = await createMeeting(
    t.db,
    CreateMeetingInput.parse({
      requestor: { name: "Wanjiru Kamau", organizationName: "Communications Authority of Kenya", organizationKind: "regulator", email: "w.kamau@ca.example" },
      countryCodes: ["KE"],
      regionId: "af",
      delegation: { headline: "Spectrum sharing follow-up", size: 4 },
      topics: [{ topicId: "spectrum-sharing" }],
      dates: { preferredStart: "2026-12-02T15:00:00Z", format: "virtual" },
    }),
    coordinator,
    NOW,
  );
  return created.id;
}

describe("addDocument", () => {
  it("records metadata through the document store and stamps who added it", async () => {
    const meta = await addDocument(t.db, { meetingId, kind: "briefing_deck", title: "CBRS overview deck" }, coordinator, NOW);

    expect(meta.version).toBe(1);
    expect(meta.reusable).toBe(false);
    expect(meta.addedById).toBe(coordinator.id);
    expect(meta.addedAt).toEqual(NOW);
    expect(meta.storageKey).toBeNull(); // Phase 1 keeps no bytes
    expect(await shelf()).toHaveLength(1);
  });

  it("derives the next version when the same kind is added again", async () => {
    await addDocument(t.db, { meetingId, kind: "agenda_draft", title: "Draft agenda" }, coordinator, NOW);
    const second = await addDocument(t.db, { meetingId, kind: "agenda_draft", title: "Draft agenda (revised)" }, coordinator, NOW);
    const other = await addDocument(t.db, { meetingId, kind: "readout", title: "Readout" }, coordinator, NOW);

    expect(second.version).toBe(2);
    expect(other.version).toBe(1); // versions are per kind, not per meeting
  });

  it("moves readiness without anybody typing a percentage", async () => {
    const before = await makeMeetingsRepo(t.db).get(meetingId, NOW);
    expect(before!.readiness.items.find((i) => i.key === "materials")?.done).toBe(false);

    await addDocument(t.db, { meetingId, kind: "briefing_deck", title: "CBRS overview deck" }, coordinator, NOW);

    const after = await makeMeetingsRepo(t.db).get(meetingId, NOW);
    expect(after!.readiness.items.find((i) => i.key === "materials")?.done).toBe(true);
    expect(after!.readiness.percent).toBeGreaterThan(before!.readiness.percent);
  });

  it("tells the timeline what landed", async () => {
    await addDocument(t.db, { meetingId, kind: "agenda_final", title: "Final agenda", reusable: true }, coordinator, NOW);
    const logged = (await activities()).filter((a) => a.kind === "document_added");
    expect(logged).toHaveLength(1);
    expect(logged[0]!.body).toBe("Final Agenda added — Final agenda.");
  });

  it("refuses a reader who may not add documents", async () => {
    await expect(addDocument(t.db, { meetingId, kind: "readout", title: "Readout" }, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});

describe("toggleReusable", () => {
  it("stars and unstars a document for the next visit on the same topic", async () => {
    const meta = await addDocument(t.db, { meetingId, kind: "briefing_deck", title: "CBRS overview deck" }, coordinator, NOW);

    await toggleReusable(t.db, meta.id, true, coordinator, NOW);
    expect((await shelf())[0]?.reusable).toBe(true);

    await toggleReusable(t.db, meta.id, false, coordinator, NOW);
    expect((await shelf())[0]?.reusable).toBe(false);
  });

  it("reports an unknown document as missing", async () => {
    await expect(toggleReusable(t.db, "doc_nope", true, coordinator, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("removeDocument", () => {
  it("takes the document off the shelf and says who did", async () => {
    const meta = await addDocument(t.db, { meetingId, kind: "agenda_final", title: "Final agenda" }, coordinator, NOW);
    await removeDocument(t.db, meta.id, coordinator, NOW);

    expect(await shelf()).toHaveLength(0);
    const logged = (await activities()).filter((a) => a.kind === "system");
    expect(logged[0]!.body).toBe("Final Agenda removed — Final agenda.");
  });

  it("refuses a reader who may not touch the shelf", async () => {
    const meta = await addDocument(t.db, { meetingId, kind: "readout", title: "Readout" }, coordinator, NOW);
    await expect(removeDocument(t.db, meta.id, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});

/* ------------------------------- Phase 2 -------------------------------- */

describe("uploadDocument", () => {
  it("stores the bytes behind the seam and records a real file", async () => {
    const meta = await uploadDocument(t.db, { meetingId, kind: "briefing_deck", file: pdf() }, coordinator, NOW);

    expect(meta.storageKey).toMatch(/^blob:\/\//);
    expect(meta.title).toBe("Deck");
    expect(meta.filename).toBe("deck.pdf");
    expect(meta.mime).toBe("application/pdf");
    expect(meta.size).toBe(14);
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.version).toBe(1);
    expect(meta.sourceDocumentId).toBeNull();

    const blob = await getIntegrations(t.db).blobStore.get(meta.storageKey!);
    expect(new TextDecoder().decode(blob!.bytes)).toBe("%PDF-1.4 hello");
    const logged = (await activities()).filter((a) => a.kind === "document_added");
    expect(logged[0]!.body).toBe("Briefing Deck uploaded — Deck.");
  });

  it("takes the title it is given and versions an occupied slot", async () => {
    await uploadDocument(t.db, { meetingId, kind: "agenda_final", title: "Final agenda", file: pdf() }, coordinator, NOW);
    const v2 = await uploadDocument(t.db, { meetingId, kind: "agenda_final", title: "Final agenda", reusable: true, file: pdf("%PDF-1.4 v2") }, coordinator, NOW);

    expect(v2.version).toBe(2);
    expect(v2.title).toBe("Final agenda");
    expect(v2.filename).toBe("final-agenda.pdf");
    expect(v2.reusable).toBe(true);
    const logged = (await activities()).filter((a) => a.kind === "document_added");
    expect(logged.map((a) => a.body)).toContain("Final Agenda uploaded — Final agenda (v2).");
  });

  it("refuses a file over the cap, or of an unknown type, before touching storage", async () => {
    await expect(uploadDocument(t.db, { meetingId, kind: "other", file: { name: "big.pdf", mime: "application/pdf", bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1) } }, coordinator, NOW)).rejects.toThrow(/4 MB/);
    await expect(uploadDocument(t.db, { meetingId, kind: "other", file: { name: "tool.exe", mime: "application/octet-stream", bytes: new Uint8Array(12) } }, coordinator, NOW)).rejects.toBeInstanceOf(ValidationError);
    expect(await blobs()).toHaveLength(0);
    expect(await shelf()).toHaveLength(0);
  });

  it("is a document.add decision", async () => {
    await expect(uploadDocument(t.db, { meetingId, kind: "other", file: pdf() }, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
    expect(await blobs()).toHaveLength(0);
  });
});

describe("reuseDocument", () => {
  it("copies the file into another meeting's slot with provenance and an activity", async () => {
    const source = await uploadDocument(t.db, { meetingId, kind: "briefing_deck", title: "CBRS deck", file: pdf() }, coordinator, NOW);
    const other = await secondMeeting();

    const copy = await reuseDocument(t.db, { sourceId: source.id, meetingId: other }, coordinator, NOW);

    expect(copy.meetingId).toBe(other);
    expect(copy.kind).toBe("briefing_deck");
    expect(copy.title).toBe("CBRS deck");
    expect(copy.storageKey).toBe(source.storageKey);
    expect(copy.filename).toBe(source.filename);
    expect(copy.sha256).toBe(source.sha256);
    expect(copy.sourceDocumentId).toBe(source.id);
    expect(copy.reusable).toBe(false);
    expect(copy.version).toBe(1);
    expect(await blobs()).toHaveLength(1); // one file, two shelves

    const sourceRow = await t.db.query.meetings.findFirst({ where: eq(s.meetings.id, meetingId), columns: { code: true } });
    const acts = await t.db.select().from(s.activities).where(eq(s.activities.meetingId, other));
    expect(acts.map((a) => a.body)).toContain(`Briefing Deck reused from ${sourceRow!.code} — CBRS deck.`);
  });

  it("can land in a different slot, and points a chain back at the original", async () => {
    const source = await uploadDocument(t.db, { meetingId, kind: "briefing_deck", title: "CBRS deck", file: pdf() }, coordinator, NOW);
    const other = await secondMeeting();
    const copy = await reuseDocument(t.db, { sourceId: source.id, meetingId: other, kind: "other" }, coordinator, NOW);
    expect(copy.kind).toBe("other");

    const third = await secondMeeting();
    const chained = await reuseDocument(t.db, { sourceId: copy.id, meetingId: third }, coordinator, NOW);
    expect(chained.kind).toBe("other");
    expect(chained.sourceDocumentId).toBe(source.id);
  });

  it("refuses the same meeting, a duplicate slot and a link-only source", async () => {
    const source = await uploadDocument(t.db, { meetingId, kind: "briefing_deck", file: pdf() }, coordinator, NOW);
    await expect(reuseDocument(t.db, { sourceId: source.id, meetingId }, coordinator, NOW)).rejects.toBeInstanceOf(ValidationError);

    const other = await secondMeeting();
    await reuseDocument(t.db, { sourceId: source.id, meetingId: other }, coordinator, NOW);
    await expect(reuseDocument(t.db, { sourceId: source.id, meetingId: other }, coordinator, NOW)).rejects.toThrow(/already holds/);

    const link = await addDocument(t.db, { meetingId, kind: "other", title: "SharePoint memo", storageKey: "sharepoint://OIA/memo.docx" }, coordinator, NOW);
    await expect(reuseDocument(t.db, { sourceId: link.id, meetingId: other }, coordinator, NOW)).rejects.toThrow(/link/);
    await expect(reuseDocument(t.db, { sourceId: "doc_nope", meetingId: other }, coordinator, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("needs document.add on the target", async () => {
    const source = await uploadDocument(t.db, { meetingId, kind: "briefing_deck", file: pdf() }, coordinator, NOW);
    const other = await secondMeeting();
    await expect(reuseDocument(t.db, { sourceId: source.id, meetingId: other }, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});

describe("openDocument", () => {
  it("hands back the bytes to someone who may read the meeting, and hides them from everyone else", async () => {
    const meta = await uploadDocument(t.db, { meetingId, kind: "readout", file: pdf() }, coordinator, NOW);

    const opened = await openDocument(t.db, meta.id, viewer); // a viewer reads every meeting
    expect(opened.meta.id).toBe(meta.id);
    expect(opened.meetingCode).toMatch(/^IVP-/);
    expect(opened.blob?.mime).toBe("application/pdf");
    expect(opened.blob?.size).toBe(14);

    const stranger: PolicyUser = { id: "usr_x", role: "expert", regionIds: [], staffId: "stf_nobody" };
    await expect(openDocument(t.db, meta.id, stranger)).rejects.toBeInstanceOf(NotFoundError);
    await expect(openDocument(t.db, "doc_nope", coordinator)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns no blob for a link-only document", async () => {
    const link = await addDocument(t.db, { meetingId, kind: "other", title: "SharePoint memo", storageKey: "sharepoint://OIA/memo.docx" }, coordinator, NOW);
    expect((await openDocument(t.db, link.id, coordinator)).blob).toBeNull();
  });
});

describe("removeDocument (Phase 2)", () => {
  it("keeps bytes another row still references, and deletes them when the last reference goes", async () => {
    const source = await uploadDocument(t.db, { meetingId, kind: "briefing_deck", file: pdf() }, coordinator, NOW);
    const other = await secondMeeting();
    const copy = await reuseDocument(t.db, { sourceId: source.id, meetingId: other }, coordinator, NOW);

    await removeDocument(t.db, source.id, coordinator, NOW);
    expect(await blobs()).toHaveLength(1);
    expect(await getIntegrations(t.db).blobStore.get(copy.storageKey!)).not.toBeNull();

    await removeDocument(t.db, copy.id, coordinator, NOW);
    expect(await blobs()).toHaveLength(0);
  });
});
