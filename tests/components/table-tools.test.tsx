// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setDensity, useDensity } from "@/components/meetings/density";
import { DEFAULT_MEETING_COLUMNS } from "@/components/meetings/MeetingsTable";
import { TableTools } from "@/components/meetings/TableTools";

afterEach(() => {
  cleanup();
  setDensity("comfortable");
});

function Probe() {
  return <output data-testid="density">{useDensity()}</output>;
}

describe("TableTools", () => {
  it("opens as two named groups and toggles the row density in place", async () => {
    const onColumnsChange = vi.fn();
    render(
      <>
        <TableTools columns={DEFAULT_MEETING_COLUMNS} onColumnsChange={onColumnsChange} />
        <Probe />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Display" }));
    expect(await screen.findByRole("group", { name: "Rows" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Columns" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Compact rows" }));
    expect(screen.getByTestId("density")).toHaveTextContent("compact");
    // The menu stays open, so a second change does not mean a second trip.
    expect(screen.getByRole("menuitemcheckbox", { name: "Compact rows" })).toBeChecked();
  });

  it("locks the columns the list cannot do without and drops any other", async () => {
    const onColumnsChange = vi.fn();
    render(<TableTools columns={DEFAULT_MEETING_COLUMNS} onColumnsChange={onColumnsChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Display" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Date" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Country / Org" })).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Updated" }));
    expect(onColumnsChange).toHaveBeenCalledWith(DEFAULT_MEETING_COLUMNS.filter((id) => id !== "updated"));
  });
});
