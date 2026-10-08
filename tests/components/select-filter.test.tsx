// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type FilterOption, SelectFilter } from "@/components/common/SelectFilter";

afterEach(cleanup);

const options: FilterOption[] = [
  { value: "Africa", label: "Africa" },
  { value: "Europe", label: "Europe" },
  { value: "Asia-Pacific", label: "Asia-Pacific" },
];

/** Renders the non-searchable filter, opens it, and hands back its rows in DOM order: World, then each option. */
async function openFilter(query = "") {
  const setFilter = vi.fn();
  render(<SelectFilter label="Region" param="region" allLabel="World" options={options} params={new URLSearchParams(query)} setFilter={setFilter} />);
  const current = new URLSearchParams(query).get("region");
  await userEvent.click(screen.getByRole("button", { name: current ? `Region ${current}` : "Region" }));
  const group = await screen.findByRole("group", { name: "Region" });
  return { setFilter, rows: within(group).getAllByRole("button") };
}

describe("SelectFilter — non-searchable option list", () => {
  it("moves focus down and up with the arrow keys, clamped at both ends, without wrapping", async () => {
    const { rows } = await openFilter();
    expect(rows.map((row) => row.textContent)).toEqual(["World", "Africa", "Europe", "Asia-Pacific"]);

    rows[0]?.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(rows[0]).toHaveFocus(); // already first: stays put, does not wrap to the last row

    await userEvent.keyboard("{ArrowDown}");
    expect(rows[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(rows[2]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(rows[3]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(rows[3]).toHaveFocus(); // already last: stays put, does not wrap to the first row

    await userEvent.keyboard("{ArrowUp}");
    expect(rows[2]).toHaveFocus();
  });

  it("jumps to the first and last row on Home and End", async () => {
    const { rows } = await openFilter();
    rows[2]?.focus();
    await userEvent.keyboard("{End}");
    expect(rows[3]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(rows[0]).toHaveFocus();
  });

  it("chooses the focused row on Enter, natively", async () => {
    const { rows, setFilter } = await openFilter();
    rows[2]?.focus();
    await userEvent.keyboard("{Enter}");
    expect(setFilter).toHaveBeenCalledWith({ region: "Europe" });
  });

  it("opens with focus already on the chosen row, not always the first", async () => {
    const { rows } = await openFilter("region=Africa");
    await waitFor(() => expect(rows[1]).toHaveFocus());
  });

  // axe flags a nameless role="dialog" (Base UI's Popover.Popup) as aria-dialog-name; the
  // popover's own label — the same one the group inside it already carries — fixes that.
  it("names its own popover dialog, not just the group of rows inside it", async () => {
    await openFilter();
    expect(screen.getByRole("dialog", { name: "Region" })).toBeInTheDocument();
  });
});
