// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormatDonut } from "@/components/charts/FormatDonut";
import { TopicFlow } from "@/components/charts/TopicFlow";
import type { FormatShare, TopicFlows } from "@/lib/domain/insights";

afterEach(cleanup);

const formats: FormatShare[] = [
  { key: "virtual", label: "Virtual", count: 25, participants: 214, share: 25 / 45, priorShare: 0.48, deltaPoints: 8 },
  { key: "in_person", label: "In person", count: 18, participants: 190, share: 18 / 45, priorShare: 0.43, deltaPoints: -3 },
  { key: "hybrid", label: "Hybrid", count: 2, participants: 24, share: 2 / 45, priorShare: 0.04, deltaPoints: 0 },
];

describe("FormatDonut", () => {
  const renderDonut = (data = formats) => render(<FormatDonut data={data} label="Meeting formats in FY26" currentLabel="FY26" priorLabel="FY25" />);

  it("names every format with its meetings, its share and how that moved since last year", () => {
    renderDonut();
    const virtual = screen.getByRole("button", { name: /^Virtual/ });
    expect(virtual).toHaveAccessibleName("Virtual: 25 meetings, 56% of FY26, up 8 points from FY25");
    expect(screen.getByRole("button", { name: /^In person/ })).toHaveAccessibleName("In person: 18 meetings, 40% of FY26, down 3 points from FY25");
    expect(screen.getByRole("button", { name: /^Hybrid/ })).toHaveAccessibleName("Hybrid: 2 meetings, 4% of FY26, unchanged from FY25");
  });

  it("holds the year's total in the middle until a format is pointed at, then tells that format's story", async () => {
    renderDonut();
    const center = screen.getByTestId("donut-center");
    expect(center).toHaveTextContent("45");
    expect(center).toHaveTextContent("meetings");

    await userEvent.hover(screen.getByRole("button", { name: /^In person/ }));
    expect(center).toHaveTextContent("40%");
    expect(center).toHaveTextContent("In person");
    expect(center).toHaveTextContent("18 meetings");
    expect(center).toHaveTextContent("190 participants");

    await userEvent.unhover(screen.getByRole("button", { name: /^In person/ }));
    expect(center).toHaveTextContent("45");
  });

  it("answers the keyboard the same way it answers the pointer", () => {
    renderDonut();
    const hybrid = screen.getByRole("button", { name: /^Hybrid/ });
    fireEvent.focus(hybrid);
    expect(screen.getByTestId("donut-center")).toHaveTextContent("Hybrid");
    expect(document.querySelector('[data-format="hybrid"]')).toHaveAttribute("data-active", "true");
    expect(document.querySelector('[data-format="virtual"]')).toHaveAttribute("data-active", "false");
    fireEvent.blur(hybrid);
    expect(document.querySelector('[data-format="hybrid"]')).not.toHaveAttribute("data-active");
  });

  it("stays pinned on a tap, for a reader with no pointer to hover with", async () => {
    renderDonut();
    const virtual = screen.getByRole("button", { name: /^Virtual/ });
    await userEvent.click(virtual);
    await userEvent.unhover(virtual);
    expect(virtual).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("donut-center")).toHaveTextContent("Virtual");

    await userEvent.click(virtual);
    expect(virtual).toHaveAttribute("aria-pressed", "false");
  });

  it("says nothing about last year when there is no last year to compare with", () => {
    renderDonut(formats.map((f) => ({ ...f, priorShare: null, deltaPoints: null })));
    expect(screen.getByRole("button", { name: /^Virtual/ })).toHaveAccessibleName("Virtual: 25 meetings, 56% of FY26");
    expect(screen.queryByText(/inner ring/i)).toBeNull();
  });
});

const flows: TopicFlows = {
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
};

