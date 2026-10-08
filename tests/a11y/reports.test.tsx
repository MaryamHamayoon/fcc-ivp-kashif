// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BriefPage } from "@/components/reports/BriefPage";
import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";
import { REPORTS } from "@/lib/api/schemas";
import { briefFor } from "@/lib/reports/brief-data";
import { serializeReports } from "@/lib/reports/serialize";
import { buildReports, type ReportOptions } from "@/lib/services/reports";
import { makeReportDataset } from "@/tests/fixtures/reports";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/reports",
  useSearchParams: () => new URLSearchParams("fy=2026&regionId=af&status=completed"),
}));

afterEach(cleanup);

const ds = makeReportDataset();
const payload = serializeReports(buildReports(ds, "topic", "meetings"), ds);
const options: ReportOptions = {
  regions: [{ value: "af", label: "Africa" }],
  countries: [{ value: "KE", label: "Kenya", hint: "Africa" }],
  topics: [{ value: "spectrum-sharing", label: "Spectrum Sharing" }],
  bureaus: [{ value: "WTB", label: "Wireless Telecommunications Bureau", hint: "WTB" }],
  leads: [{ value: "usr_marcus", label: "Marcus Bell" }],
  fiscalYears: [2026, 2025, 2024],
  currentFiscalYear: 2026,
};

describe("reports accessibility", () => {
  for (const report of REPORTS) {
    it(`the ${report} report, its filter bar and tabs carry no WCAG violations`, async () => {
      const { container } = render(<ReportsWorkspace payload={payload} options={options} report={report} />);
      await expectNoViolations(container);
    });
  }

  it("the empty state carries no WCAG violations", async () => {
    const { container } = render(<ReportsWorkspace payload={{ ...payload, meetingCount: 0 }} options={options} report="summary" />);
    await expectNoViolations(container);
  });

  it("the export menu, open, carries no WCAG violations", async () => {
    const { container } = render(<ReportsWorkspace payload={payload} options={options} report="summary" />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(3);
    // The open menu hides the rest of the page from assistive tech, as a menu should, so it is checked on its own.
    await expectNoViolations(menu);
    expect(container).toBeInTheDocument();
  });

  it("the executive brief carries no WCAG violations", async () => {
    const { container } = render(<BriefPage brief={briefFor(ds, buildReports(ds, "topic", "meetings"))} />);
    await expectNoViolations(container);
  });
});
