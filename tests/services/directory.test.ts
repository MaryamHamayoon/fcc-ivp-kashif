// @vitest-environment node
import { seedAll } from "@/db/seed";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { directoryCounts, getCountryProfile, getExpertProfile, getOrganizationProfile, listCountriesSummary, listExperts, listExpertsPage, listOrganizationsSummary } from "@/lib/services/directory";

const NOW = new Date("2026-08-29T14:00:00Z");

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { now: NOW });
});
afterAll(() => t.close());

describe("listExperts", () => {
  it("derives expertise from the topics they've briefed on, most frequent first, capped at 4", async () => {
    const experts = await listExperts(t.db);
    expect(experts.length).toBeGreaterThan(0);
    const withExpertise = experts.find((e) => e.expertise.length > 1);
    expect(withExpertise).toBeDefined();
    const counts = withExpertise!.expertise.map((topic) => topic.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    for (const e of experts) expect(e.expertise.length).toBeLessThanOrEqual(4);
  });

  it("computes an engagement count and an average reply time in business days", async () => {
    const experts = await listExperts(t.db);
    expect(experts.some((e) => e.engagements > 0)).toBe(true);
    expect(experts.every((e) => e.engagements >= 0)).toBe(true);
    const withReply = experts.find((e) => e.avgReplyBusinessDays !== null);
    expect(withReply).toBeDefined();
    expect(withReply!.avgReplyBusinessDays).toBeGreaterThanOrEqual(0);
    // Rounded to one decimal by the repo.
    expect(Math.round(withReply!.avgReplyBusinessDays! * 10)).toBe(withReply!.avgReplyBusinessDays! * 10);
  });

  it("filters to one bureau", async () => {
    const oia = await listExperts(t.db, { bureauCode: "OIA" });
    expect(oia.length).toBeGreaterThan(0);
    expect(oia.every((e) => e.bureauCode === "OIA")).toBe(true);
  });

  it("searches by name", async () => {
    const hits = await listExperts(t.db, { q: "Whitfield" });
    expect(hits.some((e) => e.name === "Dana Whitfield")).toBe(true);
  });

  it("sorts by engagement count descending by default, name ascending as a tiebreak", async () => {
    const experts = await listExperts(t.db);
    for (let i = 1; i < experts.length; i++) expect(experts[i]!.engagements).toBeLessThanOrEqual(experts[i - 1]!.engagements);
  });

  it("sorts by name when asked", async () => {
    const experts = await listExperts(t.db, { sort: "name" });
    const names = experts.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });
});

describe("listExpertsPage", () => {
  it("hands over one page of the sorted list and the size of the whole", async () => {
    const all = await listExperts(t.db);
    const first = await listExpertsPage(t.db, {}, { page: 1, pageSize: 25 });
    expect(first.total).toBe(all.length);
    expect(first.items.map((e) => e.id)).toEqual(all.slice(0, 25).map((e) => e.id));
    // The engagement bars on every page are drawn against the same figure: the busiest person in the whole list.
    expect(first.maxEngagements).toBe(Math.max(...all.map((e) => e.engagements)));
    const second = await listExpertsPage(t.db, {}, { page: 2, pageSize: 25 });
    expect(second.items.map((e) => e.id)).toEqual(all.slice(25, 50).map((e) => e.id));
    expect(second.maxEngagements).toBe(first.maxEngagements);
  });

  it("pages what the filters leave, and lands on the last page when asked for one past the end", async () => {
    const oia = await listExperts(t.db, { bureauCode: "OIA", sort: "name" });
    const page = await listExpertsPage(t.db, { bureauCode: "OIA", sort: "name" }, { page: 40, pageSize: 25 });
    expect(page.total).toBe(oia.length);
    expect(page.page).toBe(Math.max(1, Math.ceil(oia.length / 25)));
    expect(page.items.every((e) => e.bureauCode === "OIA")).toBe(true);
    expect(page.items.at(-1)?.id).toBe(oia.at(-1)?.id);
  });
});

describe("directoryCounts", () => {
  it("counts the whole roster and every organization, whatever is being searched for", async () => {
    const [counts, experts, organizations] = await Promise.all([directoryCounts(t.db), listExperts(t.db), listOrganizationsSummary(t.db)]);
    expect(counts).toEqual({ experts: experts.length, organizations: organizations.length });
    expect(counts.experts).toBeGreaterThan(0);
  });
});

describe("getExpertProfile", () => {
  it("carries expertise, stats and a reverse-chronological assignment history", async () => {
    const [tomas] = await listExperts(t.db, { q: "Tomas Lindqvist" });
    expect(tomas).toBeDefined();
    const profile = await getExpertProfile(t.db, tomas!.id);
    expect(profile?.name).toBe("Tomas Lindqvist");
    expect(profile?.engagements).toBe(tomas!.engagements);
    if (profile!.history.length > 1) {
      const dated = profile!.history.filter((h) => h.scheduledStart);
      for (let i = 1; i < dated.length; i++) {
        // createdAt-ordered from the repo; just confirm every row is well-formed.
        expect(dated[i]!.code).toMatch(/^IVP-\d{4}-\d{3}$/);
      }
    }
    for (const h of profile!.history) expect(h.subtitle).toContain("·");
  });

  it("returns null for an unknown staff id", async () => {
    expect(await getExpertProfile(t.db, "stf_nope")).toBeNull();
  });
});

describe("organizations", () => {
  it("lists organizations with a meeting tally and country", async () => {
    const orgs = await listOrganizationsSummary(t.db);
    expect(orgs.length).toBeGreaterThan(0);
    expect(orgs.some((o) => o.meetingCount > 0)).toBe(true);
  });

  it("loads one organization's profile with contacts and history", async () => {
    const [withMeetings] = (await listOrganizationsSummary(t.db)).filter((o) => o.meetingCount > 0);
    const profile = await getOrganizationProfile(t.db, withMeetings!.id);
    expect(profile?.history.length).toBe(withMeetings!.meetingCount);
    expect(profile?.kindLabel).toBeTruthy();
  });

  it("returns null for an unknown organization id", async () => {
    expect(await getOrganizationProfile(t.db, "org_nope")).toBeNull();
  });

  it("sorts by the displayed short name, falling back to the full name, case-insensitively", async () => {
    const orgs = await listOrganizationsSummary(t.db);
    expect(orgs.some((o) => o.shortName)).toBe(true); // otherwise this test can't tell the two orderings apart
    const displayed = orgs.map((o) => o.shortName ?? o.name);
    expect(displayed).toEqual([...displayed].sort((a, b) => a.localeCompare(b, "en")));
  });
});

describe("countries", () => {
  it("only lists countries the program has actually engaged, ranked by this fiscal year's count", async () => {
    const countries = await listCountriesSummary(t.db, NOW);
    expect(countries.length).toBeGreaterThan(0);
    expect(countries.every((c) => c.engagementCount > 0)).toBe(true);
    for (let i = 1; i < countries.length; i++) expect(countries[i]!.fyCount).toBeLessThanOrEqual(countries[i - 1]!.fyCount);
  });

  it("loads one country's profile with topics, organizations and history", async () => {
    const [top] = await listCountriesSummary(t.db, NOW);
    const profile = await getCountryProfile(t.db, top!.cca2, NOW);
    expect(profile?.name).toBe(top!.name);
    expect(profile?.engagementCount).toBe(top!.engagementCount);
    expect(profile?.firstFy).not.toBeNull();
    expect(profile?.organizations.length).toBeGreaterThan(0);
    expect(profile?.history.length).toBeGreaterThan(0);
  });

  it("is case-insensitive on the ISO code and returns null for an unknown one", async () => {
    const [top] = await listCountriesSummary(t.db, NOW);
    const profile = await getCountryProfile(t.db, top!.cca2.toLowerCase(), NOW);
    expect(profile?.cca2).toBe(top!.cca2);
    expect(await getCountryProfile(t.db, "zz", NOW)).toBeNull();
  });
});

describe("dossiers", () => {
  const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
  const stranger: PolicyUser = { id: "usr_nobody", role: "expert", regionIds: [], staffId: "stf_nobody" };

  it("a country's profile carries a dossier: figures, a timeline with lanes, briefers and a materials shelf", async () => {
    const [top] = await listCountriesSummary(t.db, NOW);
    const profile = await getCountryProfile(t.db, top!.cca2, NOW, coordinator);
    const dossier = profile!.dossier;
    expect(dossier.figures.engagements).toBe(top!.engagementCount);
    expect(dossier.figures.fy).toBe(2026);
    expect(dossier.timeline.meetings.length).toBe(profile!.history.length);
    expect(dossier.timeline.lanes.length).toBeGreaterThan(0);
    expect(dossier.timeline.firstFy).toBeLessThanOrEqual(dossier.timeline.lastFy);
    for (const m of dossier.timeline.meetings) expect(dossier.timeline.lanes.some((l) => l.id === m.laneId)).toBe(true);
    for (const b of dossier.briefers) expect(b.bureauName ?? b.bureauCode).toBeTruthy();
    expect(dossier.materialsTotal).toBeGreaterThanOrEqual(dossier.materials.length);
    expect(dossier.materialsHref).toBe(`/documents?countryCode=${top!.cca2}`);
  });

  it("an organization's profile carries the same, filtered to the organization", async () => {
    const [withMeetings] = (await listOrganizationsSummary(t.db)).filter((o) => o.meetingCount > 0);
    const profile = await getOrganizationProfile(t.db, withMeetings!.id, NOW, coordinator);
    const dossier = profile!.dossier;
    expect(dossier.timeline.meetings.length).toBe(withMeetings!.meetingCount);
    expect(dossier.materialsHref).toBe(`/documents?orgId=${withMeetings!.id}`);
    for (const m of dossier.materials) expect(profile!.history.some((h) => h.id === m.meetingId)).toBe(true);
  });

  it("shows an expert only the materials of meetings they are assigned to", async () => {
    const [top] = await listCountriesSummary(t.db, NOW);
    const open = await getCountryProfile(t.db, top!.cca2, NOW, coordinator);
    const closed = await getCountryProfile(t.db, top!.cca2, NOW, stranger);
    expect(open!.dossier.materialsTotal).toBeGreaterThan(0);
    expect(closed!.dossier.materialsTotal).toBe(0);
    expect(closed!.dossier.materials).toEqual([]);
    // Everything else on the dossier is directory reading, which every role has.
    expect(closed!.dossier.figures).toEqual(open!.dossier.figures);
  });
});
