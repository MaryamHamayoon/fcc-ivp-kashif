// @vitest-environment node
import { eq, isNotNull } from "drizzle-orm";
import { seedAll } from "@/db/seed";
import { ReportQuery } from "@/lib/api/schemas";
import * as s from "@/lib/db/schema";
import { createTestDb, type TestDb } from "@/lib/db/test-db";
import type { PolicyUser } from "@/lib/domain/policy";
import { tableFor } from "@/lib/reports/tables";
import { PolicyError } from "@/lib/services/errors";
import { buildReports, describeFilters, loadBrief, loadHistory, loadReportDataset, reportOptions } from "@/lib/services/reports";

const NOW = new Date("2026-08-29T14:00:00Z");
const coordinator: PolicyUser = { id: "usr_priya", role: "coordinator", regionIds: [], staffId: "stf_priya" };
const executive: PolicyUser = { id: "usr_exec", role: "executive", regionIds: [], staffId: null };
const expert: PolicyUser = { id: "usr_tomas", role: "expert", regionIds: [], staffId: "stf_tomas" };
const viewer: PolicyUser = { id: "usr_viewer", role: "viewer", regionIds: [], staffId: null };
const q = (over: Record<string, unknown> = {}) => ReportQuery.parse(over);

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedAll(t.db, { seed: 7, now: NOW });
}, 60_000);
afterAll(() => t.close());

