// @vitest-environment node
import ExcelJS from "exceljs";
import { trackerColumns, trackerTable } from "@/lib/reports/tables";
import { buildTableWorkbook, buildWorkbook, sheetName } from "@/lib/reports/xlsx";
import { buildReports } from "@/lib/services/reports";
import { makeReportDataset, REPORT_NOW, reportMeetings } from "@/tests/fixtures/reports";

const meta = { fyLabel: "FY26", generatedAt: REPORT_NOW, filtersSentence: "All meetings" };
const ds = makeReportDataset();
const built = buildReports(ds, "topic", "meetings");

async function reload(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS types its input as its own Buffer; at runtime it wants a Node Buffer.
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  return workbook;
}
const rowValues = (sheet: ExcelJS.Worksheet, n: number) => (sheet.getRow(n).values as ExcelJS.CellValue[]).slice(1);
const columnOf = (sheet: ExcelJS.Worksheet, header: string) => rowValues(sheet, 1).indexOf(header) + 1;
const firstColumn = (sheet: ExcelJS.Worksheet) => {
  const labels: string[] = [];
  sheet.eachRow((row) => labels.push(String(row.getCell(1).value ?? "")));
  return labels;
};

let bytes: Uint8Array;
let workbook: ExcelJS.Workbook;
beforeAll(async () => {
  bytes = await buildWorkbook(built, ds, meta);
  workbook = await reload(bytes);
});

describe("buildWorkbook", () => {
  it("writes a real workbook: one sheet per report, each frozen under its header, the program as its author", () => {
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Summary", "Meetings", "Participants", "Topics", "Countries", "Experts", "Tally"]);
    expect(workbook.creator).toBe("FCC International Visitors Program");
    for (const sheet of workbook.worksheets) expect(sheet.views[0]?.state, sheet.name).toBe("frozen");
  });

  it("lays the tracker out under its own headers, with a filter row, real dates and formatted counts", () => {
    const sheet = workbook.getWorksheet("Meetings")!;
    expect(rowValues(sheet, 1)).toEqual(trackerColumns().map((c) => c.header));
    expect(sheet.rowCount).toBe(reportMeetings.length + 1);
    expect(sheet.autoFilter).toBeTruthy();
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);

    const date = sheet.getRow(2).getCell(columnOf(sheet, "Date"));
    expect(date.value).toBeInstanceOf(Date);
    expect((date.value as Date).toISOString()).toMatch(/^2026-09-15/);
    expect(date.numFmt).toBe("yyyy-mm-dd");

    const people = sheet.getRow(2).getCell(columnOf(sheet, "Participants"));
    expect(people.value).toBe(12);
    expect(people.numFmt).toBe("#,##0");

    // A year is a number Excel must not group: 2026, never 2,026.
    const fiscalYear = sheet.getRow(2).getCell(columnOf(sheet, "Fiscal year"));
    expect(fiscalYear.value).toBe(2026);
    expect(fiscalYear.numFmt).toBe("0");
    expect(sheet.getColumn(columnOf(sheet, "Meeting")).width).toBeGreaterThan(10);
  });

  it("shows a rate as a percentage and a median as a decimal", () => {
    const sheet = workbook.getWorksheet("Experts")!;
    expect(sheet.getRow(2).getCell(columnOf(sheet, "Confirmed rate")).numFmt).toBe("0%");
    const medians = [2, 3].map((r) => sheet.getRow(r).getCell(columnOf(sheet, "Median response (business days)")));
    expect(medians.some((c) => c.numFmt === "0.0")).toBe(true);
  });

  it("sets the tally's total in bold and the topics and regions beside the months", () => {
    const tally = workbook.getWorksheet("Tally")!;
    expect(rowValues(tally, 1)[0]).toBe("Month");
    expect(tally.getRow(14).getCell(1).value).toBe("Total");
    expect(tally.getRow(14).getCell(1).font?.bold).toBe(true);
    expect(firstColumn(tally)).toContain("By region");
    expect(rowValues(workbook.getWorksheet("Topics")!, 1)[0]).toBe("Topic");
  });

  it("opens the Summary sheet with the year, when it was made and what it covers, then the headline and every tile", () => {
    const sheet = workbook.getWorksheet("Summary")!;
    expect(sheet.getCell("A1").value).toBe("Program summary — FY26");
    expect(String(sheet.getCell("A2").value)).toContain("2026-08-29");
    expect(String(sheet.getCell("A2").value)).toContain("All meetings");
    expect(sheet.getCell("A3").value).toBe(built.summary.headline);
    const labels = firstColumn(sheet);
    for (const caption of ["Figures", "Figure", "Participants by category", "Formats", "Topics", "Regions", "Bureaus", "Countries", "Monthly cadence"]) expect(labels).toContain(caption);
  });
});

describe("buildTableWorkbook", () => {
  it("writes a dossier's history as one sheet under the tracker's headers", async () => {
    const history = await reload(await buildTableWorkbook([{ ...trackerTable(reportMeetings), name: "Meetings" }], REPORT_NOW));
    expect(history.worksheets.map((s) => s.name)).toEqual(["Meetings"]);
    const sheet = history.getWorksheet("Meetings")!;
    expect(rowValues(sheet, 1)).toEqual(trackerColumns().map((c) => c.header));
    expect(sheet.rowCount).toBe(reportMeetings.length + 1);
    expect(sheet.views[0]?.state).toBe("frozen");
  });
});

describe("sheetName", () => {
  it("keeps names inside Excel's limits", () => {
    expect(sheetName("Countries / regions: all [FY26]?*")).toBe("Countries regions all FY26");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
  });
});
