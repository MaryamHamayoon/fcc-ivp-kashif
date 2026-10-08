// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapControls, reachHref } from "@/components/dashboard/map/MapControls";

afterEach(cleanup);

const base = {
  range: "next30" as const,
  onRange: vi.fn(),
  view: "map" as const,
  onView: vi.fn(),
  // As the service hands them over: OIA's own order, which is not the order a reader scans a map in.
  regions: [
    { name: "Africa", countries: 1 },
    { name: "Americas", countries: 2 },
    { name: "Middle East & North Africa", countries: 2 },
  ],
  worldCount: 5,
  region: null,
  onRegion: vi.fn(),
};

describe("MapControls", () => {
  it("is four controls and no more: the region, the range, the view and the full screen", () => {
    render(<MapControls {...base} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["Region", "Next 30 days", "This year", "List"]);
    expect(screen.getByRole("link", { name: "Full screen" })).toHaveAttribute("href", "/reach?range=next30");
  });

  it("counts the next 30 days until asked for this year, each a toggle with a name that never changes", () => {
    const onRange = vi.fn();
    render(<MapControls {...base} onRange={onRange} />);
    const range = within(screen.getByRole("group", { name: "Range" }));
    expect(range.getByRole("button", { name: "Next 30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(range.getByRole("button", { name: "This year" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(range.getByRole("button", { name: "This year" }));
    expect(onRange).toHaveBeenCalledWith("this");
  });

  it("switches between the map and its list with a button that names where it goes", () => {
    const onView = vi.fn();
    const { rerender } = render(<MapControls {...base} onView={onView} />);
    const toList = screen.getByRole("button", { name: "List" });
    expect(toList).not.toHaveAttribute("aria-pressed");
    fireEvent.click(toList);
    expect(onView).toHaveBeenCalledWith("list");

    rerender(<MapControls {...base} view="list" onView={onView} />);
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(onView).toHaveBeenCalledWith("map");

    // No WebGL: the list is all there is, so there is nothing to switch.
    rerender(<MapControls {...base} view={null} onView={onView} />);
    expect(screen.queryByRole("button", { name: /^(List|Map)$/ })).toBeNull();
  });

  it("focuses the map on a region from one menu: the world first, then each region with its countries", async () => {
    const onRegion = vi.fn();
    render(<MapControls {...base} onRegion={onRegion} />);
    await userEvent.click(screen.getByRole("button", { name: "Region" }));
    const menu = within(await screen.findByRole("group", { name: "Region" }));
    expect(menu.getAllByRole("button").map((b) => b.textContent)).toEqual(["World5", "Americas2", "Africa1", "Middle East & North Africa2"]);
    expect(menu.getByRole("button", { name: /^World/ })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(menu.getByRole("button", { name: /^Africa/ }));
    expect(onRegion).toHaveBeenCalledWith("Africa");
  });

  it("says on the button which region is in force, by its short name, and World lets go of it", async () => {
    const onRegion = vi.fn();
    render(<MapControls {...base} region="Middle East & North Africa" onRegion={onRegion} />);
    await userEvent.click(screen.getByRole("button", { name: "Region MENA" }));
    await userEvent.click(await screen.findByRole("button", { name: /^World/ }));
    expect(onRegion).toHaveBeenCalledWith(null);
  });

  it("opens the full screen on the card's own range and region", () => {
    render(<MapControls {...base} range="this" region="Middle East & North Africa" />);
    expect(screen.getByRole("link", { name: "Full screen" })).toHaveAttribute("href", "/reach?range=this&region=Middle+East+%26+North+Africa");
  });
});

describe("reachHref", () => {
  it("names a country first, then the range, then the region", () => {
    expect(reachHref({ range: "next30", country: "JP" })).toBe("/reach?country=JP&range=next30");
    expect(reachHref({ range: "this", region: "Europe" })).toBe("/reach?range=this&region=Europe");
    expect(reachHref({ range: "this" })).toBe("/reach?range=this");
  });
});
