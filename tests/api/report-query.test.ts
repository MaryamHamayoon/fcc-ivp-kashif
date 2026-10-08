// @vitest-environment node
import { parseExportQuery, parseReportQuery, REPORT_LABELS, REPORTS, ReportQuery } from "@/lib/api/schemas";

const parse = (query: string) => parseReportQuery(new URLSearchParams(query));

describe("report query normalization", () => {
  it("lands on the program summary for the current year from a bare link", () => {
    const parsed = parse("fy=&report=&status=");
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ report: "summary", rows: "topic", measure: "meetings" });
    expect(parsed.data?.fy).toBeUndefined();
    expect(parsed.data?.status).toBeUndefined();
  });

  it("keeps every filter the bar writes, statuses repeated or comma-separated", () => {
    const parsed = parse("fy=2026&report=tally&regionId=af&countryCode=ke&topicId=spectrum-sharing&format=virtual&bureauCode=WTB&status=confirmed,completed&status=closed&leadUserId=usr_priya&rows=month&measure=countries");
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      fy: 2026,
      report: "tally",
      regionId: "af",
      countryCode: "KE",
      topicId: "spectrum-sharing",
      format: "virtual",
      bureauCode: "WTB",
      status: ["confirmed", "completed", "closed"],
      leadUserId: "usr_priya",
      rows: "month",
      measure: "countries",
    });
  });

  it("rejects a report, a row, a measure or a status it does not know, and a year outside the program", () => {
    expect(parse("report=nope").success).toBe(false);
    expect(parse("rows=colour").success).toBe(false);
    expect(parse("measure=money").success).toBe(false);
    expect(parse("status=confirmed,maybe").success).toBe(false);
    expect(parse("fy=1999").success).toBe(false);
    expect(parse("fy=2101").success).toBe(false);
    expect(parse("fy=2026").success).toBe(true);
  });

  it("names the seven reports", () => {
    expect(REPORTS).toEqual(["summary", "tally", "participants", "experts", "countries", "tracker", "custom"]);
    for (const id of REPORTS) expect(REPORT_LABELS[id].length).toBeGreaterThan(0);
    expect(ReportQuery.parse({}).report).toBe("summary");
  });
});

describe("export query normalization", () => {
  const parseExport = (query: string) => parseExportQuery(new URLSearchParams(query));

  it("writes the workbook unless asked for CSV, and knows the dossiers' history", () => {
    expect(parseExport("").data).toMatchObject({ as: "xlsx", report: "summary" });
    expect(parseExport("as=csv&report=history&countryCode=ke&orgId=ofcom").data).toMatchObject({ as: "csv", report: "history", countryCode: "KE", orgId: "ofcom" });
    expect(parseExport("as=pdf").success).toBe(false);
    expect(parseExport("report=nope").success).toBe(false);
  });
});
