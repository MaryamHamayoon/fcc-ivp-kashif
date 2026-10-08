// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { NO_MATCHES, ReachSearch, type ReachSearchHandle } from "@/components/reach/ReachSearch";
import { searchEntries, type SearchEntry } from "@/lib/domain/reach";
import { makeReachData, makeReachMeeting } from "@/tests/fixtures/reach";

afterEach(cleanup);

const NAME = "Find a country or organization";
const combobox = () => screen.getByRole("combobox", { name: NAME });

// Mirrors the org names already used in tests/domain/reach-tour.test.ts's own search fixture, extended to
// all six countries the fixture knows about.
const ENTRIES = searchEntries(
  makeReachData([
    makeReachMeeting({ countries: ["JP"] }), // keeps the default organization: Ministry of Internal Affairs and Communications
    makeReachMeeting({ countries: ["KE"], orgName: "Communications Authority of Kenya" }),
    makeReachMeeting({ countries: ["BR"], orgName: "National Telecommunications Agency" }),
    makeReachMeeting({ countries: ["DE"], orgName: "Federal Network Agency" }),
    makeReachMeeting({ countries: ["GB"], orgName: "Ofcom" }),
    makeReachMeeting({ countries: ["FJ"], orgName: "Online Safety Commission" }),
  ]),
);

// A small, hand-built set (as tests/domain/reach-tour.test.ts does for its own ">8" case) whose
// matches for "a" sort predictably by the earliest occurrence of "a" in each label: Japan (1),
// Brazil (2), Kenya (4).
const japanEntry: SearchEntry = { kind: "country", cca2: "JP", label: "Japan", hint: "Asia-Pacific" };
const kenyaEntry: SearchEntry = { kind: "country", cca2: "KE", label: "Kenya", hint: "Africa" };
const brazilEntry: SearchEntry = { kind: "country", cca2: "BR", label: "Brazil", hint: "Americas" };
const arrowEntries: SearchEntry[] = [japanEntry, kenyaEntry, brazilEntry];

describe("ReachSearch", () => {
  it("names the field and gives it the same words as its placeholder, with its shortcut; nothing shows before there is a query", () => {
    render(<ReachSearch entries={ENTRIES} onChoose={vi.fn()} />);
    const input = combobox();
    expect(input).toHaveAttribute("placeholder", NAME);
    expect(input).toHaveAttribute("aria-keyshortcuts", "Control+K");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it('lists Japan first, with its region, for "ja"', () => {
    render(<ReachSearch entries={ENTRIES} onChoose={vi.fn()} />);
    fireEvent.change(combobox(), { target: { value: "ja" } });
    expect(combobox()).toHaveAttribute("aria-expanded", "true");
    expect(combobox()).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Japan");
    expect(options[0]).toHaveTextContent("Asia-Pacific");
  });

  it("lists an organization with its country, and marks it as one — unlike a country", () => {
    render(<ReachSearch entries={ENTRIES} onChoose={vi.fn()} />);
    const input = combobox();

    fireEvent.change(input, { target: { value: "ministry" } });
    const org = screen.getByRole("option");
    expect(org).toHaveTextContent("Ministry of Internal Affairs and Communications");
    expect(org).toHaveTextContent("Japan");
    expect(within(org).getByText(", organization")).toBeInTheDocument();
    expect(org.querySelectorAll("svg")).toHaveLength(2); // the flag, and the organization mark

    fireEvent.change(input, { target: { value: "ja" } });
    const country = screen.getByRole("option");
    expect(within(country).queryByText(", organization")).toBeNull();
    expect(country.querySelectorAll("svg")).toHaveLength(1); // the flag alone
  });

  it("moves the active option with the arrows, wrapping at both ends, tracked by aria-activedescendant; Enter chooses the active one or the first", () => {
    const onChoose = vi.fn();
    render(<ReachSearch entries={arrowEntries} onChoose={onChoose} />);
    const input = combobox();
    fireEvent.change(input, { target: { value: "a" } });
    expect(input).not.toHaveAttribute("aria-activedescendant");

    const [japan, brazil, kenya] = screen.getAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowUp" }); // none active: wraps to the last
    expect(input).toHaveAttribute("aria-activedescendant", kenya?.id);
    fireEvent.keyDown(input, { key: "ArrowDown" }); // wraps back to the first
    expect(input).toHaveAttribute("aria-activedescendant", japan?.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", brazil?.id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(brazilEntry);
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" }); // none active this time: chooses the first
    expect(onChoose).toHaveBeenCalledTimes(2);
    expect(onChoose).toHaveBeenLastCalledWith(japanEntry);
  });

  it("closes the list on the first Escape and clears the field on the second, preventing default each time", () => {
    render(<ReachSearch entries={ENTRIES} onChoose={vi.fn()} />);
    const input = combobox();
    fireEvent.change(input, { target: { value: "ja" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    const first = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(input, first);
    expect(first.defaultPrevented).toBe(true);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input).toHaveValue("ja");

    const second = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(input, second);
    expect(second.defaultPrevented).toBe(true);
    expect(input).toHaveValue("");
  });

  it("says so in its status line, which was there all along, instead of a listbox when nothing matches", () => {
    render(<ReachSearch entries={ENTRIES} onChoose={vi.fn()} />);
    const status = screen.getByRole("status");
    fireEvent.change(combobox(), { target: { value: "zzz" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
    expect(combobox()).not.toHaveAttribute("aria-controls");
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent(NO_MATCHES);
  });

  it("chooses an option on a mouse click, preventing default on mousedown so the field never blurs", () => {
    const onChoose = vi.fn();
    render(<ReachSearch entries={ENTRIES} onChoose={onChoose} />);
    const input = combobox();
    input.focus();
    fireEvent.change(input, { target: { value: "ja" } });
    const option = screen.getByRole("option");

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    fireEvent(option, mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ kind: "country", cca2: "JP", label: "Japan" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("puts focus in the input through the handle", () => {
    const ref = createRef<ReachSearchHandle>();
    render(<ReachSearch ref={ref} entries={ENTRIES} onChoose={vi.fn()} />);
    const input = combobox();
    expect(input).not.toHaveFocus();
    ref.current?.focus();
    expect(input).toHaveFocus();
  });

  it("shows at most eight matches", () => {
    const crowd: SearchEntry[] = Array.from({ length: 12 }, (_, i) => ({ kind: "organization", cca2: "JP", label: `Office ${i}`, hint: "Japan" }));
    render(<ReachSearch entries={crowd} onChoose={vi.fn()} />);
    fireEvent.change(combobox(), { target: { value: "office" } });
    expect(screen.getAllByRole("option")).toHaveLength(8);
  });
});
