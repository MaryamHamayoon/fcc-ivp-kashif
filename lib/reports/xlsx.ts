import ExcelJS from "exceljs";
import { fyLabel } from "@/lib/domain/glance";
import type { ReportDataset } from "@/lib/domain/reports";
import type { NamedCount } from "@/lib/domain/tallies";
import type { BuiltReports } from "@/lib/services/reports";
import { type CellFormat, isoDate, type ReportCell, type ReportTable, tableFor, tallyTable } from "./tables";

/**
 * The Excel workbook: every report on its own sheet, the way the old tracker was kept, but
 * written from the same tables the screen shows. Header rows are bold on a pale fill, frozen
 * and filterable; counts, rates and dates carry real number formats, so Excel sorts and sums
 * them without a second thought.
 */

export type WorkbookMeta = { fyLabel: string; generatedAt: Date; filtersSentence: string };

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9EFEA" } };
const HEADER_BORDER: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: "FF9AA79F" } } };
const MUTED: Partial<ExcelJS.Font> = { color: { argb: "FF5C6660" } };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORMAT = { integer: "#,##0", year: "0", rate: "0%", decimal: "0.0", day: "yyyy-mm-dd" } as const;

/** Excel allows 31 characters and none of \ / ? * [ ] : in a sheet name. */
export function sheetName(name: string): string {
  return name
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
}

const width = (chars: number) => Math.min(48, Math.max(10, chars + 2));

function toDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function write(cell: ExcelJS.Cell, value: ReportCell, format?: CellFormat) {
  if (value === null) return;
  if (typeof value === "number") {
    cell.value = value;
    cell.numFmt = format === "percent" ? FORMAT.rate : format === "year" ? FORMAT.year : format === "decimal" || !Number.isInteger(value) ? FORMAT.decimal : FORMAT.integer;
  } else if (ISO_DATE.test(value)) {
    cell.value = toDate(value);
    cell.numFmt = FORMAT.day;
  } else {
    cell.value = value;
  }
}

function styleHeader(row: ExcelJS.Row, count: number) {
  for (let i = 1; i <= count; i += 1) {
    const cell = row.getCell(i);
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = HEADER_BORDER;
  }
}

/** One table from `startRow` down: its header, then its rows, a trailing "Total" row in bold. Returns the next free row. */
function writeTable(sheet: ExcelJS.Worksheet, table: ReportTable, startRow: number): number {
  const header = sheet.getRow(startRow);
  table.columns.forEach((name, i) => {
    header.getCell(i + 1).value = name;
  });
  styleHeader(header, table.columns.length);
  table.rows.forEach((values, r) => {
    const row = sheet.getRow(startRow + 1 + r);
    values.forEach((value, i) => write(row.getCell(i + 1), value, table.formats?.[i]));
    if (values[0] === "Total") row.font = { bold: true };
  });
  return startRow + 1 + table.rows.length;
}

function caption(sheet: ExcelJS.Worksheet, row: number, text: string) {
  const cell = sheet.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true };
}

/** Column widths from the longest text in each column, across every table on the sheet. */
function fitColumns(sheet: ExcelJS.Worksheet, tables: ReportTable[]) {
  const longest: number[] = [];
  for (const table of tables) {
    table.columns.forEach((name, i) => {
      longest[i] = Math.max(longest[i] ?? 0, name.length);
    });
    for (const row of table.rows) {
      row.forEach((value, i) => {
        longest[i] = Math.max(longest[i] ?? 0, value === null ? 0 : String(value).length);
      });
    }
  }
  longest.forEach((chars, i) => {
    sheet.getColumn(i + 1).width = width(chars);
  });
}

function addSheet(workbook: ExcelJS.Workbook, name: string, table: ReportTable): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(sheetName(name), { views: [{ state: "frozen", ySplit: 1 }] });
  writeTable(sheet, table, 1);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
  fitColumns(sheet, [table]);
  return sheet;
}

const counts = (name: string, label: string, rows: NamedCount[]): ReportTable => ({ name, columns: [label, "Meetings"], rows: rows.map((r) => [r.label, r.count]) });

function summaryTables(built: BuiltReports, ds: ReportDataset, meta: WorkbookMeta): ReportTable[] {
  const { summary } = built;
  return [
    { ...tableFor("summary", built, ds), name: "Figures" },
    { name: "Participants by category", columns: ["Category", "Planned", "Actual"], rows: summary.participantsByCategory.map((c) => [c.label, c.planned, c.actual]) },
    counts("Formats", "Format", summary.formats),
    counts("Topics", "Topic", summary.topics),
    counts("Regions", "Region", summary.regions),
    counts("Bureaus", "Bureau", summary.bureaus),
    counts("Countries", "Country", summary.countries),
    { name: "Monthly cadence", columns: ["Month", meta.fyLabel, fyLabel(ds.fy - 1)], rows: summary.cadence.map((m) => [m.month, m.current, m.prior]) },
  ];
}

/** The summary as a reader opens it: what, when and for whom, the headline, then each tile as a small table. */
function addSummarySheet(workbook: ExcelJS.Workbook, built: BuiltReports, ds: ReportDataset, meta: WorkbookMeta) {
  const sheet = workbook.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  const title = sheet.getCell("A1");
  title.value = `Program summary — ${meta.fyLabel}`;
  title.font = { bold: true, size: 14 };
  const line = sheet.getCell("A2");
  line.value = `Generated ${isoDate(meta.generatedAt)} · ${meta.filtersSentence}`;
  line.font = MUTED;
  sheet.getCell("A3").value = built.summary.headline;

  const tables = summaryTables(built, ds, meta);
  let row = 5;
  for (const table of tables) {
    caption(sheet, row, table.name);
    row = writeTable(sheet, table, row + 1) + 1;
  }
  fitColumns(sheet, tables);
}

function addTallySheet(workbook: ExcelJS.Workbook, built: BuiltReports, ds: ReportDataset) {
  const months = tableFor("tally", built, ds);
  const regions = tallyTable("By region", "Region", built.tally.byRegion, null, ds.fy);
  const sheet = addSheet(workbook, "Tally", months);
  const start = months.rows.length + 3;
  caption(sheet, start, regions.name);
  writeTable(sheet, regions, start + 1);
  fitColumns(sheet, [months, regions]);
}

function newWorkbook(generatedAt: Date): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FCC International Visitors Program";
  workbook.lastModifiedBy = "FCC International Visitors Program";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  return workbook;
}

async function toBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** Every report in one workbook, in the order leadership reads them. */
export async function buildWorkbook(built: BuiltReports, ds: ReportDataset, meta: WorkbookMeta): Promise<Uint8Array> {
  const workbook = newWorkbook(meta.generatedAt);
  addSummarySheet(workbook, built, ds, meta);
  addSheet(workbook, "Meetings", tableFor("tracker", built, ds));
  addSheet(workbook, "Participants", tableFor("participants", built, ds));
  addSheet(workbook, "Topics", tallyTable("Topics", "Topic", built.tally.byTopic, null, ds.fy));
  addSheet(workbook, "Countries", tableFor("countries", built, ds));
  addSheet(workbook, "Experts", tableFor("experts", built, ds));
  addTallySheet(workbook, built, ds);
  return toBytes(workbook);
}

/** Plain tables, one sheet each — a dossier's history, or anything else that is just a table. */
export async function buildTableWorkbook(tables: ReportTable[], generatedAt: Date): Promise<Uint8Array> {
  const workbook = newWorkbook(generatedAt);
  for (const table of tables) addSheet(workbook, table.name, table);
  return toBytes(workbook);
}
