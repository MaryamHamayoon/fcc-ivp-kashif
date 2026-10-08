// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomReport } from "@/components/reports/CustomReport";

const setFilter = vi.fn();
const data = [
  { key: "spectrum-sharing", label: "Spectrum Sharing", count: 3 },
  { key: "broadband-mapping", label: "Broadband Mapping", count: 2 },
  { key: "spectrum-auctions", label: "Spectrum Auctions", count: 0 },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CustomReport", () => {
  it("names the figure and the table after the choice, and draws one bar per row", () => {
    render(<CustomReport custom={{ rows: "topic", measure: "meetings", data }} fy={2026} params={new URLSearchParams()} setFilter={setFilter} csvHref="/api/reports/export?as=csv&report=custom" />);
    expect(screen.getByRole("figure", { name: "Meetings by topic" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    const table = screen.getByRole("table", { name: "Meetings by topic in FY26" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Topic", "Meetings"]);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });

  it("writes the rows and the measure to the URL, and clears back to the defaults", async () => {
    render(<CustomReport custom={{ rows: "topic", measure: "meetings", data }} fy={2026} params={new URLSearchParams("rows=country")} setFilter={setFilter} csvHref="/api/reports/export?as=csv&report=custom" />);

    await userEvent.click(screen.getByRole("button", { name: /^Rows/ }));
    await userEvent.click(screen.getByRole("button", { name: "Fiscal month" }));
    expect(setFilter).toHaveBeenCalledWith({ rows: "month" });

    await userEvent.click(screen.getByRole("button", { name: /^Measure/ }));
    await userEvent.click(screen.getByRole("button", { name: "Participants (actual)" }));
    expect(setFilter).toHaveBeenCalledWith({ measure: "participantsActual" });

    await userEvent.click(screen.getByRole("button", { name: /^Rows/ }));
    await userEvent.click(screen.getByRole("button", { name: "Topic" }));
    expect(setFilter).toHaveBeenLastCalledWith({ rows: null });
  });

  it("says when there is nothing to count instead of drawing empty bars", () => {
    render(<CustomReport custom={{ rows: "region", measure: "countries", data: data.map((d) => ({ ...d, count: 0 })) }} fy={2026} params={new URLSearchParams()} setFilter={setFilter} csvHref="/api/reports/export?as=csv&report=custom" />);
    expect(screen.getByText("Nothing to count for FY26.")).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
