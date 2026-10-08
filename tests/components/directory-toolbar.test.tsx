// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectoryToolbar } from "@/components/directory/DirectoryToolbar";

const bureaus = [
  { code: "CGB", name: "Consumer and Governmental Affairs Bureau", staff: 12 },
  { code: "SB", name: "Space Bureau", staff: 8 },
  { code: "WTB", name: "Wireless Telecommunications Bureau", staff: 21 },
  // Nobody on the roster: choosing it could only ever show an empty list.
  { code: "OMR", name: "Office of Media Relations", staff: 0 },
];

const counts = { experts: 214, organizations: 61 };
const setFilter = vi.fn();

function renderToolbar(tab: "experts" | "organizations", query = "", shown = 25, total = 214) {
  return render(<DirectoryToolbar tab={tab} params={new URLSearchParams(query)} setFilter={setFilter} counts={counts} bureaus={bureaus} shown={shown} total={total} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DirectoryToolbar", () => {
  it("cuts the directory into its two lists, each counted, each starting fresh", () => {
    renderToolbar("experts", "bureauCode=SB&q=lind");
    const tabs = within(screen.getByRole("navigation", { name: "Directory" }));
    const experts = tabs.getByRole("link", { name: "FCC experts & POCs 214" });
    expect(experts).toHaveAttribute("href", "/directory");
    expect(experts).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "Organizations & contacts 61" })).toHaveAttribute("href", "/directory?tab=organizations");
  });

  it("offers the bureaus as one dropdown — code, name, headcount — instead of a strip of tabs", async () => {
    renderToolbar("experts");
    expect(screen.queryByRole("navigation", { name: "Bureau" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Bureau" }));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options).toEqual(["All bureaus", "CGBConsumer and Governmental Affairs Bureau12", "SBSpace Bureau8", "WTBWireless Telecommunications Bureau21"]);

    await userEvent.click(screen.getByRole("option", { name: /Space Bureau/ }));
    expect(setFilter).toHaveBeenCalledWith({ bureauCode: "SB" });
  });

  it("shows the chosen bureau by its code, and finds a bureau by code or by name", async () => {
    renderToolbar("experts", "bureauCode=WTB");
    await userEvent.click(screen.getByRole("button", { name: "Bureau WTB" }));
    await userEvent.type(await screen.findByPlaceholderText("Search bureau…"), "cgb");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["CGBConsumer and Governmental Affairs Bureau12"]);

    await userEvent.clear(screen.getByPlaceholderText("Search bureau…"));
    await userEvent.type(screen.getByPlaceholderText("Search bureau…"), "space");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["SBSpace Bureau8"]);
  });

  it("sorts by the most engaged unless asked for the alphabet", async () => {
    renderToolbar("experts");
    await userEvent.click(screen.getByRole("button", { name: "Sort" }));
    await userEvent.click(await screen.findByRole("button", { name: "Name, A to Z" }));
    expect(setFilter).toHaveBeenCalledWith({ sort: "name" });
  });

  it("says how many are on screen out of how many matched", () => {
    renderToolbar("experts", "", 25, 86);
    expect(screen.getByRole("status")).toHaveTextContent("25 / 86 experts");
  });

  it("searches the organizations by their own terms, without the experts' filters", () => {
    renderToolbar("organizations", "tab=organizations", 25, 61);
    expect(screen.getByRole("searchbox", { name: "Search organizations" })).toHaveAttribute("placeholder", "Search by organization or country");
    expect(screen.queryByRole("button", { name: "Bureau" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sort" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("25 / 61 organizations");
    expect(screen.getByRole("link", { name: "Organizations & contacts 61" })).toHaveAttribute("aria-current", "page");
  });

  it("searches the experts by name, title or email", () => {
    renderToolbar("experts");
    expect(screen.getByRole("searchbox", { name: "Search experts" })).toHaveAttribute("placeholder", "Search by name, title or email");
  });
});
