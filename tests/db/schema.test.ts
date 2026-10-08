// @vitest-environment node
import { createTestDb } from "@/lib/db/test-db";
import * as s from "@/lib/db/schema";

describe("database schema", () => {
  it("migrates a fresh PGlite database, stores a connected meeting, and loads relations", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(s.regions).values({ id: "af", name: "Africa", sortOrder: 1 });
      await db.insert(s.countries).values({ cca2: "CI", cca3: "CIV", ccn3: "384", name: "Côte d'Ivoire", regionId: "af", lat: 8, lng: -5 });
      await db.insert(s.organizations).values({ id: "o1", name: "ARTCI", kind: "regulator", countryCode: "CI" });
      await db.insert(s.users).values({ id: "u1", name: "Priya Natarajan", email: "priya.natarajan@example.gov", role: "coordinator" });
      await db.insert(s.meetings).values({
        id: "m1",
        code: "IVP-2026-001",
        fiscalYear: 2026,
        sequence: 1,
        title: "Satellite Licensing Framework",
        status: "developing",
        format: "virtual",
        regionId: "af",
        primaryCountryCode: "CI",
        organizationId: "o1",
        coordinatorUserId: "u1",
        requestedAt: new Date("2026-01-10T12:00:00Z"),
      });
      await db.insert(s.activities).values({
        id: "a1",
        meetingId: "m1",
        kind: "email_out",
        body: "Emailed POC to confirm 8/26 by 8/6.",
        occurredAt: new Date("2026-08-06T12:00:00Z"),
        authorId: "u1",
        waitingOn: "visitor",
        waitingOnLabel: "ARTCI POC",
      });

      const m = await db.query.meetings.findFirst({
        where: (t, { eq }) => eq(t.id, "m1"),
        with: { activities: true, organization: true, primaryCountry: { with: { region: true } }, coordinator: true },
      });
      expect(m?.code).toBe("IVP-2026-001");
      expect(m?.organization?.name).toBe("ARTCI");
      expect(m?.primaryCountry?.name).toBe("Côte d'Ivoire");
      expect(m?.primaryCountry?.region?.name).toBe("Africa");
      expect(m?.coordinator?.role).toBe("coordinator");
      expect(m?.activities).toHaveLength(1);
      expect(m?.activities[0]?.waitingOn).toBe("visitor");
      expect(m?.activities[0]?.occurredAt).toBeInstanceOf(Date);
      expect(m?.regionId).toBe("af");
    } finally {
      await close();
    }
  });

  it("enforces unique meeting codes and cascades child rows on delete", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(s.regions).values({ id: "eur", name: "Europe" });
      await db.insert(s.countries).values({ cca2: "GB", cca3: "GBR", ccn3: "826", name: "United Kingdom", regionId: "eur", lat: 54, lng: -2 });
      const base = { fiscalYear: 2026, sequence: 7, title: "Ofcom visit", regionId: "eur", primaryCountryCode: "GB", requestedAt: new Date() };
      await db.insert(s.meetings).values({ id: "m1", code: "IVP-2026-007", ...base });
      await expect(db.insert(s.meetings).values({ id: "m2", code: "IVP-2026-007", ...base })).rejects.toThrow();

      await db.insert(s.meetingCandidateDates).values({ id: "d1", meetingId: "m1", start: new Date("2026-09-01T14:00:00Z"), proposedBy: "fcc" });
      await db.delete(s.meetings).where((await import("drizzle-orm")).eq(s.meetings.id, "m1"));
      expect(await db.select().from(s.meetingCandidateDates)).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("has the trigram extension available for fuzzy search", async () => {
    const { db, close } = await createTestDb();
    try {
      const { sql } = await import("drizzle-orm");
      const r = await db.execute(sql`SELECT similarity('Cote dIvoire', 'Côte d''Ivoire') AS sim`);
      const sim = Number((r.rows[0] as { sim: number }).sim);
      expect(sim).toBeGreaterThan(0.3);
    } finally {
      await close();
    }
  });

  it("stores document bytes and provenance (Phase 2)", async () => {
    const { db, close } = await createTestDb();
    try {
      const { sql } = await import("drizzle-orm");
      const { execRows } = await import("@/lib/db/factory");
      await db.insert(s.documentBlobs).values({ id: "blb_1", mime: "application/pdf", size: 4, sha256: "abcd", bytes: new Uint8Array([37, 80, 68, 70]) });
      const [blob] = await db.select().from(s.documentBlobs);
      expect(Array.from(blob!.bytes)).toEqual([37, 80, 68, 70]);
      expect(blob!.bytes).toBeInstanceOf(Uint8Array);

      const cols = await execRows<{ column_name: string }>(db, sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'meeting_documents'`);
      const names = cols.map((c) => c.column_name);
      for (const col of ["filename", "mime", "size", "sha256", "source_document_id"]) expect(names).toContain(col);
    } finally {
      await close();
    }
  });
});
