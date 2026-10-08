// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegionSelect } from "@/components/common/RegionSelect";

afterEach(cleanup);

const regions = [
  { name: "Americas", count: 4 },
  { name: "Middle East & North Africa", count: 2 },
];

describe("RegionSelect", () => {
  it("keeps the regions in the order it was given, each with its tally under the way out", async () => {
    render(<RegionSelect regions={regions} allLabel="World" allCount={6} value={null} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Region" }));
    const menu = within(await screen.findByRole("group", { name: "Region" }));
    expect(menu.getAllByRole("button").map((b) => b.textContent)).toEqual(["World6", "Americas4", "Middle East & North Africa2"]);
  });

  it("reads the region in force off its own state, by its short name, and hands back the choice", async () => {
    const onChange = vi.fn();
    render(<RegionSelect regions={regions} allLabel="World" value="Middle East & North Africa" onChange={onChange} align="end" />);
    await userEvent.click(screen.getByRole("button", { name: "Region MENA" }));
    const menu = within(await screen.findByRole("group", { name: "Region" }));
    await userEvent.click(menu.getByRole("button", { name: /^Americas/ }));
    expect(onChange).toHaveBeenCalledWith("Americas");

    await userEvent.click(screen.getByRole("button", { name: "Region MENA" }));
    await userEvent.click(within(await screen.findByRole("group", { name: "Region" })).getByRole("button", { name: "World" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
