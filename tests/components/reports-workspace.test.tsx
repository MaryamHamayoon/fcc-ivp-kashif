// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";
import { serializeReports } from "@/lib/reports/serialize";
import { buildReports, type ReportOptions } from "@/lib/services/reports";
import { makeReportDataset } from "@/tests/fixtures/reports";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/reports",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const ds = makeReportDataset();
const payload = serializeReports(buildReports(ds, "topic", "meetings"), ds);
const options: ReportOptions = {
  regions: [
    { value: "af", label: "Africa" },
    { value: "eur", label: "Europe" },
  ],
  countries: [{ value: "KE", label: "Kenya", hint: "Africa" }],
  topics: [{ value: "spectrum-sharing", label: "Spectrum Sharing" }],
  bureaus: [{ value: "WTB", label: "Wireless Telecommunications Bureau", hint: "WTB" }],
  leads: [{ value: "usr_marcus", label: "Marcus Bell" }],
  fiscalYears: [2026, 2025, 2024],
  currentFiscalYear: 2026,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  nav.search = "";
});

describe("ReportsWorkspace", () => {
  it("opens on the program summary: four figures, six views, the tab marked current", () => {
    render(<ReportsWorkspace payload={payload} options={options} report="summary" />);
    expect(screen.getByRole("heading", { level: 1, name: "Reports" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Key figures" })).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getAllByRole("figure")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Program summary" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Tracker" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Open the brief" })).toHaveAttribute("href", "/reports/brief?fy=2026");
  });

  it("carries the filters into every tab's link", () => {
    nav.search = "fy=2026&regionId=af&status=completed";
    render(<ReportsWorkspace payload={payload} options={options} report="summary" />);
    expect(screen.getByRole("link", { name: "Fiscal-year tally" })).toHaveAttribute("href", "/reports?fy=2026&regionId=af&status=completed&report=tally");
    expect(screen.getByRole("button", { name: /^Region · Africa/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Status · Completed/ })).toBeInTheDocument();
  });

  it("lays the tally out as twelve months and a total", () => {
    render(<ReportsWorkspace payload={payload} options={options} report="tally" />);
    const months = screen.getByRole("table", { name: /by fiscal month/ });
    expect(within(months).getAllByRole("row")).toHaveLength(1 + 12 + 1);
    expect(within(months).getAllByRole("cell")[0]).toHaveTextContent("Oct");
    expect(within(months).getByText("Total")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /by region/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /by topic/ })).toBeInTheDocument();
  });

  it("offers the workbook, this report's CSV and the brief, each under the current filters", async () => {
    nav.search = "fy=2026&regionId=af";
    const hrefs: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      hrefs.push(this.getAttribute("href") ?? "");
    });
    render(<ReportsWorkspace payload={payload} options={options} report="tally" />);

    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Excel workbookEvery report, one sheet each", "CSV of this reportFiscal-year tally", "Executive brief (PDF)FY26 one-pager"]);
    await userEvent.click(items[1]!);
    expect(hrefs).toEqual(["/api/reports/export?fy=2026&regionId=af&as=csv&report=tally"]);

    await userEvent.click(screen.getByRole("button", { name: "Download Fiscal-year tally as CSV" }));
    expect(hrefs.at(-1)).toBe("/api/reports/export?fy=2026&regionId=af&as=csv&report=tally");
  });

  it("links each year, marks the current one, and writes a filter to the URL", async () => {
    render(<ReportsWorkspace payload={payload} options={options} report="summary" />);
    const years = within(screen.getByRole("navigation", { name: "Fiscal year" }));
    expect(years.getByRole("link", { name: "FY26" })).toHaveAttribute("aria-current", "page");
    expect(years.getByRole("link", { name: "FY25" })).toHaveAttribute("href", "/reports?fy=2025");
    // The workspace has a second status region: the progress line under the tabs.
    expect(screen.getAllByRole("status").map((region) => region.textContent)).toContain(`${payload.meetingCount} meetings`);

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.click(await screen.findByRole("option", { name: "Region" }));
    await userEvent.click(await screen.findByRole("option", { name: "Europe" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/reports?regionId=eur", { scroll: false });
  });

  it("says so, without charts, when nothing matches, and clears the filters in one go", async () => {
    nav.search = "regionId=eur&status=closed";
    render(<ReportsWorkspace payload={{ ...payload, meetingCount: 0 }} options={options} report="summary" />);
    expect(screen.getByText("No meetings match these filters.")).toBeInTheDocument();
    expect(screen.queryAllByRole("figure")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(nav.replace).toHaveBeenCalledWith("/reports", { scroll: false });
  });

  it("links tracker rows to their records and participants rows to theirs", () => {
    const view = render(<ReportsWorkspace payload={payload} options={options} report="tracker" />);
    expect(screen.getByRole("link", { name: "IVP-2026-041" })).toHaveAttribute("href", "/meetings/m1");
    view.rerender(<ReportsWorkspace payload={payload} options={options} report="participants" />);
    expect(screen.getByRole("link", { name: "IVP-2026-004" })).toHaveAttribute("href", "/meetings/m3");
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
  });

  it("groups countries under their regions and links each to its dossier", () => {
    render(<ReportsWorkspace payload={payload} options={options} report="countries" />);
    expect(screen.getByRole("link", { name: /Kenya/ })).toHaveAttribute("href", "/countries/KE");
    // Each region names a subheader row and the region column of every country under it.
    expect(screen.getAllByText("Africa").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Europe").length).toBeGreaterThan(1);
  });

  it("shows bureaus as rates and days, and the briefers asked most", () => {
    render(<ReportsWorkspace payload={payload} options={options} report="experts" />);
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("2.5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dana Whitfield" })).toHaveAttribute("href", "/directory/staff/stf_dana");
  });
});