describe("loadReportDataset", () => {
  it("admits the roles the policy lets read reports, and refuses the rest", async () => {
    await expect(loadReportDataset(t.db, q(), expert, NOW)).rejects.toBeInstanceOf(PolicyError);
    await expect(loadReportDataset(t.db, q(), viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
    await expect(loadReportDataset(t.db, q(), executive, NOW)).resolves.toBeTruthy();
  });

  it("reads the current fiscal year unless told otherwise, with the year before beside it", async () => {
    const ds = await loadReportDataset(t.db, q(), coordinator, NOW);
    expect(ds.fy).toBe(2026);
    expect(ds.now).toEqual(NOW);
    expect(ds.filters).toEqual({});
    expect(ds.meetings.length).toBeGreaterThan(0);
    expect(ds.priorMeetings.length).toBeGreaterThan(0);
    for (const m of ds.meetings) expect(m.fiscalYear).toBe(2026);
    for (const m of ds.priorMeetings) expect(m.fiscalYear).toBe(2025);

    const ids = new Set(ds.meetings.map((m) => m.id));
    const priorIds = new Set(ds.priorMeetings.map((m) => m.id));
    expect(ds.participants.length).toBeGreaterThan(0);
    for (const row of ds.participants) expect(ids.has(row.meetingId)).toBe(true);
    for (const row of ds.priorParticipants) expect(priorIds.has(row.meetingId)).toBe(true);
    expect(ds.experts.length).toBeGreaterThan(0);
    for (const row of ds.experts) expect(ids.has(row.meetingId)).toBe(true);
  });

  it("reads another year on request", async () => {
    const ds = await loadReportDataset(t.db, q({ fy: 2025 }), coordinator, NOW);
    expect(ds.fy).toBe(2025);
    for (const m of ds.meetings) expect(m.fiscalYear).toBe(2025);
    for (const m of ds.priorMeetings) expect(m.fiscalYear).toBe(2024);
  });

  it("carries the filters through to both years", async () => {
    const byRegion = await loadReportDataset(t.db, q({ regionId: "af" }), coordinator, NOW);
    expect(byRegion.filters).toEqual({ regionId: "af" });
    expect(byRegion.meetings.length).toBeGreaterThan(0);
    for (const m of [...byRegion.meetings, ...byRegion.priorMeetings]) expect(m.regionId).toBe("af");

    const byStatus = await loadReportDataset(t.db, q({ status: ["completed"] }), coordinator, NOW);
    expect(byStatus.filters).toEqual({ status: ["completed"] });
    for (const m of [...byStatus.meetings, ...byStatus.priorMeetings]) expect(m.status).toBe("completed");
  });
});

describe("buildReports and tableFor", () => {
  it("builds all seven reports from one dataset and lays each out as a table", async () => {
    const ds = await loadReportDataset(t.db, q(), coordinator, NOW);
    const built = buildReports(ds, "topic", "meetings");

    expect(built.summary.figures).toHaveLength(4);
    expect(built.summary.figures[0]!.value).toBeGreaterThan(0);
    expect(built.tracker).toBe(ds.meetings);
    expect(built.customChoice).toEqual({ rows: "topic", measure: "meetings" });

    const tally = tableFor("tally", built, ds);
    expect(tally.rows).toHaveLength(13);
    expect(tally.columns).toEqual(["Month", "Meetings", "Countries", "Participants", "In person", "Virtual", "Hybrid", "FY25 meetings"]);
    expect(tally.rows[0]![0]).toBe("Oct");
    expect(tally.rows[12]![0]).toBe("Total");

    const tracker = tableFor("tracker", built, ds);
    expect(tracker.columns.slice(0, 2)).toEqual(["IVP code", "Meeting"]);
    expect(tracker.rows).toHaveLength(ds.meetings.length);
    expect(tracker.rows[0]![4]).toMatch(/^\d{4}-\d{2}-\d{2}$|^$/);

    const participants = tableFor("participants", built, ds);
    expect(participants.rows.at(-1)![0]).toBe("Total");
    expect(participants.columns).toHaveLength(5 + 12 + 2);

    const custom = tableFor("custom", built, ds);
    expect(custom.name).toBe("Topic × Meetings");
    expect(custom.columns).toEqual(["Topic", "Meetings"]);
    expect(custom.rows.length).toBeGreaterThan(0);

    expect(tableFor("summary", built, ds).rows).toHaveLength(4);
    expect(tableFor("experts", built, ds).rows.length).toBeGreaterThan(0);
    expect(tableFor("countries", built, ds).rows.length).toBeGreaterThan(0);
  });

  it("honours the custom report's own choices", async () => {
    const ds = await loadReportDataset(t.db, q(), coordinator, NOW);
    const table = tableFor("custom", buildReports(ds, "month", "countries"), ds);
    expect(table.name).toBe("Fiscal month × Countries");
    expect(table.rows.map((r) => r[0])).toEqual(["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
  });
});

describe("reportOptions", () => {
  it("offers the meetings list's vocabulary and the three most recent fiscal years", async () => {
    const options = await reportOptions(t.db, coordinator, NOW);
    expect(options.fiscalYears).toEqual([2026, 2025, 2024]);
    expect(options.currentFiscalYear).toBe(2026);
    expect(options.regions.length).toBeGreaterThan(0);
    expect(options.countries[0]!.hint).toBeTruthy();
    expect(options.topics.length).toBeGreaterThan(0);
    expect(options.bureaus.every((b) => b.hint === b.value)).toBe(true);
    expect(options.leads.length).toBeGreaterThan(0);
  });

  it("refuses a reader the policy keeps out", async () => {
    await expect(reportOptions(t.db, viewer, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});

describe("loadHistory", () => {
  it("returns every year of a country's engagements, newest first, and refuses whoever cannot read reports", async () => {
    const tally = new Map<string, number>();
    for (const { code } of await t.db.select({ code: s.meetings.primaryCountryCode }).from(s.meetings)) tally.set(code, (tally.get(code) ?? 0) + 1);
    const [code, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]!;

    const history = await loadHistory(t.db, { countryCode: code }, coordinator, NOW);
    expect(history.length).toBeGreaterThanOrEqual(count);
    for (const m of history) expect(m.countryCodes).toContain(code);
    const dated = history.filter((m) => m.scheduledStart).map((m) => m.scheduledStart!.getTime());
    expect(dated).toEqual([...dated].sort((a, b) => b - a));
    const firstUndated = history.findIndex((m) => !m.scheduledStart);
    if (firstUndated >= 0) expect(history.slice(firstUndated).every((m) => !m.scheduledStart)).toBe(true);

    await expect(loadHistory(t.db, { countryCode: code }, expert, NOW)).rejects.toBeInstanceOf(PolicyError);
  });

  it("returns an organization's every meeting, and nothing when asked about nobody", async () => {
    const [first] = await t.db.select({ orgId: s.meetings.organizationId }).from(s.meetings).where(isNotNull(s.meetings.organizationId)).limit(1);
    const orgId = first!.orgId!;
    const expected = (await t.db.select({ id: s.meetings.id }).from(s.meetings).where(eq(s.meetings.organizationId, orgId))).length;
    const history = await loadHistory(t.db, { orgId }, coordinator, NOW);
    expect(history).toHaveLength(expected);
    for (const m of history) expect(m.orgId).toBe(orgId);
    expect(await loadHistory(t.db, {}, coordinator, NOW)).toEqual([]);
  });
});

describe("describeFilters", () => {
  it("says what a report covers in one line, naming things as the filter bar does", async () => {
    const options = await reportOptions(t.db, coordinator, NOW);
    expect(describeFilters({}, options)).toBe("All meetings");
    const region = options.regions[0]!;
    const lead = options.leads[0]!;
    expect(describeFilters({ regionId: region.value, format: "virtual", status: ["completed", "closed"], leadUserId: lead.value }, options)).toBe(`Region: ${region.label} · Format: Virtual · Status: Completed, Closed · Lead: ${lead.label}`);
    expect(describeFilters({ countryCode: "ZZ" }, options)).toBe("Country: ZZ");
  });
});

describe("loadBrief", () => {
  it("briefs the whole year in one object: labels, four figures, what is next inside thirty days", async () => {
    const brief = await loadBrief(t.db, 2026, coordinator, NOW);
    expect(brief.fy).toBe(2026);
    expect(brief.fyLabel).toBe("FY26");
    expect(brief.priorLabel).toBe("FY25");
    expect(brief.generatedAt).toEqual(NOW);
    expect(brief.headline).not.toBe("");
    expect(brief.meetingCount).toBeGreaterThan(0);
    expect(brief.figures.map((f) => f.id)).toEqual(["engagements", "countries", "participants", "completed"]);
    expect(brief.next.length).toBeLessThanOrEqual(5);
    for (const m of brief.next) {
      expect(m.date.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
      expect(m.date.getTime()).toBeLessThanOrEqual(NOW.getTime() + 30 * 86_400_000);
    }
    expect(brief.stuck.length).toBeLessThanOrEqual(5);
    expect(brief.where.countries.length).toBeGreaterThan(0);
    expect(brief.where.countries.length).toBeLessThanOrEqual(6);
    expect(brief.formats.every((f) => f.count > 0)).toBe(true);
  });

  it("refuses whoever cannot read reports", async () => {
    await expect(loadBrief(t.db, 2026, expert, NOW)).rejects.toBeInstanceOf(PolicyError);
  });
});
