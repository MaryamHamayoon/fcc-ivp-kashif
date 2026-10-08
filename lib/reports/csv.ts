import { type CsvColumn, toCsv } from "@/lib/csv";
import type { ReportCell, ReportTable } from "./tables";

/** Excel opens a UTF-8 file correctly only when it announces itself; the route puts this first. */
export const CSV_BOM = "\uFEFF";

/** One report table as CSV text, without the byte-order mark. */
export function tableToCsv(table: ReportTable): string {
  const columns: CsvColumn<ReportCell[]>[] = table.columns.map((header, index) => ({ header, value: (row) => row[index] ?? null }));
  return toCsv(table.rows, columns);
}
