// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { ReportTable } from "@/components/reports/ReportTable";
import type { ReportTable as ReportTableData } from "@/lib/reports/tables";

const table: ReportTableData = {
  name: "By bureau",
  columns: ["Bureau", "Requests", "Share"],
  rows: [
    ["Wireless Telecommunications Bureau", 12, 0.4],
    ["International Bureau", 9, 0.3],
    ["Total", 21, 0.7],
  ],
  formats: { 2: "percent" },
};

afterEach(cleanup);

describe("ReportTable", () => {
  it("wraps the table in a focusable region a keyboard can scroll, named after the caption", () => {
    render(<ReportTable table={table} caption="Expert requests by bureau in FY26" />);
    const region = screen.getByRole("region", { name: "Expert requests by bureau in FY26" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(within(region).getByRole("table", { name: "Expert requests by bureau in FY26" })).toBeInTheDocument();
  });

  it("shows a fiscal year as a year, never as a count with a separator", () => {
    render(<ReportTable table={{ name: "Tracker", columns: ["IVP code", "Fiscal year", "Participants"], rows: [["IVP-2026-001", 2026, 1200]], formats: { 1: "year" } }} caption="Tracker" />);
    expect(screen.getAllByRole("row")[1]?.textContent).toBe("IVP-2026-0012026" + "1,200");
  });

  it("formats counts, percentages and blanks, and moves a total into the foot", () => {
    render(<ReportTable table={{ ...table, rows: [...table.rows.slice(0, 2), ["Nowhere", null, null], table.rows[2]!] }} caption="Requests" totals />);
    const rows = screen.getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual(["BureauRequestsShare", "Wireless Telecommunications Bureau1240%", "International Bureau930%", "Nowhere——", "Total2170%"]);
    expect(screen.getByRole("table").querySelector("tfoot")?.textContent).toBe("Total2170%");
  });
});
