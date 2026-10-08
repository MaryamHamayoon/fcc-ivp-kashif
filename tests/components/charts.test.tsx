// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Analytics } from "@/components/dashboard/Analytics";
import { ChartFigure } from "@/components/charts/ChartFigure";
import { DualLine } from "@/components/charts/DualLine";
import { HorizontalBars } from "@/components/charts/HorizontalBars";
import { SplitBar } from "@/components/charts/SplitBar";
import type { FormatShare, TopicFlows } from "@/lib/domain/insights";
import type { NamedCount } from "@/lib/domain/tallies";
import type { DashboardData } from "@/lib/services/dashboard";

const regions: NamedCount[] = [
  { key: "africa", label: "Africa", count: 12 },
  { key: "europe", label: "Europe", count: 8 },
  { key: "asia_pacific", label: "Asia-Pacific", count: 5 },
];

const topicFlows: TopicFlows = {
  topics: [
    { key: "Spectrum policy", label: "Spectrum policy", meetings: 9 },
    { key: "Cybersecurity", label: "Cybersecurity", meetings: 4 },
  ],
  regions: [
    { key: "Africa", label: "Africa", meetings: 7, mentions: 8 },
    { key: "Europe", label: "Europe", meetings: 5, mentions: 5 },
  ],
  links: [
    { region: "Africa", topic: "Spectrum policy", count: 5 },
    { region: "Africa", topic: "Cybersecurity", count: 3 },
    { region: "Europe", topic: "Spectrum policy", count: 4 },
    { region: "Europe", topic: "Cybersecurity", count: 1 },
  ],
  countries: [
    { key: "KE", label: "Kenya", region: "Africa", meetings: 4, mentions: 5 },
    { key: "NG", label: "Nigeria", region: "Africa", meetings: 3, mentions: 3 },
    { key: "DE", label: "Germany", region: "Europe", meetings: 3, mentions: 3 },
    { key: "FR", label: "France", region: "Europe", meetings: 2, mentions: 2 },
  ],
  countryLinks: [
    { region: "Africa", country: "KE", topic: "Spectrum policy", count: 3 },
    { region: "Africa", country: "KE", topic: "Cybersecurity", count: 2 },
    { region: "Africa", country: "NG", topic: "Spectrum policy", count: 2 },
    { region: "Africa", country: "NG", topic: "Cybersecurity", count: 1 },
    { region: "Europe", country: "DE", topic: "Spectrum policy", count: 2 },
    { region: "Europe", country: "DE", topic: "Cybersecurity", count: 1 },
    { region: "Europe", country: "FR", topic: "Spectrum policy", count: 2 },
  ],
  otherTopics: 0,
};

const formatShares: FormatShare[] = [
  { key: "in_person", label: "In person", count: 14, participants: 120, share: 14 / 21, priorShare: 0.6, deltaPoints: 7 },
  { key: "virtual", label: "Virtual", count: 5, participants: 31, share: 5 / 21, priorShare: 0.3, deltaPoints: -6 },
  { key: "hybrid", label: "Hybrid", count: 2, participants: 17, share: 2 / 21, priorShare: 0.1, deltaPoints: 0 },
];

const formats: NamedCount[] = [
  { key: "in_person", label: "In person", count: 14 },
  { key: "virtual", label: "Virtual", count: 5 },
  { key: "hybrid", label: "Hybrid", count: 2 },
];

const cadence = [
  { month: "Oct", current: 4, prior: 3 },
  { month: "Nov", current: 5, prior: 4 },
  { month: "Dec", current: 2, prior: 3 },
  { month: "Jan", current: 6, prior: 2 },
  { month: "Feb", current: 0, prior: 5 },
  { month: "Mar", current: 0, prior: 4 },
  { month: "Apr", current: 0, prior: 1 },
  { month: "May", current: 0, prior: 2 },
  { month: "Jun", current: 0, prior: 3 },
  { month: "Jul", current: 0, prior: 1 },
  { month: "Aug", current: 0, prior: 0 },
  { month: "Sep", current: 0, prior: 0 },
];

