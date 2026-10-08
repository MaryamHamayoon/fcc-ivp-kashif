/**
 * RFC 4180 CSV, written for spreadsheets rather than for parsers.
 *
 * Two deliberate choices:
 *  - CRLF line endings and a trailing newline, because that is what Excel expects.
 *  - Text that starts with `=`, `+`, `-` or `@` is prefixed with an apostrophe so a
 *    delegation name copied out of an email cannot become a formula when the file is
 *    opened (CSV injection). The guard applies to text only: numbers and dates are
 *    rendered by us and stay numeric, so a negative count still reads as a number.
 *
 * Callers add the UTF-8 BOM when the file is handed to a browser download — accented
 * country names need it for Excel on Windows.
 */

export type CsvValue = string | number | boolean | Date | null | undefined;

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => CsvValue;
};

const NEEDS_QUOTES = /[",\r\n]/;
const FORMULA_LEAD = /^[=+\-@]/;

function render(value: CsvValue): string {
  if (value == null) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "string") return FORMULA_LEAD.test(value) ? `'${value}` : value;
  return String(value);
}

/** One CSV cell: escaped, and quoted when it holds a delimiter, a quote, a newline or edge whitespace. */
export function csvCell(value: CsvValue): string {
  const text = render(value);
  if (text === "") return "";
  const needsQuotes = NEEDS_QUOTES.test(text) || text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows plus a header row, in the column order given. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
