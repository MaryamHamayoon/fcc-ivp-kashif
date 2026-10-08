// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopicsFigure } from "@/components/dashboard/TopicsFigure";
import type { TopicFlows } from "@/lib/domain/insights";

afterEach(cleanup);

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

/** The Region menu, which Radix hangs off the end of the document rather than inside the figure. */
const openRegionMenu = async (name = "Region") => {
  await userEvent.click(screen.getByRole("button", { name }));
  return within(await screen.findByRole("group", { name: "Region" }));
};

describe("TopicsFigure", () => {
  it("offers the regions in the chart's own order, under a way back to all of them", async () => {
    render(<TopicsFigure flows={flows} current="FY26" />);
    const menu = await openRegionMenu();
    expect(menu.getAllByRole("button").map((b) => b.textContent)).toEqual(["All regions", "Asia-Pacific4", "Africa3"]);
  });

  it("drills into the region chosen in the menu, and comes back out the same way", async () => {
    render(<TopicsFigure flows={flows} current="FY26" />);
    const menu = await openRegionMenu();
    await userEvent.click(menu.getByRole("button", { name: /^Asia-Pacific/ }));
    expect(screen.getByRole("link", { name: /^Japan/ })).toHaveAttribute("href", "/countries/JP");
    expect(screen.getByRole("group", { name: "Topics raised in FY26 by Asia-Pacific, by country" })).toBeInTheDocument();

    const again = await openRegionMenu("Region Asia-Pacific");
    await userEvent.click(again.getByRole("button", { name: "All regions" }));
    expect(screen.queryByRole("link", { name: /^Japan/ })).toBeNull();
    expect(screen.getByRole("group", { name: "Topics raised in FY26, by region" })).toBeInTheDocument();
  });

  it("gets the same view from pressing the region in the chart, and says so on the menu button", () => {
    render(<TopicsFigure flows={flows} current="FY26" />);
    fireEvent.click(screen.getByRole("button", { name: /^Africa/ }));
    expect(screen.getByRole("button", { name: "Region Africa" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Kenya/ })).toHaveAttribute("href", "/countries/KE");
  });

  it("carries the drill into the numbers behind the chart", async () => {
    render(<TopicsFigure flows={flows} current="FY26" />);
    fireEvent.click(screen.getByRole("button", { name: /^Asia-Pacific/ }));
    await userEvent.click(screen.getByRole("button", { name: "Show data" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Spectrum valuation3Japan (2)");
    expect(rows[2]).toHaveTextContent("Network resilience2");
  });

  it("names itself in a figure a screen reader can find, at either level", () => {
    render(<TopicsFigure flows={flows} current="FY26" />);
    expect(screen.getByRole("figure", { name: "Topics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Topics" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Africa/ }));
    expect(screen.getByRole("figure", { name: "Topics" })).toBeInTheDocument();
  });

  it("says so when the year has nothing tallied yet", () => {
    render(<TopicsFigure flows={{ topics: [], regions: [], links: [], countries: [], countryLinks: [], otherTopics: 0 }} current="FY26" />);
    expect(screen.getByText("No data yet for FY26.")).toBeInTheDocument();
  });
});
