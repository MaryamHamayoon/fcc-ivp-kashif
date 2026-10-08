// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { DEFAULT_MEETING_COLUMNS } from "@/components/meetings/MeetingsTable";
import { MeetingsToolbar } from "@/components/meetings/MeetingsToolbar";
import type { MeetingsFilterOptions } from "@/components/meetings/options";
import { meetingsViewsStore } from "@/components/meetings/ViewsMenu";
import { applyPatch, type ParamPatch } from "@/lib/url-state";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/meetings",
  useSearchParams: () => new URLSearchParams(),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() } }));

const options: MeetingsFilterOptions = {
  regions: [
    { value: "af", label: "Africa" },
    { value: "eur", label: "Europe" },
  ],
  countries: [
    { value: "CI", label: "Côte d'Ivoire", hint: "Africa" },
    { value: "DE", label: "Germany", hint: "Europe" },
    { value: "GB", label: "United Kingdom", hint: "Europe" },
    { value: "JP", label: "Japan", hint: "Asia-Pacific" },
    { value: "KE", label: "Kenya", hint: "Africa" },
    { value: "MA", label: "Morocco", hint: "Africa" },
    { value: "ZA", label: "South Africa", hint: "Africa" },
  ],
  topics: [{ value: "spectrum-sharing", label: "Spectrum Sharing" }],
  bureaus: [
    { value: "SB", label: "Space Bureau", hint: "SB" },
    { value: "WTB", label: "Wireless Telecommunications Bureau", hint: "WTB" },
  ],
  leads: [{ value: "usr_marcus", label: "Marcus Bell" }],
  fiscalYears: [2027, 2026, 2025, 2024],
  currentFiscalYear: 2026,
  spaceBureauCode: "SB",
  myRegion: { value: "af", label: "Africa" },
};

const counts = { active: 42, upcoming: 18, developing: 12, on_hold: 3, completed: 61, all: 120 };

const setFilter = vi.fn();
const onReset = vi.fn();
const onColumnsChange = vi.fn();

const hrefFor = (params: URLSearchParams) => (patch: ParamPatch) => {
  const query = applyPatch(params, { ...patch, page: null, pageSize: null }).toString();
  return query ? `/meetings?${query}` : "/meetings";
};

function renderToolbar(query = "", over: Partial<ComponentProps<typeof MeetingsToolbar>> = {}) {
  const params = new URLSearchParams(query);
  return render(
    <MeetingsToolbar
      params={params}
      options={options}
      counts={counts}
      layout="table"
      shown={42}
      total={42}
      isLoading={false}
      hrefFor={hrefFor(params)}
      setFilter={setFilter}
      onReset={onReset}
      columns={DEFAULT_MEETING_COLUMNS}
      onColumnsChange={onColumnsChange}
      {...over}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  meetingsViewsStore.reset();
});

