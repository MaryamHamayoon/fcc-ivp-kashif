// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import { ProgramBand } from "@/components/dashboard/ProgramBand";
import type { DashboardData } from "@/lib/services/dashboard";

// 4 Sep 2026 in Washington: FY26, eleven fiscal months in.
const ASOF = new Date("2026-09-04T18:00:00Z");

const kpis: DashboardData["kpis"] = {
  meetingsFy: { value: 46, prior: 50, series: [4, 5, 3, 6, 4, 5, 3, 4, 5, 4, 3, 0] },
  countriesFy: { value: 43, prior: 43, series: [3, 4, 3, 5, 4, 4, 3, 4, 4, 3, 3, 0] },
  participantsFy: { value: 425, prior: 380, series: [30, 40, 35, 50, 40, 45, 30, 35, 45, 40, 35, 0] },
  upcoming30: { value: 5, prior: null, series: [2, 1, 2, 0, 1, 0, 0, 1, 0, 0, 0, 0] },
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ProgramBand", () => {
  it("states the year in one sentence and shows the figures it is built from", () => {
    render(<ProgramBand kpis={kpis} fiscalYear={2026} asOf={ASOF} scoped={false} />);

    expect(screen.getByText("46 engagements across 43 countries this fiscal year, reaching 425 foreign officials.")).toBeInTheDocument();

    expect(screen.getByText("46")).toBeInTheDocument();
    expect(screen.getByText("43")).toBeInTheDocument();
    expect(screen.getByText("425")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("in the next 30 days")).toBeInTheDocument();
    expect(screen.getByText("Counted meetings with a date this fiscal year")).toBeInTheDocument();
  });

  it("opens with the same slim title bar as every other section: its name, the year, and the collapse control", () => {
    render(<ProgramBand kpis={kpis} fiscalYear={2026} asOf={ASOF} scoped={false} />);
    const heading = screen.getByRole("heading", { level: 2, name: "Program at a glance" });
    const bar = heading.closest("header") as HTMLElement;
    expect(bar).toHaveAttribute("data-tone", "band");
    expect(within(bar).getByText("FY26")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Collapse the program summary" })).toBeInTheDocument();
    // The section is named by its title, the year's sentence is its statement — and the old pill is gone.
    expect(screen.getByRole("region", { name: "Program at a glance" })).toBeInTheDocument();
    expect(screen.queryByText("FY26 · Program at a glance")).toBeNull();
  });

  it("speaks each movement against last year as words, and stays neutral when nothing moved", () => {
    render(<ProgramBand kpis={kpis} fiscalYear={2026} asOf={ASOF} scoped={false} />);

    expect(screen.getByText("−4 vs FY25")).toBeInTheDocument();
    expect(screen.getByText("down 4 versus FY25")).toBeInTheDocument();
    expect(screen.getByText("+45 vs FY25")).toBeInTheDocument();
    expect(screen.getByText("up 45 versus FY25")).toBeInTheDocument();
    expect(screen.getByText("Same as FY25")).toBeInTheDocument();
    // Three figures carry a comparison; the next-30-days count has nothing to compare with.
    expect(screen.getAllByText(/vs FY25/)).toHaveLength(2);
    expect(screen.getAllByText(/versus FY25/)).toHaveLength(2);
  });

  it("addresses an expert about their own briefings", () => {
    render(<ProgramBand kpis={{ ...kpis, meetingsFy: { value: 6, prior: 4, series: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0] } }} fiscalYear={2026} asOf={ASOF} scoped />);
    expect(screen.getByRole("heading", { level: 2, name: "Your briefings" })).toBeInTheDocument();
    expect(screen.getByText("6 of your briefings across 43 countries this fiscal year, reaching 425 foreign officials.")).toBeInTheDocument();
  });

  it("collapses to the headline and remembers the choice", async () => {
    render(<ProgramBand kpis={kpis} fiscalYear={2026} asOf={ASOF} scoped={false} />);

    const collapse = screen.getByRole("button", { name: "Collapse the program summary" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(collapse);

    const expand = screen.getByRole("button", { name: "Expand the program summary" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(window.localStorage.getItem("ivp.band")).toBe("collapsed");
    await waitForElementToBeRemoved(() => screen.queryByText("Counted meetings with a date this fiscal year"));
    // The sentence survives a collapse — that is the whole point of the band.
    expect(screen.getByText("46 engagements across 43 countries this fiscal year, reaching 425 foreign officials.")).toBeInTheDocument();

    fireEvent.click(expand);
    expect(screen.getByRole("button", { name: "Collapse the program summary" })).toHaveAttribute("aria-expanded", "true");
    expect(window.localStorage.getItem("ivp.band")).toBe("expanded");
    expect(screen.getByText("Counted meetings with a date this fiscal year")).toBeInTheDocument();
  });
});
