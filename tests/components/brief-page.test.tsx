// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { BriefPage } from "@/components/reports/BriefPage";
import { briefFor } from "@/lib/reports/brief-data";
import { buildReports } from "@/lib/services/reports";
import { makeReportDataset, reportMeetings } from "@/tests/fixtures/reports";

afterEach(cleanup);

const ds = makeReportDataset({ meetings: reportMeetings.map((m) => (m.id === "m5" ? { ...m, waiting: { label: "Bureau expert", businessDays: 4 } } : m)) });
const brief = briefFor(ds, buildReports(ds, "topic", "meetings"));

describe("BriefPage", () => {
  it("reads as one document: the year in the title, the headline, four figures, six sections", () => {
    render(<BriefPage brief={brief} />);
    expect(screen.getByRole("heading", { level: 1, name: "FY26 executive brief" })).toBeInTheDocument();
    expect(screen.getByText(brief.headline)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Key figures" })).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Where", "What", "Next 30 days", "Needs attention", "Participants", "Format"]);
    expect(screen.getAllByText(/vs FY25|Same as FY25/).length).toBeGreaterThan(0);
  });

  it("offers the PDF for the same year and a way back to the reports", () => {
    render(<BriefPage brief={brief} />);
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", "/api/reports/brief?fy=2026");
    expect(screen.getByRole("link", { name: "Back to reports" })).toHaveAttribute("href", "/reports?fy=2026");
  });

  it("links what is next and what is stuck to their meeting records", () => {
    render(<BriefPage brief={brief} />);
    const soonest = brief.next[0]!;
    expect(soonest.meetingId).toBe("m1");
    const next = screen.getByRole("list", { name: "Meetings in the next thirty days" });
    expect(within(next).getByRole("link", { name: `${soonest.countryName} · ${soonest.orgName}` })).toHaveAttribute("href", "/meetings/m1");
    expect(within(next).getByText("Confirmed")).toBeInTheDocument();

    const longest = brief.stuck[0]!;
    expect(longest.meetingId).toBe("m5");
    const stuck = screen.getByRole("list", { name: "Meetings waiting longest" });
    expect(within(stuck).getByRole("link", { name: longest.code })).toHaveAttribute("href", "/meetings/m5");
    expect(within(stuck).getByText("Bureau expert · 4d")).toBeInTheDocument();
  });

  it("says so when there is no prior year, nothing next and nothing stuck", () => {
    render(<BriefPage brief={{ ...brief, figures: brief.figures.map((f) => ({ ...f, prior: null })), next: [], stuck: [], participants: [], formats: [] }} />);
    expect(screen.getAllByText("no FY25 data")).toHaveLength(4);
    expect(screen.getByText("Nothing scheduled in the next thirty days.")).toBeInTheDocument();
    expect(screen.getByText("Nothing is waiting on anyone.")).toBeInTheDocument();
    expect(screen.getByText("No participants recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No meetings counted yet.")).toBeInTheDocument();
  });
});
