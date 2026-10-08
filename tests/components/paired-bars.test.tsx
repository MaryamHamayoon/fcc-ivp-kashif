// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { PairedBars } from "@/components/charts/PairedBars";

afterEach(cleanup);

const data = [
  { key: "foreign_gov", label: "Foreign government", planned: 21, actual: 13 },
  { key: "fcc", label: "FCC", planned: 4, actual: 2 },
  { key: "industry", label: "Industry", planned: 1, actual: 0 },
];

describe("PairedBars", () => {
  it("speaks each row as one sentence with both numbers, under a legend that names the pair", () => {
    render(<PairedBars data={data} label="Participants by category" />);
    const group = screen.getByRole("group", { name: "Participants by category" });
    const rows = within(group).getAllByRole("img");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual(["Foreign government: 21 planned, 13 actual", "FCC: 4 planned, 2 actual", "Industry: 1 planned, 0 actual"]);
    const legend = within(group).getByRole("list", { name: "Legend" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Planned", "Actual"]);
  });

  it("takes other words for the pair", () => {
    render(<PairedBars data={data.slice(0, 1)} label="Attendance" plannedLabel="Expected" actualLabel="Came" />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Foreign government: 21 expected, 13 came");
    expect(screen.getByText("Expected")).toBeInTheDocument();
    expect(screen.getByText("Came")).toBeInTheDocument();
  });

  it("scales every bar to the largest number on either side", () => {
    const { container } = render(<PairedBars data={data} label="Participants by category" />);
    const widths = [...container.querySelectorAll<HTMLElement>("[style*='width']")].map((el) => el.style.width);
    expect(widths[0]).toBe("100%");
    expect(widths[1]).toBe(`${(13 / 21) * 100}%`);
    expect(widths.at(-1)).toBe("0%");
  });
});
