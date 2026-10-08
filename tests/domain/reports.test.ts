import {
  applyReportFilters,
  countriesReport,
  CUSTOM_MEASURES,
  CUSTOM_ROWS,
  customReport,
  expertsReport,
  fiscalYearTally,
  isCounted,
  participantsReport,
  participantTotals,
  programSummary,
} from "@/lib/domain/reports";
import { makeExpertRow as row, makeReportDataset as dataset, participantRows as participants, priorParticipantRows as priorParticipants, priorReportMeetings as priorMeetings, reportMeetings as meetings } from "@/tests/fixtures/reports";

const counts = (rows: { label: string; count: number }[]) => rows.map((r) => [r.label, r.count]);

describe("counting rules", () => {
  it("counts confirmed, completed and closed meetings, and nothing earlier in the lifecycle", () => {
    expect(meetings.filter(isCounted).map((m) => m.id)).toEqual(["m1", "m2", "m3", "m5", "m6"]);
  });

  it("totals participants as actual where known, else planned", () => {
    expect(participantTotals(participants, new Set(["m2", "m6"]))).toEqual({ planned: 17, actual: 16 });
    expect(participantTotals(participants, new Set(["none"]))).toEqual({ planned: 0, actual: 0 });
  });
});

describe("applyReportFilters", () => {
  it("narrows by each key of the meetings vocabulary, secondary countries and bureaus included", () => {
    const ids = (f: Parameters<typeof applyReportFilters>[1]) => applyReportFilters(meetings, f).map((m) => m.id);
    expect(ids({})).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(ids({ regionId: "af" })).toEqual(["m1", "m2"]);
    expect(ids({ countryCode: "UG" })).toEqual(["m2"]);
    expect(ids({ topicId: "spectrum-sharing" })).toEqual(["m1", "m3", "m6"]);
    expect(ids({ format: "virtual" })).toEqual(["m2", "m5"]);
    expect(ids({ bureauCode: "WTB" })).toEqual(["m2", "m3", "m4"]);
    expect(ids({ status: ["completed"] })).toEqual(["m2", "m6"]);
    expect(ids({ status: [] })).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(ids({ leadUserId: "usr_marcus" })).toEqual(["m3", "m5"]);
    expect(ids({ regionId: "af", format: "virtual" })).toEqual(["m2"]);
  });
});

