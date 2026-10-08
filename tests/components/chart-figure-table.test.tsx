// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartFigure } from "@/components/charts/ChartFigure";
import { expectNoViolations } from "@/tests/a11y/axe";

afterEach(cleanup);

const table = {
  columns: ["Region", "Meetings"],
  rows: [
    ["Africa", 12],
    ["Europe", 8],
  ],
};

/** Opens a figure's "Show data" panel and hands back its container for the checks below. */
async function openTable(title: string) {
  const utils = render(
    <ChartFigure title={title} description="Meetings by region." table={table}>
      <p>chart</p>
    </ChartFigure>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Show data" }));
  return utils;
}

describe("ChartFigure table panel — reachable by keyboard when it scrolls sideways", () => {
  it("(a) names the scrolling region after the chart and puts it in the tab order", async () => {
    await openTable("Formats");
    const region = screen.getByRole("region", { name: "Formats: the numbers behind the chart" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toContainElement(screen.getByRole("table"));
  });

  it("(b) scrolls in exactly one place: the table is never left nested in the Table primitive's own scroller", async () => {
    await openTable("Bureaus & offices");
    const tableEl = screen.getByRole("table");
    expect(tableEl.closest('[data-slot="table-container"]')).toBeNull();
  });

  it("(c) keeps the toggle's aria-controls pointed at an element that contains the table", async () => {
    const { getByRole } = await openTable("Topics");
    const toggle = getByRole("button", { name: "Hide data" });
    const controlsId = toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const panel = document.getElementById(controlsId as string);
    expect(panel).not.toBeNull();
    expect(panel as HTMLElement).toContainElement(screen.getByRole("table"));
  });

  it("(d) has no axe violations with the data table open", async () => {
    const { container } = await openTable("Regions");
    await expectNoViolations(container);
  });
});
