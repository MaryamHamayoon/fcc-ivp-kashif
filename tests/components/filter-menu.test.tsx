// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterMenu, type FilterGroup, type FilterToggle } from "@/components/common/toolbar/FilterMenu";

const GROUPS: FilterGroup[] = [
  {
    param: "status",
    label: "Status",
    multi: true,
    options: [
      { value: "requested", label: "Requested" },
      { value: "clearance", label: "Clearance" },
      { value: "confirmed", label: "Confirmed" },
    ],
  },
  {
    param: "regionId",
    label: "Region",
    options: [
      { value: "af", label: "Africa" },
      { value: "eur", label: "Europe" },
    ],
  },
  {
    param: "countryCode",
    label: "Country",
    options: [
      { value: "KE", label: "Kenya", hint: "Africa" },
      { value: "DE", label: "Germany", hint: "Europe" },
    ],
  },
];

const TOGGLES: FilterToggle[] = [{ param: "och", label: "OCH attending", hint: "Chairman's office joining" }];

const onChange = vi.fn();

function open(query = "") {
  render(<FilterMenu groups={GROUPS} toggles={TOGGLES} params={new URLSearchParams(query)} onChange={onChange} />);
  return userEvent.click(screen.getByRole("button", { name: /^Filter/ }));
}

const optionNames = () => screen.getAllByRole("option").map((option) => option.textContent);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FilterMenu", () => {
  // axe flags a nameless role="dialog" (Base UI's Popover.Popup) as aria-dialog-name; the
  // popover's own label fixes that.
  it("names its own popover dialog", async () => {
    await open();
    expect(await screen.findByRole("dialog", { name: "Filter" })).toBeInTheDocument();
  });

  it("opens on the filters' names alone, not on every value they could take", async () => {
    await open();
    expect(await screen.findByRole("option", { name: "Status" })).toBeInTheDocument();
    expect(optionNames()).toEqual(["Status", "Region", "Country", "OCH attendingChairman's office joining"]);
    expect(screen.queryByRole("option", { name: "Clearance" })).toBeNull();
    expect(screen.queryByRole("option", { name: /Kenya/ })).toBeNull();
  });

  it("shows a filter's values once its name is chosen, under a heading that leads back", async () => {
    await open();
    await userEvent.click(await screen.findByRole("option", { name: "Status" }));
    expect(await screen.findByRole("option", { name: "Clearance" })).toBeInTheDocument();
    expect(optionNames()).toEqual(["Requested", "Clearance", "Confirmed"]);
    expect(screen.getByPlaceholderText("Search status…")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to all filters" }));
    expect(await screen.findByRole("option", { name: "Region" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Clearance" })).toBeNull();
  });

  it("keeps a many-valued filter open for a second pick, and closes after a single-valued one", async () => {
    await open();
    await userEvent.click(await screen.findByRole("option", { name: "Status" }));
    await userEvent.click(await screen.findByRole("option", { name: "Clearance" }));
    expect(onChange).toHaveBeenLastCalledWith({ status: ["clearance"] });
    expect(screen.getByRole("option", { name: "Confirmed" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to all filters" }));
    await userEvent.click(await screen.findByRole("option", { name: "Region" }));
    await userEvent.click(await screen.findByRole("option", { name: "Europe" }));
    expect(onChange).toHaveBeenLastCalledWith({ regionId: "eur" });
    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
  });

  it("says beside each name what is in force under it, and lets one press clear that filter", async () => {
    await open("status=clearance&status=confirmed&regionId=af&och=true");
    expect(await screen.findByRole("option", { name: "Status, in force: Clearance, Confirmed" })).toHaveTextContent("Clearance +1");
    expect(screen.getByRole("option", { name: "Region, in force: Africa" })).toHaveTextContent("Africa");
    expect(screen.getByRole("option", { name: "Country" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^OCH attending.* in force$/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: /^Status/ }));
    expect(await screen.findByRole("option", { name: "Clearance, in force" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Requested" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear Status" }));
    expect(onChange).toHaveBeenLastCalledWith({ status: null });
  });

  it("still finds a value by typing from the first screen, whichever filter it sits under", async () => {
    await open();
    await userEvent.type(await screen.findByPlaceholderText("Filter by anything…"), "ken");
    const kenya = await screen.findByRole("option", { name: /Kenya/ });
    expect(screen.queryByRole("option", { name: "Germany" })).toBeNull();
    await userEvent.click(kenya);
    expect(onChange).toHaveBeenCalledWith({ countryCode: "KE" });
  });

  it("searches only the chosen filter once inside it, and steps back on Backspace in an empty box", async () => {
    await open();
    await userEvent.click(await screen.findByRole("option", { name: "Country" }));
    const box = await screen.findByPlaceholderText("Search country…");
    await userEvent.type(box, "afr");
    await waitFor(() => expect(optionNames()).toEqual(["KenyaAfrica"]));

    await userEvent.clear(box);
    await userEvent.type(box, "{Backspace}");
    expect(await screen.findByRole("option", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter by anything…")).toBeInTheDocument();
  });

  it("flips a yes-or-no filter from the first screen and stays open", async () => {
    await open();
    await userEvent.click(await screen.findByRole("option", { name: /^OCH attending/ }));
    expect(onChange).toHaveBeenLastCalledWith({ och: "true" });
    expect(screen.getByRole("option", { name: "Status" })).toBeInTheDocument();
  });

  it("starts again from the names each time it is opened", async () => {
    await open();
    await userEvent.click(await screen.findByRole("option", { name: "Status" }));
    await screen.findByRole("option", { name: "Clearance" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    const list = await screen.findByRole("listbox");
    expect(within(list).getByRole("option", { name: "Status" })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: "Clearance" })).toBeNull();
  });
});