describe("programSummary", () => {
  it("states the year in one sentence and four figures, each against the prior year", () => {
    const summary = programSummary(dataset());
    expect(summary.headline).toBe("5 engagements across 6 countries this fiscal year, reaching 54 foreign officials.");
    expect(summary.figures.map((f) => [f.id, f.value, f.prior])).toEqual([
      ["engagements", 5, 1],
      ["countries", 6, 1],
      ["participants", 54, 11],
      ["completed", 3, 0],
    ]);
    expect(summary.figures.every((f) => f.label && f.note)).toBe(true);
  });

  it("splits participants by category with planned beside what actually came", () => {
    const summary = programSummary(dataset());
    expect(summary.participantsByCategory.map((c) => [c.category, c.planned, c.actual])).toEqual([
      ["fcc", 4, 4],
      ["other_usg", 0, 0],
      ["foreign_gov", 30, 29],
      ["industry", 1, 1],
      ["academia_ngo", 0, 0],
      ["other", 0, 0],
    ]);
  });

  it("tiles formats in their fixed order, then topics, regions, bureaus and countries by weight", () => {
    const summary = programSummary(dataset());
    expect(counts(summary.formats)).toEqual([
      ["In person", 2],
      ["Virtual", 2],
      ["Hybrid", 1],
    ]);
    expect(counts(summary.topics)).toEqual([
      ["Spectrum Sharing", 3],
      ["Broadband Mapping", 2],
      ["Spectrum Auctions", 1],
    ]);
    expect(counts(summary.regions)).toEqual([
      ["Africa", 2],
      ["Europe", 1],
      ["South & Central Asia", 1],
      ["Western Hemisphere", 1],
    ]);
    expect(counts(summary.bureaus)).toEqual([
      ["Office of Economics and Analytics", 3],
      ["Wireless Telecommunications Bureau", 2],
    ]);
    expect(counts(summary.countries).slice(0, 2)).toEqual([
      ["Bangladesh", 1],
      ["Brazil", 1],
    ]);
    expect(summary.countries).toHaveLength(6);
  });

  it("charts the monthly cadence against the prior year, October first, undated meetings left out", () => {
    const cadence = programSummary(dataset()).cadence;
    expect(cadence.map((c) => c.month)).toEqual(["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
    expect(cadence.filter((c) => c.current || c.prior)).toEqual([
      { month: "Nov", current: 1, prior: 0 },
      { month: "Mar", current: 2, prior: 1 },
      { month: "Sep", current: 1, prior: 0 },
    ]);
  });

  it("reads the tense from the fiscal year, and admits when there is no prior year", () => {
    const past = programSummary(dataset({ fy: 2025, meetings: priorMeetings, participants: priorParticipants, priorMeetings: [], priorParticipants: [] }));
    expect(past.headline).toBe("1 engagement across 1 country in FY25, reaching 11 foreign officials.");
    expect(past.figures.map((f) => f.prior)).toEqual([null, null, null, null]);
    expect(programSummary(dataset({ fy: 2027, meetings: [], participants: [] })).headline).toBe("Nothing counted yet for FY27.");
  });
});

describe("fiscalYearTally", () => {
  it("lays the year out by fiscal month with the prior year beside it", () => {
    const tally = fiscalYearTally(dataset());
    expect(tally.months).toHaveLength(12);
    expect(tally.months[0]!.label).toBe("Oct");
    expect(tally.months[1]).toEqual({ label: "Nov", meetings: 1, countries: 1, participants: 20, inPerson: 0, virtual: 0, hybrid: 1, priorMeetings: 0 });
    expect(tally.months[5]).toEqual({ label: "Mar", meetings: 2, countries: 3, participants: 16, inPerson: 1, virtual: 1, hybrid: 0, priorMeetings: 1 });
    expect(tally.months[11]).toEqual({ label: "Sep", meetings: 1, countries: 1, participants: 12, inPerson: 1, virtual: 0, hybrid: 0, priorMeetings: 0 });
    expect(tally.total).toEqual({ label: "Total", meetings: 5, countries: 6, participants: 54, inPerson: 2, virtual: 2, hybrid: 1, priorMeetings: 1 });
  });

  it("then by region and by topic, heaviest first", () => {
    const tally = fiscalYearTally(dataset());
    expect(tally.byRegion.map((r) => [r.label, r.meetings, r.countries, r.participants, r.priorMeetings])).toEqual([
      ["Africa", 2, 3, 21, 1],
      ["Europe", 1, 1, 20, 0],
      ["South & Central Asia", 1, 1, 7, 0],
      ["Western Hemisphere", 1, 1, 6, 0],
    ]);
    expect(tally.byTopic.map((r) => [r.label, r.meetings, r.priorMeetings])).toEqual([
      ["Spectrum Sharing", 3, 1],
      ["Broadband Mapping", 2, 0],
      ["Spectrum Auctions", 1, 0],
    ]);
  });
});

describe("participantsReport", () => {
  it("lists counted meetings by date with the six categories, and totals them", () => {
    const report = participantsReport(dataset());
    expect(report.rows.map((r) => [r.code, r.planned, r.actual])).toEqual([
      ["IVP-2026-004", 20, null],
      ["IVP-2026-018", 8, 9],
      ["IVP-2026-023", 9, 7],
      ["IVP-2026-041", 12, null],
      ["IVP-2026-057", 6, null],
    ]);
    const kenya = report.rows[1]!;
    expect(kenya.countryName).toBe("Kenya");
    expect(kenya.orgName).toBe("Communications Authority of Kenya");
    expect(kenya.byCategory.foreign_gov).toEqual({ planned: 6, actual: 7 });
    expect(kenya.byCategory.industry).toEqual({ planned: 0, actual: null });
    expect(report.totals.map((t) => [t.category, t.planned, t.actual])).toEqual([
      ["fcc", 4, 4],
      ["other_usg", 0, 0],
      ["foreign_gov", 30, 29],
      ["industry", 1, 1],
      ["academia_ngo", 0, 0],
      ["other", 0, 0],
    ]);
    expect(report.plannedTotal).toBe(55);
    expect(report.actualTotal).toBe(54);
  });
});

describe("expertsReport", () => {
  it("scores each bureau on requests, confirmations and how fast it answers, in business days", () => {
    const { bureaus } = expertsReport(dataset());
    expect(bureaus.map((b) => [b.bureauCode, b.meetings, b.experts, b.requested, b.confirmed, b.declined])).toEqual([
      ["OEA", 3, 1, 3, 2, 0],
      ["WTB", 2, 1, 2, 1, 1],
    ]);
    expect(bureaus[0]!.bureauName).toBe("Office of Economics and Analytics");
    expect(bureaus[0]!.confirmedRate).toBeCloseTo(2 / 3);
    expect(bureaus[0]!.medianResponseDays).toBe(3.5);
    expect(bureaus[1]!.confirmedRate).toBe(0.5);
    expect(bureaus[1]!.medianResponseDays).toBe(2.5);
  });

  it("ranks briefers by the meetings they were engaged on", () => {
    const { briefers } = expertsReport(dataset());
    expect(briefers.map((b) => [b.name, b.bureauCode, b.engagements, b.confirmed])).toEqual([
      ["Dana Whitfield", "OEA", 3, 2],
      ["Tomas Lindqvist", "WTB", 2, 1],
    ]);
  });

  it("leaves the rate and the median empty for a bureau nobody has asked yet", () => {
    const { bureaus } = expertsReport(dataset({ experts: [row("m1", "stf_ana", "Ana Ruiz", "IB", "International Bureau", "tbd", null, null)] }));
    expect(bureaus).toEqual([{ bureauCode: "IB", bureauName: "International Bureau", meetings: 1, experts: 1, requested: 0, confirmed: 0, declined: 0, confirmedRate: null, medianResponseDays: null }]);
  });
});

describe("countriesReport", () => {
  it("gives every country its region, engagements, people, first and last dates and top topics", () => {
    const rows = countriesReport(dataset());
    expect(rows.map((r) => [r.countryCode, r.countryName, r.regionName, r.engagements, r.participants])).toEqual([
      ["BD", "Bangladesh", "South & Central Asia", 1, 7],
      ["BR", "Brazil", "Western Hemisphere", 1, 6],
      ["CI", "Côte d'Ivoire", "Africa", 1, 12],
      ["KE", "Kenya", "Africa", 1, 9],
      ["UG", "UG", "Africa", 1, 9],
      ["GB", "United Kingdom", "Europe", 1, 20],
    ]);
    const ci = rows.find((r) => r.countryCode === "CI")!;
    expect(ci.firstAt).toEqual(new Date("2026-09-15T14:00:00Z"));
    expect(ci.lastAt).toEqual(new Date("2026-09-15T14:00:00Z"));
    expect(ci.topics).toEqual(["Spectrum Auctions", "Spectrum Sharing"]);
    const br = rows.find((r) => r.countryCode === "BR")!;
    expect(br.firstAt).toBeNull();
    expect(br.lastAt).toBeNull();
  });
});

describe("customReport", () => {
  it("offers eight row choices and four measures", () => {
    expect(CUSTOM_ROWS).toEqual(["country", "region", "topic", "format", "bureau", "month", "status", "lead"]);
    expect(CUSTOM_MEASURES).toEqual(["meetings", "participantsPlanned", "participantsActual", "countries"]);
  });

  it("counts meetings per topic, heaviest first", () => {
    expect(counts(customReport(dataset(), "topic", "meetings"))).toEqual([
      ["Spectrum Sharing", 3],
      ["Broadband Mapping", 2],
      ["Spectrum Auctions", 1],
    ]);
  });

  it("keeps the fiscal months in order, zeros included", () => {
    const months = customReport(dataset(), "month", "meetings");
    expect(months.map((m) => m.label)).toEqual(["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
    expect(months.map((m) => m.count)).toEqual([0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1]);
  });

  it("names the lead, or says Unassigned", () => {
    expect(counts(customReport(dataset(), "lead", "meetings"))).toEqual([
      ["Marcus Bell", 2],
      ["Priya Raman", 2],
      ["Unassigned", 1],
    ]);
  });

  it("measures participants and distinct countries, not just meetings", () => {
    expect(counts(customReport(dataset(), "format", "participantsActual"))).toEqual([
      ["Hybrid", 20],
      ["In person", 19],
      ["Virtual", 15],
    ]);
    expect(counts(customReport(dataset(), "format", "participantsPlanned"))).toEqual([
      ["In person", 21],
      ["Hybrid", 20],
      ["Virtual", 14],
    ]);
    expect(counts(customReport(dataset(), "region", "countries"))).toEqual([
      ["Africa", 3],
      ["Europe", 1],
      ["South & Central Asia", 1],
      ["Western Hemisphere", 1],
    ]);
    expect(counts(customReport(dataset(), "bureau", "meetings"))).toEqual([
      ["Office of Economics and Analytics", 3],
      ["Wireless Telecommunications Bureau", 2],
    ]);
    expect(counts(customReport(dataset(), "status", "meetings"))).toEqual([
      ["Completed", 2],
      ["Confirmed", 2],
      ["Closed", 1],
    ]);
  });
});
