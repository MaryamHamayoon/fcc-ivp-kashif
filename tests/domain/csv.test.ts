// @vitest-environment node
import { toCsv, type CsvColumn } from "@/lib/csv";

type Row = { name: string; note: string; count: number; when: Date | null };

const row = (over: Partial<Row> = {}): Row => ({ name: "ARTCI", note: "fine", count: 6, when: null, ...over });

const columns: CsvColumn<Row>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Note", value: (r) => r.note },
  { header: "Count", value: (r) => r.count },
  { header: "When", value: (r) => r.when },
];

const lines = (csv: string) => csv.replace(/\r\n$/, "").split("\r\n");

describe("toCsv", () => {
  it("writes a header row and CRLF line endings", () => {
    const csv = toCsv([row(), row({ name: "Ofcom" })], columns);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.includes("\n\n")).toBe(false);
    expect(lines(csv)).toEqual(["Name,Note,Count,When", "ARTCI,fine,6,", "Ofcom,fine,6,"]);
  });

  it("writes only the header when there are no rows", () => {
    expect(toCsv([], columns)).toBe("Name,Note,Count,When\r\n");
  });

  it("quotes cells with commas, doubles embedded quotes and keeps newlines inside the quoted cell", () => {
    const csv = toCsv([row({ name: 'ARTCI, "the" regulator', note: "line one\nline two" })], columns);
    const [, body] = lines(csv);
    expect(body).toBe('"ARTCI, ""the"" regulator","line one\nline two",6,');
  });

  it("quotes cells that carry a carriage return or surrounding whitespace", () => {
    const csv = toCsv([row({ name: "  padded  ", note: "a\r\nb" })], columns);
    expect(lines(toCsv([row({ name: "  padded  " })], columns))[1]).toContain('"  padded  "');
    expect(csv).toContain('"a\r\nb"');
  });

  it("defuses spreadsheet formulas by prefixing a single quote", () => {
    for (const lead of ["=", "+", "-", "@"]) {
      const csv = toCsv([row({ name: `${lead}HYPERLINK("http://evil.example")` })], columns);
      expect(csv).toContain(`"'${lead}HYPERLINK(""http://evil.example"")"`);
    }
    // The guard applies to the text itself, not to values we formatted ourselves.
    expect(lines(toCsv([row({ name: "=1+1", count: -4 })], columns))[1]).toBe("'=1+1,fine,-4,");
  });

  it("renders dates as ISO instants and empty cells for null or undefined", () => {
    const csv = toCsv([row({ when: new Date("2026-08-26T14:00:00.000Z") })], [...columns, { header: "Missing", value: () => undefined }]);
    expect(lines(csv)[1]).toBe("ARTCI,fine,6,2026-08-26T14:00:00.000Z,");
  });

  it("keeps the column order given and escapes headers too", () => {
    const csv = toCsv([row()], [{ header: "Waiting on, days", value: (r) => r.count }]);
    expect(lines(csv)).toEqual(['"Waiting on, days"', "6"]);
  });
});
