// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import { Analytics } from "@/components/dashboard/Analytics";
import { ProgramBand } from "@/components/dashboard/ProgramBand";
import { UpcomingMeetings } from "@/components/dashboard/UpcomingMeetings";
import type { DashboardData } from "@/lib/services/dashboard";
import { makeListItem } from "@/tests/fixtures/meetings";
import { expectNoViolations } from "./axe";

const NOW = new Date("2026-08-29T14:00:00Z");

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

const upcoming = [
  makeListItem({ id: "m1", scheduledStart: new Date("2026-08-29T18:30:00Z"), scheduledEnd: new Date("2026-08-29T20:00:00Z") }),
  makeListItem({ id: "m2", status: "clearance", format: "virtual", countryCode: "GB", countryName: "United Kingdom", countryCodes: ["GB", "IE"], orgShortName: "Ofcom", leadName: null, scheduledStart: new Date("2026-08-31T14:00:00Z"), scheduledEnd: null }),
  makeListItem({ id: "m3", status: "developing", format: "hybrid", ochAttending: true, scheduledStart: new Date("2026-09-24T13:00:00Z"), scheduledEnd: null }),
];

describe("dashboard accessibility", () => {
  it("the program band carries no WCAG violations, expanded or collapsed", async () => {
    const { container } = render(<ProgramBand kpis={kpis} fiscalYear={2026} asOf={NOW} scoped={false} />);
    await expectNoViolations(container);

    fireEvent.click(screen.getByRole("button", { name: "Collapse the program summary" }));
    await waitForElementToBeRemoved(() => screen.queryByText("Foreign officials across those meetings"));
    await expectNoViolations(container);
  });

  it("the upcoming meetings card carries no WCAG violations, full or empty", async () => {
    const { container, rerender } = render(<UpcomingMeetings meetings={upcoming} total={14} now={NOW} />);
    await expectNoViolations(container);
    rerender(<UpcomingMeetings meetings={[]} total={0} now={NOW} />);
    await expectNoViolations(container);
  });

  it("the year's figures carry no WCAG violations: at rest, with a format pinned and a topic in focus, with the tables open and drilled into a region", async () => {
    const analytics: DashboardData["analytics"] = {
      topics: {
        topics: [
          { key: "Spectrum valuation", label: "Spectrum valuation", meetings: 5 },
          { key: "Network resilience", label: "Network resilience", meetings: 3 },
        ],
        regions: [
          { key: "Asia-Pacific", label: "Asia-Pacific", meetings: 4, mentions: 5 },
          { key: "Africa", label: "Africa", meetings: 3, mentions: 3 },
        ],
        links: [
          { region: "Asia-Pacific", topic: "Spectrum valuation", count: 3 },
          { region: "Asia-Pacific", topic: "Network resilience", count: 2 },
          { region: "Africa", topic: "Spectrum valuation", count: 2 },
          { region: "Africa", topic: "Network resilience", count: 1 },
        ],
        countries: [
          { key: "JP", label: "Japan", region: "Asia-Pacific", meetings: 2, mentions: 3 },
          { key: "KR", label: "South Korea", region: "Asia-Pacific", meetings: 2, mentions: 2 },
          { key: "KE", label: "Kenya", region: "Africa", meetings: 2, mentions: 2 },
          { key: "NG", label: "Nigeria", region: "Africa", meetings: 1, mentions: 1 },
        ],
        countryLinks: [
          { region: "Asia-Pacific", country: "JP", topic: "Spectrum valuation", count: 2 },
          { region: "Asia-Pacific", country: "JP", topic: "Network resilience", count: 1 },
          { region: "Asia-Pacific", country: "KR", topic: "Spectrum valuation", count: 1 },
          { region: "Asia-Pacific", country: "KR", topic: "Network resilience", count: 1 },
          { region: "Africa", country: "KE", topic: "Spectrum valuation", count: 1 },
          { region: "Africa", country: "KE", topic: "Network resilience", count: 1 },
          { region: "Africa", country: "NG", topic: "Spectrum valuation", count: 1 },
        ],
        otherTopics: 4,
      },
      formats: [
        { key: "virtual", label: "Virtual", count: 25, participants: 214, share: 25 / 45, priorShare: 0.48, deltaPoints: 8 },
        { key: "in_person", label: "In person", count: 18, participants: 190, share: 18 / 45, priorShare: 0.43, deltaPoints: -3 },
        { key: "hybrid", label: "Hybrid", count: 2, participants: 24, share: 2 / 45, priorShare: 0.04, deltaPoints: 0 },
      ],
      cadence: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((month, i) => ({ month, current: i % 5, prior: (i + 2) % 4 })),
      bureaus: [{ key: "ib", label: "Space Bureau", count: 9 }],
    };
    const { container } = render(<Analytics analytics={analytics} fy={2026} />);
    await expectNoViolations(container);

    fireEvent.click(screen.getByRole("button", { name: /^Virtual/ }));
    fireEvent.focus(screen.getByRole("img", { name: /^Network resilience/ }));
    await expectNoViolations(container);

    for (const toggle of screen.getAllByRole("button", { name: "Show data" })) fireEvent.click(toggle);
    await expectNoViolations(container);

    fireEvent.click(screen.getByRole("button", { name: /^Asia-Pacific: / }));
    expect(screen.getByRole("link", { name: /^Japan/ })).toBeInTheDocument();
    await expectNoViolations(container);
  });
});