describe("MeetingsToolbar", () => {
  it("cuts the list by scope: six tabs, each counted and linked, the current one marked", () => {
    renderToolbar("regionId=af&view=upcoming");
    const scope = within(screen.getByRole("navigation", { name: "Scope" }));
    expect(scope.getAllByRole("link").map((link) => link.textContent)).toEqual(["Active 42", "Upcoming 18", "Developing 12", "On hold 3", "Completed 61", "All 120"]);
    expect(scope.getByRole("link", { name: "Upcoming 18" })).toHaveAttribute("aria-current", "page");
    expect(scope.getByRole("link", { name: "Active 42" })).toHaveAttribute("href", "/meetings?regionId=af");
    expect(scope.getByRole("link", { name: "Completed 61" })).toHaveAttribute("href", "/meetings?regionId=af&view=completed");
  });

  it("drops a status the scope cannot show from its tab, so no tab is a guaranteed empty list", () => {
    renderToolbar("status=closed&status=confirmed&view=completed");
    const scope = within(screen.getByRole("navigation", { name: "Scope" }));
    expect(scope.getByRole("link", { name: "Active 42" })).toHaveAttribute("href", "/meetings?status=confirmed");
    expect(scope.getByRole("link", { name: "On hold 3" })).toHaveAttribute("href", "/meetings?view=on_hold");
    // Nothing is dropped for All, so its href keeps the statuses and the URL's order.
    expect(scope.getByRole("link", { name: "All 120" })).toHaveAttribute("href", "/meetings?status=closed&status=confirmed&view=all");
  });

  it("counts what is on screen against what matched, and switches the layout", () => {
    renderToolbar("", { shown: 50, total: 128 });
    expect(screen.getByRole("status")).toHaveTextContent("50 / 128 meetings");
    const layout = within(screen.getByRole("navigation", { name: "Layout" }));
    expect(layout.getByRole("link", { name: "Table" })).toHaveAttribute("aria-current", "page");
    expect(layout.getByRole("link", { name: "Board" })).toHaveAttribute("href", "/meetings?layout=board");
    expect(screen.getByRole("button", { name: "Display" })).toBeInTheDocument();

    cleanup();
    renderToolbar("layout=board", { layout: "board", isLoading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Loading meetings");
    expect(screen.queryByRole("button", { name: "Display" })).toBeNull();
  });

  it("filters by anything from one menu: it opens on the filters' names, and a few letters offer Kenya wherever it sits", async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const box = await screen.findByPlaceholderText("Filter by anything…");
    // Names first; a filter's values appear once its name is chosen, or as soon as something is typed.
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Status", "Region", "Country", "Fiscal year", "Format", "Lead", "Bureau", "Topic", "Waiting on", "OCH attendingChairman's office joining"]);
    await userEvent.type(box, "ken");
    await userEvent.click(await screen.findByRole("option", { name: /Kenya/ }));
    expect(setFilter).toHaveBeenCalledWith({ countryCode: "KE" });
  });

  it("keeps the menu open for a second status, and widens the scope when a status falls outside it", async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.click(await screen.findByRole("option", { name: "Status" }));
    await userEvent.click(await screen.findByRole("option", { name: "Clearance" }));
    expect(setFilter).toHaveBeenLastCalledWith({ status: ["clearance"] });
    expect(screen.getByPlaceholderText("Search status…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "Completed" }));
    expect(setFilter).toHaveBeenLastCalledWith({ status: ["completed"], view: "all" });
  });

  it("names the options in force, since the highlighted one is not the chosen one", async () => {
    renderToolbar("status=clearance&och=true");
    await userEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    expect(await screen.findByRole("option", { name: "Status, in force: Clearance" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^OCH attending.* in force$/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: /^Status/ }));
    expect(await screen.findByRole("option", { name: "Clearance, in force" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Confirmed" })).toBeInTheDocument();

    // The added words sit outside the option's value, so they do not change what typing matches.
    await userEvent.type(screen.getByPlaceholderText("Search status…"), "in force");
    await waitFor(() => expect(screen.queryByRole("option", { name: /^Clearance/ })).toBeNull());
  });

  it("shows every filter in force as a chip that removes only itself, counts them on the button, and resets", () => {
    renderToolbar("status=clearance,confirmed&regionId=af&countryCode=KE&fy=2026&och=true&waiting=visitor&q=artci");
    const chip = (name: RegExp) => screen.getByRole("button", { name });
    expect(chip(/^Status · Clearance/)).toBeInTheDocument();
    expect(chip(/^Status · Confirmed/)).toBeInTheDocument();
    expect(chip(/^Region · Africa/)).toBeInTheDocument();
    expect(chip(/^Country · Kenya/)).toBeInTheDocument();
    expect(chip(/^Fiscal year · FY26/)).toBeInTheDocument();
    expect(chip(/^Waiting on · Visiting delegation/)).toBeInTheDocument();
    expect(chip(/^OCH attending/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Filter/ })).toHaveTextContent("Filter 7 in force");

    fireEvent.click(chip(/^Status · Clearance/));
    expect(setFilter).toHaveBeenCalledWith({ status: ["confirmed"] });
    fireEvent.click(chip(/^Country · Kenya/));
    expect(setFilter).toHaveBeenCalledWith({ countryCode: null });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalled();
  });

  it("exports what is on screen from the tabs' row, beside Views, and rests when there is nothing to export", async () => {
    const onExport = vi.fn();
    const view = renderToolbar("", { onExport });
    const button = screen.getByRole("button", { name: "Export CSV" });
    // Same row as the Views menu: the page under the bar no longer spends a line on it.
    expect(button.parentElement).toContainElement(screen.getByRole("button", { name: /Views/ }));
    await userEvent.click(button);
    expect(onExport).toHaveBeenCalledTimes(1);
    view.unmount();

    renderToolbar("", { onExport, shown: 0, total: 0 });
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  it("debounces the search into the URL", async () => {
    renderToolbar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search meetings" }), { target: { value: "  artci " } });
    expect(setFilter).not.toHaveBeenCalled();
    await waitFor(() => expect(setFilter).toHaveBeenCalledWith({ q: "artci" }));
  });

  // axe flags a nameless role="dialog" (Base UI's Popover.Popup) as aria-dialog-name; the
  // popover's own label fixes that.
  it("names the Views popover dialog", async () => {
    renderToolbar();
    await userEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(await screen.findByRole("dialog", { name: "Views" })).toBeInTheDocument();
  });

  it("offers the built-in views as links, and saves the current filters under a name", async () => {
    renderToolbar("regionId=af&view=upcoming");
    await userEvent.click(screen.getByRole("button", { name: "Views" }));
    expect(await screen.findByRole("link", { name: /^In clearance/ })).toHaveAttribute("href", "/meetings?status=clearance");
    expect(screen.getByRole("link", { name: /^Completed FY26/ })).toHaveAttribute("href", "/meetings?fy=2026&view=completed");
    expect(screen.getByRole("link", { name: /^My region/ })).toHaveAttribute("href", "/meetings?regionId=af");
    expect(screen.getByRole("link", { name: /^Space Bureau/ })).toHaveAttribute("href", "/meetings?bureauCode=SB");
    expect(screen.getByText("Nothing saved yet. Set the filters you want, then save them here.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save current as…" }));
    await userEvent.type(screen.getByRole("textbox", { name: "View name" }), "Africa, soon");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const saved = await screen.findByRole("link", { name: "Africa, soon" });
    expect(saved).toHaveAttribute("href", "/meetings?regionId=af&view=upcoming");
    expect(saved).toHaveAttribute("aria-current", "true");
    expect(toastSuccess).toHaveBeenCalledWith("View saved", { description: "Africa, soon" });
    expect(JSON.parse(window.localStorage.getItem("ivp.views.meetings") ?? "[]")).toMatchObject([{ name: "Africa, soon", query: "regionId=af&view=upcoming" }]);
    // The field the reader was typing in has gone; focus must not fall to the body with it.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save current as…" }));

    await userEvent.click(screen.getByRole("button", { name: "Delete Africa, soon" }));
    expect(screen.queryByRole("link", { name: "Africa, soon" })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save current as…" }));
  });

  it("leaves the keyboard on the next view when one is deleted from the middle of the list", async () => {
    meetingsViewsStore.save("Kenya, active", "countryCode=KE");
    meetingsViewsStore.save("Clearance, Africa", "regionId=af&status=clearance");
    renderToolbar("regionId=af");

    await userEvent.click(screen.getByRole("button", { name: "Views" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete Clearance, Africa" }));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete Kenya, active" }));
  });
});