/** Shared assertions for "figure + figcaption title, then Show data -> table". */
async function expectFigureTogglesToTable(title: string) {
  const figure = screen.getByRole("figure");
  const figcaption = figure.querySelector("figcaption");
  expect(figcaption).not.toBeNull();
  expect(within(figcaption as HTMLElement).getByText(title)).toBeInTheDocument();

  expect(screen.queryByRole("table")).toBeNull();
  const toggle = screen.getByRole("button", { name: "Show data" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  await userEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Hide data" })).toHaveAttribute("aria-expanded", "true");
  return screen.getByRole("table");
}

describe("ChartFigure + charts", () => {
  it("HorizontalBars: renders a figure, toggles its data table, and labels each bar", async () => {
    render(
      <ChartFigure title="Regions" description="Meetings by region, most to least." table={{ columns: ["Region", "Meetings"], rows: regions.map((d) => [d.label, d.count]) }}>
        <HorizontalBars data={regions} label="Meetings by region" />
      </ChartFigure>,
    );

    expect(screen.getByRole("img", { name: "Africa: 12" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Europe: 8" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Asia-Pacific: 5" })).toBeInTheDocument();

    const table = await expectFigureTogglesToTable("Regions");
    expect(within(table).getByText("Africa")).toBeInTheDocument();
    expect(within(table).getByText("12")).toBeInTheDocument();
    expect(within(table).getByText("Europe")).toBeInTheDocument();
    expect(within(table).getByText("8")).toBeInTheDocument();
    expect(within(table).getByText("Asia-Pacific")).toBeInTheDocument();
    expect(within(table).getByText("5")).toBeInTheDocument();
  });

  it("SplitBar: renders a figure and toggles its data table", async () => {
    render(
      <ChartFigure title="Formats" description="Share of meetings by format." table={{ columns: ["Format", "Meetings"], rows: formats.map((d) => [d.label, d.count]) }}>
        <SplitBar data={formats} label="Meeting formats" />
      </ChartFigure>,
    );
    const table = await expectFigureTogglesToTable("Formats");
    expect(within(table).getByText("In person")).toBeInTheDocument();
    expect(within(table).getByText("14")).toBeInTheDocument();
    expect(within(table).getByText("Hybrid")).toBeInTheDocument();
    expect(within(table).getByText("2")).toBeInTheDocument();
  });

  it("DualLine: renders a figure and toggles its data table", async () => {
    render(
      <ChartFigure title="Cadence" description="Monthly cadence, this year against last." table={{ columns: ["Month", "FY26", "FY25"], rows: cadence.map((d) => [d.month, d.current, d.prior]) }}>
        <DualLine data={cadence} currentLabel="FY26" priorLabel="FY25" label="Monthly meeting cadence" />
      </ChartFigure>,
    );
    const table = await expectFigureTogglesToTable("Cadence");
    expect(within(table).getByText("Jan")).toBeInTheDocument();
    expect(within(table).getByText("6")).toBeInTheDocument();
    expect(within(table).getByText("Feb")).toBeInTheDocument();
  });
});

describe("ChartFigure title bar", () => {
  it("names the figure in a heading inside its caption, a level under the section it sits in unless told otherwise", () => {
    const table = { columns: ["Region", "Meetings"], rows: [["Africa", 12]] };
    const { unmount } = render(
      <ChartFigure title="Regions" description="Meetings by region." table={table}>
        <p>chart</p>
      </ChartFigure>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Regions" }).closest("figcaption")).not.toBeNull();
    expect(screen.getByRole("figure", { name: "Regions" })).toBeInTheDocument();
    unmount();

    render(
      <ChartFigure title="Engagement timeline" level={2} description="Every meeting, by date." table={table}>
        <p>chart</p>
      </ChartFigure>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Engagement timeline" })).toBeInTheDocument();
  });

  it("sets a short note beside the title, and the figure's own controls ahead of Show data", () => {
    render(
      <ChartFigure title="Rows" note="Top 8 of 23" actions={<button type="button">All regions</button>} description="The rows of a custom report." table={{ columns: ["Row", "Meetings"], rows: [["Africa", 12]] }}>
        <p>chart</p>
      </ChartFigure>,
    );
    const caption = within(document.querySelector("figcaption") as HTMLElement);
    expect(caption.getByText("Top 8 of 23")).toBeInTheDocument();
    expect(caption.getAllByRole("button").map((b) => b.textContent)).toEqual(["All regions", "Show data"]);
  });
});

describe("Analytics", () => {
  const analytics: DashboardData["analytics"] = { topics: topicFlows, formats: formatShares, cadence, bureaus: regions };
  const figure = (title: string) => screen.getAllByRole("figure").find((f) => within(f).queryByText(title, { selector: "figcaption *" })) as HTMLElement;

  it("gives every figure its name, under one heading a screen reader can jump to", () => {
    render(<Analytics analytics={analytics} fy={2026} />);
    expect(screen.getByRole("heading", { level: 2, name: "FY26 in figures" })).toBeInTheDocument();
    for (const title of ["Topics", "Formats", "Cadence", "Bureaus & offices"]) expect(figure(title)).toBeDefined();
  });

  it("titles every figure in a slim bar and leaves the straplines out", () => {
    render(<Analytics analytics={analytics} fy={2026} />);
    for (const title of ["Topics", "Formats", "Cadence", "Bureaus & offices"]) expect(screen.getByRole("heading", { level: 3, name: title }).closest("figcaption")).not.toBeNull();
    for (const strapline of ["Who came to discuss what", "How meetings were held", "FY26 vs FY25", "Experts engaged"]) expect(screen.queryByText(strapline)).toBeNull();
  });

  it("says in the topics table which region raised each topic most", async () => {
    render(<Analytics analytics={analytics} fy={2026} />);
    await userEvent.click(within(figure("Topics")).getByRole("button", { name: "Show data" }));
    const rows = within(within(figure("Topics")).getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Spectrum policy9Africa (5)");
    expect(rows[2]).toHaveTextContent("Cybersecurity4Africa (3)");
  });

  it("carries the move since last year into the formats table, signed", async () => {
    render(<Analytics analytics={analytics} fy={2026} />);
    await userEvent.click(within(figure("Formats")).getByRole("button", { name: "Show data" }));
    const table = within(figure("Formats")).getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Change since FY25 (points)" })).toBeInTheDocument();
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("In person1412067%+7");
    expect(rows[2]).toHaveTextContent("Virtual53124%-6");
    expect(rows[3]).toHaveTextContent("Hybrid21710%0");
  });

  it("drops the comparison column when there is no last year to compare with", async () => {
    render(<Analytics analytics={{ ...analytics, formats: formatShares.map((f) => ({ ...f, priorShare: null, deltaPoints: null })) }} fy={2026} />);
    await userEvent.click(within(figure("Formats")).getByRole("button", { name: "Show data" }));
    expect(within(figure("Formats")).queryByRole("columnheader", { name: /change since/i })).toBeNull();
  });

  it("shows a no-data line in each figure of a fiscal year with nothing tallied yet", () => {
    const empty: DashboardData["analytics"] = {
      topics: { topics: [], regions: [], links: [], countries: [], countryLinks: [], otherTopics: 0 },
      formats: [],
      cadence: cadence.map((d) => ({ ...d, current: 0, prior: 0 })),
      bureaus: [],
    };
    render(<Analytics analytics={empty} fy={2026} />);
    expect(screen.getAllByText(/no data yet for fy26/i)).toHaveLength(4);
  });
});
