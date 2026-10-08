// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import { seedAll } from "@/db/seed";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import { DOCUMENT_KINDS } from "@/lib/domain/types";
import { renderSeedPdf, safeText, type SeedPdfInput, synthesizeSeedDocument } from "@/lib/integrations/seed-documents";

const NOW = new Date("2026-08-29T14:00:00Z");

const base: SeedPdfInput = {
  kind: "agenda_final",
  title: "Final agenda — ARTCI study visit",
  version: 2,
  addedAt: NOW,
  meeting: {
    code: "IVP-2026-018",
    title: "ARTCI study visit — spectrum sharing",
    purpose: "Compare CBRS-style sharing frameworks.",
    format: "in_person",
    scheduledStart: new Date("2026-09-10T14:00:00Z"),
    scheduledEnd: new Date("2026-09-10T17:00:00Z"),
    location: "Room TW-C305",
    countryName: "Côte d'Ivoire",
    orgName: "ARTCI",
    leadName: "Priya Raman",
    fiscalYear: 2026,
  },
  topics: ["Spectrum sharing", "Dynamic spectrum access"],
  agenda: [
    { startsAt: new Date("2026-09-10T14:00:00Z"), endsAt: new Date("2026-09-10T14:10:00Z"), title: "Welcome and introductions (OIA)", briefers: [] },
    { startsAt: new Date("2026-09-10T14:10:00Z"), endsAt: new Date("2026-09-10T14:50:00Z"), title: "Spectrum sharing — FCC overview and discussion", briefers: ["Dana Whitfield"] },
  ],
  participants: [{ name: "Aminata Koné", title: "Director", category: "foreign_gov", organization: "ARTCI" }],
  experts: [{ name: "Dana Whitfield", bureau: "OEA", role: "briefer" }],
  candidateDates: [new Date("2026-09-10T14:00:00Z")],
};

const header = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5));
/** pdf-lib rewrites the producer on load unless told not to; the assertions are about our bytes. */
const load = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false });

describe("safeText", () => {
  it("keeps Latin-1, maps typographic punctuation and folds what the standard fonts cannot encode", () => {
    expect(safeText("Côte d'Ivoire — “quotes” …")).toBe("Côte d'Ivoire - \"quotes\" ...");
    expect(safeText("Việt Nam")).toBe("Viet Nam");
    expect(safeText("会议 ✓")).toBe("?? ?");
  });
});

describe("renderSeedPdf", () => {
  for (const kind of DOCUMENT_KINDS) {
    it(`renders a real PDF for ${kind}`, async () => {
      const bytes = await renderSeedPdf({ ...base, kind });
      expect(header(bytes)).toBe("%PDF-");
      const doc = await load(bytes);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      expect(doc.getTitle()).toBe("Final agenda - ARTCI study visit");
      expect(doc.getProducer()).toBe("FCC International Visitors Program");
    });
  }

  it("gives a deck one slide per topic plus a title and a closing slide", async () => {
    const doc = await load(await renderSeedPdf({ ...base, kind: "briefing_deck" }));
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(0).getWidth()).toBeGreaterThan(doc.getPage(0).getHeight());
  });

  it("is deterministic for the same input", async () => {
    const a = await renderSeedPdf(base);
    const b = await renderSeedPdf(base);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("survives characters outside the standard font's range", async () => {
    await expect(renderSeedPdf({ ...base, title: "Agenda — Việt Nam ✓ 会议", topics: ["Über-broadband ✓"] })).resolves.toBeInstanceOf(Uint8Array);
  });

  it("copes with an empty record", async () => {
    const empty: SeedPdfInput = { ...base, kind: "participant_list", agenda: [], participants: [], experts: [], candidateDates: [], topics: [], meeting: { ...base.meeting, scheduledStart: null, scheduledEnd: null, purpose: null, location: null, leadName: null } };
    for (const kind of DOCUMENT_KINDS) expect(header(await renderSeedPdf({ ...empty, kind }))).toBe("%PDF-");
  });
});

describe("synthesizeSeedDocument", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await seedAll(t.db, { seed: 7, now: NOW });
  });
  afterAll(() => t.close());

  it("builds a PDF from a seeded document's own record", async () => {
    const [doc] = await t.db.select().from(s.meetingDocuments).limit(1);
    const blob = await synthesizeSeedDocument(t.db, doc!.id);
    expect(blob?.mime).toBe("application/pdf");
    expect(header(blob!.bytes)).toBe("%PDF-");
    expect(blob!.size).toBe(blob!.bytes.byteLength);
    expect(blob!.sha256).toBeNull();
  });

  it("renders every kind the seed produced", async () => {
    const docs = await t.db.select().from(s.meetingDocuments);
    const oneOfEach = new Map(docs.map((d) => [d.kind, d]));
    expect(oneOfEach.size).toBeGreaterThanOrEqual(6);
    for (const doc of oneOfEach.values()) {
      const blob = await synthesizeSeedDocument(t.db, doc.id);
      expect(header(blob!.bytes), doc.kind).toBe("%PDF-");
    }
  });

  it("returns null for an unknown id", async () => {
    expect(await synthesizeSeedDocument(t.db, "doc_nope")).toBeNull();
  });
});