describe("TopicFlow", () => {
  const renderFlow = (data = flows) => render(<TopicFlow flows={data} label="Topics raised in FY26, by region" />);

  it("opens on the finding: the leading topic and who raised it most", () => {
    renderFlow();
    expect(screen.getByTestId("flow-readout")).toHaveTextContent("Spectrum valuation leads with 5 meetings, most often with Asia-Pacific.");
  });

  it("describes every region and topic to a reader who cannot see the ribbons", () => {
    renderFlow();
    const chart = screen.getByRole("group", { name: "Topics raised in FY26, by region" });
    expect(within(chart).getByRole("img", { name: "Asia-Pacific: 4 meetings raised these topics 5 times, most often Spectrum valuation (3)" })).toBeInTheDocument();
    expect(within(chart).getByRole("img", { name: "Spectrum valuation: 5 meetings, most often with Asia-Pacific (3), then Africa (2)" })).toBeInTheDocument();
  });

  it("lights the ribbons of whatever is focused and quiets the rest", () => {
    renderFlow();
    fireEvent.focus(screen.getByRole("img", { name: /^Network resilience/ }));
    const ribbon = (region: string, topic: string) => document.querySelector(`[data-ribbon="${region}→${topic}"]`);
    expect(ribbon("Asia-Pacific", "Network resilience")).toHaveAttribute("data-state", "active");
    expect(ribbon("Africa", "Network resilience")).toHaveAttribute("data-state", "active");
    expect(ribbon("Asia-Pacific", "Spectrum valuation")).toHaveAttribute("data-state", "quiet");
    expect(screen.getByTestId("flow-readout")).toHaveTextContent("Network resilience · 3 meetings · Asia-Pacific 2, Africa 1");
  });

  it("names a single ribbon when it is the thing pointed at", async () => {
    renderFlow();
    await userEvent.hover(document.querySelector('[data-ribbon="Africa→Spectrum valuation"]')!);
    expect(screen.getByTestId("flow-readout")).toHaveTextContent("Africa → Spectrum valuation · 2 meetings");
    await userEvent.unhover(document.querySelector('[data-ribbon="Africa→Spectrum valuation"]')!);
    expect(screen.getByTestId("flow-readout")).toHaveTextContent("Spectrum valuation leads");
  });

  it("is one tab stop, travelled with the arrow keys: down a column, across to the other", async () => {
    renderFlow();
    const stops = screen.getAllByRole("img").filter((node) => node.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);

    await userEvent.tab();
    expect(screen.getByRole("img", { name: /^Asia-Pacific/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("img", { name: /^Africa/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("img", { name: /^Network resilience/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("img", { name: /^Spectrum valuation/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("img", { name: /^Asia-Pacific/ })).toHaveFocus();
  });

  it("admits what the picture leaves out", () => {
    renderFlow();
    expect(screen.getByText("4 more topics were raised less often and are not drawn.")).toBeInTheDocument();
  });
});

/** Nine countries in one region, so the drilled view has to fold the smallest of them together. */
const crowded: TopicFlows = {
  topics: [{ key: "Spectrum valuation", label: "Spectrum valuation", meetings: 12 }],
  regions: [{ key: "Africa", label: "Africa", meetings: 12, mentions: 12 }],
  links: [{ region: "Africa", topic: "Spectrum valuation", count: 12 }],
  countries: [
    { key: "AO", label: "Angola", region: "Africa", meetings: 4, mentions: 4 },
    { key: "BJ", label: "Benin", region: "Africa", meetings: 1, mentions: 1 },
    { key: "TD", label: "Chad", region: "Africa", meetings: 1, mentions: 1 },
    { key: "GH", label: "Ghana", region: "Africa", meetings: 1, mentions: 1 },
    { key: "KE", label: "Kenya", region: "Africa", meetings: 1, mentions: 1 },
    { key: "ML", label: "Mali", region: "Africa", meetings: 1, mentions: 1 },
    { key: "NA", label: "Namibia", region: "Africa", meetings: 1, mentions: 1 },
    { key: "RW", label: "Rwanda", region: "Africa", meetings: 1, mentions: 1 },
    { key: "TG", label: "Togo", region: "Africa", meetings: 1, mentions: 1 },
  ],
  countryLinks: [
    { region: "Africa", country: "AO", topic: "Spectrum valuation", count: 4 },
    { region: "Africa", country: "BJ", topic: "Spectrum valuation", count: 1 },
    { region: "Africa", country: "TD", topic: "Spectrum valuation", count: 1 },
    { region: "Africa", country: "GH", topic: "Spectrum valuation", count: 1 },
    { region: "Africa", country: "KE", topic: "Spectrum valuation", count: 1 },
    { region: "Africa", country: "ML", topic: "Spectrum valuation", count: 1 },
    { region: "Africa", country: "NA", topic: "Spectrum valuation", count: 1 },
    { region: "Africa", country: "RW", topic: "Spectrum valuation", count: 1 },
    { region: "Africa", country: "TG", topic: "Spectrum valuation", count: 1 },
  ],
  otherTopics: 0,
};

describe("TopicFlow drill-down", () => {
  const OVERVIEW = "Topics raised in FY26, by region";
  const DRILLED = "Topics raised in FY26 by Asia-Pacific, by country";
  const renderDrilled = (onRegion = vi.fn()) => render(<TopicFlow flows={flows} region="Asia-Pacific" onRegion={onRegion} label={DRILLED} />);

  it("names the columns instead of finishing a sentence around them", () => {
    render(<TopicFlow flows={flows} label={OVERVIEW} />);
    expect(screen.getByText("Regions")).toBeInTheDocument();
    expect(screen.getByText("Topics")).toBeInTheDocument();
    expect(screen.getByText("Meetings")).toBeInTheDocument();
    expect(screen.queryByText(/Delegations from/)).toBeNull();
    expect(screen.queryByText(/came to discuss/)).toBeNull();
  });

  it("makes each region a way into its countries, and leaves the chart as it was when there is nowhere to go", () => {
    const onRegion = vi.fn();
    const { unmount } = render(<TopicFlow flows={flows} onRegion={onRegion} label={OVERVIEW} />);
    const asia = screen.getByRole("button", { name: /^Asia-Pacific/ });
    expect(asia).toHaveAccessibleName("Asia-Pacific: 4 meetings raised these topics 5 times, most often Spectrum valuation (3). Show its countries");
    fireEvent.click(asia);
    expect(onRegion).toHaveBeenCalledWith("Asia-Pacific");
    unmount();

    render(<TopicFlow flows={flows} label={OVERVIEW} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("img", { name: "Asia-Pacific: 4 meetings raised these topics 5 times, most often Spectrum valuation (3)" })).toBeInTheDocument();
  });

  it("says out loud that there is a level below, once there is a way down", () => {
    const { rerender } = render(<TopicFlow flows={flows} label={OVERVIEW} />);
    expect(screen.queryByText(/Select a region/)).toBeNull();
    rerender(<TopicFlow flows={flows} onRegion={vi.fn()} label={OVERVIEW} />);
    expect(screen.getByText("4 more topics were raised less often and are not drawn. Select a region to see its countries.")).toBeInTheDocument();
  });

  it("swaps the regions for one region's countries, each a link to its dossier", () => {
    renderDrilled();
    const japan = screen.getByRole("link", { name: /^Japan/ });
    expect(japan).toHaveAttribute("href", "/countries/JP");
    expect(japan).toHaveAccessibleName("Japan: 2 meetings raised these topics 3 times, most often Spectrum valuation (2). Open Japan");
    expect(screen.getByRole("link", { name: /^South Korea/ })).toHaveAttribute("href", "/countries/KR");
    expect(screen.queryByText("Kenya")).toBeNull();
  });

  it("counts the topics within the region and keys its ribbons by country", () => {
    renderDrilled();
    expect(screen.getByRole("img", { name: /^Spectrum valuation/ })).toHaveAccessibleName("Spectrum valuation: 3 meetings, most often with Japan (2), then South Korea (1)");
    expect(document.querySelector('[data-ribbon="JP→Spectrum valuation"]')).toBeInTheDocument();
    expect(document.querySelector('[data-ribbon="Asia-Pacific→Spectrum valuation"]')).toBeNull();
  });

  it("opens on the region's own finding, and holds the region's name in the breadcrumb", () => {
    renderDrilled();
    expect(screen.getByTestId("flow-readout")).toHaveTextContent("Asia-Pacific: Spectrum valuation leads with 3 meetings, most often with Japan.");
    expect(screen.getByText("Asia-Pacific")).toBeInTheDocument();
  });

  it("starts a region's name with the short label it shows, so what is read aloud is what is on the screen", () => {
    // WCAG 2.5.3: a button a sighted user would call "MENA" has to answer to "MENA".
    const abbreviated: TopicFlows = {
      ...flows,
      regions: [...flows.regions, { key: "Middle East & North Africa", label: "Middle East & North Africa", meetings: 1, mentions: 1 }],
      links: [...flows.links, { region: "Middle East & North Africa", topic: "Spectrum valuation", count: 1 }],
      countries: [...flows.countries, { key: "KW", label: "Kuwait", region: "Middle East & North Africa", meetings: 1, mentions: 1 }],
      countryLinks: [...flows.countryLinks, { region: "Middle East & North Africa", country: "KW", topic: "Spectrum valuation", count: 1 }],
    };
    const { unmount } = render(<TopicFlow flows={abbreviated} onRegion={vi.fn()} label={OVERVIEW} />);
    expect(screen.getByText("MENA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^MENA, / })).toHaveAccessibleName(
      "MENA, Middle East & North Africa: 1 meeting raised these topics 1 time, most often Spectrum valuation (1). Show its countries",
    );
    expect(screen.getByRole("button", { name: /^Asia-Pacific: / })).toBeInTheDocument();
    unmount();

    // A row that cannot be pressed is only described, and keeps the plain name it had.
    render(<TopicFlow flows={abbreviated} label={OVERVIEW} />);
    expect(screen.getByRole("img", { name: /^Middle East & North Africa: / })).toBeInTheDocument();
  });

  it("leaves focus alone when the level changes from outside the chart, even after a press that came to nothing", async () => {
    const { rerender } = render(<TopicFlow flows={flows} onRegion={vi.fn()} label={OVERVIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /^Asia-Pacific/ }));

    // The owner did not act on the press; later the menu, not the chart, asks for another region.
    rerender(<TopicFlow flows={flows} region="Africa" onRegion={vi.fn()} label="Topics raised in FY26 by Africa, by country" />);
    const back = await screen.findByRole("button", { name: "All regions" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Showing Africa by country"));
    expect(back).not.toHaveFocus();
  });

  it("finds the region's own leading topic, which need not be the program's", () => {
    // The topics keep the order the overview gave them, so the region's leader can sit further down.
    const uneven: TopicFlows = {
      ...flows,
      topics: [
        { key: "Spectrum valuation", label: "Spectrum valuation", meetings: 4 },
        { key: "Network resilience", label: "Network resilience", meetings: 4 },
      ],
      links: [
        { region: "Asia-Pacific", topic: "Spectrum valuation", count: 3 },
        { region: "Asia-Pacific", topic: "Network resilience", count: 2 },
        { region: "Africa", topic: "Spectrum valuation", count: 1 },
        { region: "Africa", topic: "Network resilience", count: 2 },
      ],
      countryLinks: [
        ...flows.countryLinks.filter((l) => l.region !== "Africa"),
        { region: "Africa", country: "KE", topic: "Spectrum valuation", count: 1 },
        { region: "Africa", country: "KE", topic: "Network resilience", count: 1 },
        { region: "Africa", country: "NG", topic: "Network resilience", count: 1 },
      ],
    };
    render(<TopicFlow flows={uneven} region="Africa" onRegion={vi.fn()} label="Topics raised in FY26 by Africa, by country" />);
    expect(screen.getByTestId("flow-readout")).toHaveTextContent("Africa: Network resilience leads with 2 meetings, most often with Kenya.");
  });

  it("puts the way back at the head of the left column", () => {
    const onRegion = vi.fn();
    renderDrilled(onRegion);
    const back = screen.getByRole("button", { name: "All regions" });
    // A breadcrumb like the top bar's: the separator sits between the crumbs, not inside the link.
    expect(back.querySelector("svg")).toBeNull();
    fireEvent.click(back);
    expect(onRegion).toHaveBeenCalledWith(null);
  });

  it("marks each region with a chevron that is there before it is pointed at", () => {
    render(<TopicFlow flows={flows} onRegion={vi.fn()} label={OVERVIEW} />);
    const regions = screen.getAllByRole("button");
    expect(regions).toHaveLength(flows.regions.length);
    for (const region of regions) {
      const chevron = region.querySelector("svg");
      expect(chevron).toBeInTheDocument();
      expect(chevron).not.toHaveClass("opacity-0");
    }
  });

  it("says what the drilled picture leaves out and where a country leads, in place of the program's own tally", () => {
    renderDrilled();
    expect(screen.getByText("Only the year's leading topics are drawn. Select a country to open it.")).toBeInTheDocument();
    expect(screen.queryByText(/more topics were raised/)).toBeNull();
  });

  it("shows every region again when the one asked for is not in the data", () => {
    render(<TopicFlow flows={flows} region="Europe" onRegion={vi.fn()} label={OVERVIEW} />);
    expect(screen.getByRole("button", { name: /^Asia-Pacific/ })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("gathers the countries past the last row into one that leads nowhere", () => {
    render(<TopicFlow flows={crowded} region="Africa" onRegion={vi.fn()} label="Topics raised in FY26 by Africa, by country" />);
    expect(screen.getAllByRole("link")).toHaveLength(7);
    expect(screen.getByRole("img", { name: /^2 other countries/ })).toBeInTheDocument();
    expect(screen.getByText("2 countries with fewer mentions are gathered in the last row. Select a country to open it.")).toBeInTheDocument();
  });

  it("tells a screen reader which view it landed on, and says nothing on arrival", () => {
    const { rerender } = render(<TopicFlow flows={flows} onRegion={vi.fn()} label={OVERVIEW} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    rerender(<TopicFlow flows={flows} region="Asia-Pacific" onRegion={vi.fn()} label={DRILLED} />);
    expect(status).toHaveTextContent("Showing Asia-Pacific by country: 2 countries.");

    rerender(<TopicFlow flows={flows} region={null} onRegion={vi.fn()} label={OVERVIEW} />);
    expect(status).toHaveTextContent("Showing all regions.");
  });

  it("is still one tab stop once drilled, travelled with the arrow keys", async () => {
    renderDrilled();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "All regions" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("link", { name: /^Japan/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("link", { name: /^South Korea/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("img", { name: /^Network resilience/ })).toHaveFocus();
  });

  it("hands focus to the way back when a region is opened from the chart, and returns it afterwards", async () => {
    const onRegion = vi.fn();
    const { rerender } = render(<TopicFlow flows={flows} onRegion={onRegion} label={OVERVIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /^Asia-Pacific/ }));

    rerender(<TopicFlow flows={flows} region="Asia-Pacific" onRegion={onRegion} label={DRILLED} />);
    const back = screen.getByRole("button", { name: "All regions" });
    await waitFor(() => expect(back).toHaveFocus());

    fireEvent.click(back);
    rerender(<TopicFlow flows={flows} region={null} onRegion={onRegion} label={OVERVIEW} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Asia-Pacific/ })).toHaveFocus());
  });
});
