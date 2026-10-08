// @vitest-environment node
import { seedAll } from "@/db/seed";
import { CreateMeetingInput, type CreateMeetingInputRaw } from "@/lib/api/schemas";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { addDocument } from "@/lib/services/documents";
import { createMeeting } from "@/lib/services/meetings";
import { search } from "@/lib/services/search";

const NOW = new Date("2026-08-29T14:00:00Z");
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };

const make = (headline: string, org: string, cca2: string, regionId: string, topicId: string): CreateMeetingInputRaw => ({
  requestor: { name: "Delegation Lead", organizationName: org, organizationKind: "regulator", email: `lead@${org.toLowerCase()}.example` },
  countryCodes: [cca2],
  regionId,
  delegation: { headline, size: 4 },
  topics: [{ topicId }],
  dates: { preferredStart: "2026-10-14T14:00:00Z", format: "virtual" },
});

let t: TestDb;
let artci: { id: string; code: string };
beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW, meetingCount: 0 });
  artci = await createMeeting(t.db, CreateMeetingInput.parse(make("Spectrum Sharing Study Visit", "ARTCI", "CI", "af", "spectrum-sharing")), coordinator, NOW);
  await addDocument(t.db, { meetingId: artci.id, kind: "agenda_final", title: "Final agenda — ARTCI study visit", reusable: false }, coordinator, NOW);
  await createMeeting(t.db, CreateMeetingInput.parse(make("Satellite Licensing Briefing", "ARTCI", "CI", "af", "satellite-licensing")), coordinator, NOW);
  await createMeeting(t.db, CreateMeetingInput.parse(make("Broadband Mapping Exchange", "Ofcom", "GB", "eur", "broadband-mapping")), coordinator, NOW);
  await createMeeting(t.db, CreateMeetingInput.parse(make("Regulator Study Visit", "ACMA", "AU", "eap", "spectrum-auctions")), coordinator, NOW);
}, 60_000);
afterAll(() => t.close());

describe("search", () => {
  it("puts the matching organization first, then its meetings", async () => {
    const hits = await search(t.db, "ARTCI");
    expect(hits[0]).toMatchObject({ kind: "organization" });
    expect(hits[0]!.title).toContain("ARTCI");
    const meetingHits = hits.filter((h) => h.kind === "meeting");
    expect(meetingHits.slice(0, 2).map((h) => h.title).sort()).toEqual(["Satellite Licensing Briefing", "Spectrum Sharing Study Visit"]);
    expect(meetingHits.map((h) => h.title)).not.toContain("Broadband Mapping Exchange");
    expect(hits.every((h) => h.href.startsWith("/"))).toBe(true);
  });

  it("fuzzy-matches accented country names", async () => {
    const hits = await search(t.db, "cote");
    expect(hits.some((h) => h.kind === "country" && h.title === "Côte d'Ivoire")).toBe(true);
  });

  it("finds meetings by topic, IVP code and people", async () => {
    const byTopic = await search(t.db, "spectrum");
    const titles = byTopic.filter((h) => h.kind === "meeting").map((h) => h.title);
    expect(titles).toContain("Spectrum Sharing Study Visit");
    expect(titles).toContain("Regulator Study Visit"); // tagged Spectrum Auctions, title says nothing about spectrum

    const byCode = await search(t.db, "IVP-2027-003");
    expect(byCode[0]).toMatchObject({ kind: "meeting", title: "Broadband Mapping Exchange" });

    const people = await search(t.db, "lindqvist");
    expect(people.some((h) => h.kind === "staff" && h.title === "Tomas Lindqvist")).toBe(true);
  });

  it("finds a document by its title and opens it in the library", async () => {
    const hits = await search(t.db, "agenda");
    const doc = hits.find((h) => h.kind === "document");
    expect(doc).toMatchObject({ title: "Final agenda — ARTCI study visit", countryCode: "CI" });
    expect(doc!.subtitle).toBe(`Final Agenda · ${artci.code} · Côte d'Ivoire`);
    expect(doc!.href).toBe(`/documents?doc=${doc!.id}`);
  });

  it("returns nothing for blank queries", async () => {
    expect(await search(t.db, "   ")).toEqual([]);
  });
});
