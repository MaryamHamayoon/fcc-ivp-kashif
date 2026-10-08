// @vitest-environment node
import { asc } from "drizzle-orm";
import { BUREAUS } from "@/db/seed/fixtures/bureaus";
import { DEMO_USERS, seedAll, seedIfEmpty } from "@/db/seed";
import * as s from "@/lib/db/schema";
import { createTestDb } from "@/lib/db/test-db";
import { MEETING_STATUSES } from "@/lib/domain/types";

const NOW = new Date("2026-08-29T14:00:00Z");

describe("seed", () => {
  it("builds a complete, realistic dataset", async () => {
    const { db, close } = await createTestDb();
    try {
      const summary = await seedAll(db, { seed: 7, now: NOW });
      expect(summary.regions).toBe(7);
      expect(summary.countries).toBeGreaterThanOrEqual(200);
      expect(summary.bureaus).toBe(BUREAUS.length);
      expect(summary.topics).toBeGreaterThanOrEqual(30);
      expect(summary.organizations).toBeGreaterThanOrEqual(40);
      expect(summary.staff).toBeGreaterThanOrEqual(60);
      expect(summary.users).toBe(8);
      expect(summary.meetings).toBeGreaterThanOrEqual(110);
      expect(summary.meetings).toBeLessThanOrEqual(130);

      const meetings = await db.query.meetings.findMany({
        with: { topics: true, activities: true, candidateDates: true, experts: true, participantTotals: true, documents: true },
      });
      expect(meetings).toHaveLength(summary.meetings);

      for (const m of meetings) {
        expect(m.topics.length, `${m.code} topics`).toBeGreaterThan(0);
        expect(m.activities.length, `${m.code} activities`).toBeGreaterThan(0);
        expect(m.candidateDates.length > 0 || m.scheduledStart !== null, `${m.code} dates`).toBe(true);
        expect(m.code).toBe(`IVP-${m.fiscalYear}-${String(m.sequence).padStart(3, "0")}`);
        if (m.status === "confirmed" || m.status === "completed" || m.status === "closed") {
          expect(m.scheduledStart, `${m.code} scheduledStart`).not.toBeNull();
          expect(m.candidateDates.some((d) => d.status === "accepted"), `${m.code} accepted date`).toBe(true);
          expect(m.experts.some((e) => e.status === "confirmed"), `${m.code} confirmed expert`).toBe(true);
        }
        if (m.status === "on_hold") {
          expect(m.holdReason).toBeTruthy();
          expect(m.holdFollowUpAt).not.toBeNull();
          expect(m.previousStatus).not.toBeNull();
        }
        if (m.status === "cancelled") expect(m.cancelReason).toBeTruthy();
        if (m.status === "completed" || m.status === "closed") {
          expect(m.participantTotals.length).toBeGreaterThan(0);
          expect(m.completedAt).not.toBeNull();
        }
      }
      expect(new Set(meetings.map((m) => m.code)).size).toBe(meetings.length);

      const statuses = new Set(meetings.map((m) => m.status));
      for (const status of MEETING_STATUSES) expect(statuses.has(status), status).toBe(true);

      const byFy = new Map<number, number>();
      for (const m of meetings) byFy.set(m.fiscalYear, (byFy.get(m.fiscalYear) ?? 0) + 1);
      expect(byFy.get(2025) ?? 0).toBeGreaterThanOrEqual(40);
      expect(byFy.get(2026) ?? 0).toBeGreaterThanOrEqual(40);

      // Something is waiting on someone right now — the dashboard's attention rail needs it.
      const openWaits = meetings.flatMap((m) => m.activities).filter((a) => a.waitingOn !== "none" && a.resolvedAt === null);
      expect(openWaits.length).toBeGreaterThanOrEqual(10);
      expect(meetings.some((m) => m.ochAttending)).toBe(true);

      const users = await db.select().from(s.users).orderBy(asc(s.users.email));
      expect(users.map((u) => u.role).sort()).toEqual(
        ["admin", "coordinator", "regional_lead", "regional_lead", "regional_lead", "expert", "executive", "viewer"].sort(),
      );
      expect(DEMO_USERS.map((u) => u.email).sort()).toEqual(users.map((u) => u.email).sort());

      // Phase 2: every seeded document is a real PDF rendered from its own record on request.
      const documents = meetings.flatMap((m) => m.documents);
      expect(documents.length).toBeGreaterThanOrEqual(100);
      for (const d of documents) {
        expect(d.mime, d.id).toBe("application/pdf");
        expect(d.filename, d.id).toMatch(/^[a-z0-9-]+\.pdf$/);
        expect(d.storageKey, d.id).toMatch(/^seed:\/\/doc_/);
      }
      const originals = documents.filter((d) => d.sourceDocumentId === null);
      for (const d of originals) expect(d.storageKey).toBe(`seed://${d.id}`);

      // A few starred decks travelled to later meetings on the same topic.
      const byId = new Map(documents.map((d) => [d.id, d]));
      const meetingById = new Map(meetings.map((m) => [m.id, m]));
      const reused = documents.filter((d) => d.sourceDocumentId !== null);
      expect(reused.length).toBeGreaterThanOrEqual(3);
      expect(reused.length).toBeLessThanOrEqual(8);
      for (const copy of reused) {
        const source = byId.get(copy.sourceDocumentId!);
        expect(source, copy.id).toBeDefined();
        expect(source!.reusable).toBe(true);
        expect(source!.kind).toBe("briefing_deck");
        expect(source!.meetingId).not.toBe(copy.meetingId);
        expect(copy.storageKey).toBe(source!.storageKey);
        expect(copy.reusable).toBe(false);
        expect(copy.addedAt.getTime()).toBeGreaterThanOrEqual(source!.addedAt.getTime());
        const sourceTopics = new Set(meetingById.get(source!.meetingId)!.topics.map((t) => t.topicId));
        expect(meetingById.get(copy.meetingId)!.topics.some((t) => sourceTopics.has(t.topicId)), copy.id).toBe(true);
        expect(meetingById.get(copy.meetingId)!.activities.some((a) => a.kind === "document_added" && a.body.includes("reused from")), copy.id).toBe(true);
      }
      // One deck per meeting: reuse never doubles a slot.
      for (const m of meetings) expect(m.documents.filter((d) => d.kind === "briefing_deck").length, `${m.code} decks`).toBeLessThanOrEqual(1);
    } finally {
      await close();
    }
  });

  it("is deterministic across databases and seedIfEmpty runs once", async () => {
    const a = await createTestDb();
    const b = await createTestDb();
    try {
      expect(await seedIfEmpty(a.db, { seed: 7, now: NOW })).toBe(true);
      await seedAll(b.db, { seed: 7, now: NOW });
      const snapshot = (db: typeof a.db) =>
        db.select({ code: s.meetings.code, title: s.meetings.title, status: s.meetings.status }).from(s.meetings).orderBy(asc(s.meetings.code));
      expect(await snapshot(a.db)).toEqual(await snapshot(b.db));
      expect(await seedIfEmpty(a.db, { seed: 7, now: NOW })).toBe(false);
    } finally {
      await a.close();
      await b.close();
    }
  });
});
