// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FiltersPanel, type FiltersPanelProps } from "@/components/reach/FiltersPanel";
import { lens, NO_FILTERS, type ReachFilters } from "@/lib/domain/reach";
import { rangeSpan } from "@/lib/domain/reach-time";
import { MEETING_STATUSES, STATUS_LABELS } from "@/lib/domain/types";
import { expectNoViolations } from "@/tests/a11y/axe";
import { makeReachData, makeReachMeeting, REACH_BUREAUS, REACH_NOW } from "@/tests/fixtures/reach";

/* --------------------------------- fixtures ------------------------------- */

// REACH_NOW is Monday, September 28, 2026, noon in Washington; the window is this calendar year.
const at = (iso: string) => new Date(iso);
const DATA = makeReachData([
  makeReachMeeting({ participants: 8 }), // Japan, confirmed, in person, Oct 6
  makeReachMeeting({
    format: "hybrid",
    countries: ["KE"],
    region: "Africa",
    start: at("2026-10-15T14:00:00Z"),
    participants: 14,
    topics: ["Spectrum policy", "Cybersecurity"],
    bureaus: ["WTB", "OET"],
    waiting: { who: "visitor", label: "Delegation", businessDays: 3, band: "ok" },
  }),
  makeReachMeeting({ status: "requested", format: "virtual", countries: ["BR"], region: "Americas", start: at("2026-03-10T14:00:00Z"), participants: 1180, topics: ["Broadband mapping"], bureaus: ["OET"], och: true }),
  makeReachMeeting({
    status: "developing",
    countries: ["DE", "GB"],
    region: "Europe",
    start: at("2026-11-17T15:00:00Z"),
    participants: 11,
    topics: ["Spectrum policy", "Satellite licensing"],
    bureaus: ["SB", "WTB"],
    highPriority: true,
    waiting: { who: "expert", label: "FCC expert", businessDays: 6, band: "warn" },
  }),
  makeReachMeeting({ status: "cancelled", format: "virtual", countries: ["FJ"], region: "Asia-Pacific", start: at("2026-05-05T22:00:00Z"), participants: 4, topics: ["Emergency alerting"], bureaus: [] }),
  // Neither of these is counted: one was last year, the other has no date yet.
  makeReachMeeting({ status: "completed", countries: ["GB"], region: "Europe", start: at("2025-06-02T14:00:00Z") }),
  makeReachMeeting({ status: "requested", countries: ["KE"], region: "Africa", start: null }),
]);
const WINDOW = rangeSpan("this", REACH_NOW);

const filtered = (over: Partial<ReachFilters>): ReachFilters => ({ ...NO_FILTERS, ...over });

/* ---------------------------------- setup --------------------------------- */

/** The panel as the screen hands it over: the window's list through the same filters it shows. */
function renderPanel(filters: ReachFilters = NO_FILTERS) {
  const onChange = vi.fn();
  const onReset = vi.fn();
  const props: FiltersPanelProps = { titleId: "filters-title", meetings: DATA.meetings, window: WINDOW, list: lens(DATA.meetings, filters, WINDOW), filters, bureaus: REACH_BUREAUS, onChange, onReset };
  const view = render(<FiltersPanel {...props} />);
  /** The panel after the screen takes a change on. */
  const refilter = (next: ReachFilters) => view.rerender(<FiltersPanel {...props} filters={next} list={lens(DATA.meetings, next, WINDOW)} />);
  return { ...view, onChange, onReset, refilter };
}

/** The text an ARIA reference points at. */
const referenced = (el: Element, attr: "aria-labelledby" | "aria-describedby") => document.getElementById(el.getAttribute(attr) ?? "")?.textContent;

/** A facet group's rows, each as the name and count its checkbox is labelled and described by: "Confirmed: 2 meetings". */
const rowsOf = (group: string) =>
  within(screen.getByRole("group", { name: group }))
    .getAllByRole("checkbox")
    .map((box) => `${referenced(box, "aria-labelledby")}: ${referenced(box, "aria-describedby")}`);

/** A row's bar, read off the scale its fill is drawn at. */
const barOf = (name: string) => screen.getByRole("checkbox", { name }).closest("label")?.querySelector<HTMLElement>("[style*='scale']")?.style.transform;

/** The four figures as term and number, in the order they read. */
const figuresShown = () => screen.getAllByRole("term").map((term) => [term.textContent, term.nextElementSibling?.textContent]);

/** Whether anything between an element and its group dims it: muted ink or a lowered opacity. */
function dimmed(el: Element): boolean {
  for (let node: Element | null = el; node && node.tagName !== "FIELDSET"; node = node.parentElement) if (/\b(text-muted-foreground|opacity-\d+)/.test(node.className)) return true;
  return false;
}

/** The rows of the menu open under a trigger: a searchable menu's options, or a short menu's buttons. */
const menuRows = async (label: string, kind: "option" | "button") => within(await screen.findByRole("dialog", { name: label })).getAllByRole(kind).map((row) => row.textContent);

afterEach(cleanup);

/* ---------------------------------- tests --------------------------------- */

describe("FiltersPanel", () => {
  it("heads the panel with its h2, which the screen's aside is labelled by, keeps the four figures in view and scrolls the filters below them", () => {
    renderPanel();
    const heading = screen.getByRole("heading", { level: 2, name: "Filters" });
    expect(heading).toHaveAttribute("id", "filters-title");
    const figures = heading.closest("header")?.nextElementSibling;
    expect(figures?.tagName).toBe("DL");
    // The scroller holds sr-only text, so it must be positioned or it inflates the page's height.
    expect(figures?.nextElementSibling).toHaveClass("relative", "min-h-0", "flex-1", "overflow-y-auto");
  });

  it("counts the list it is given in four figures: meetings, countries, participants and meetings waiting on someone", () => {
    const { refilter } = renderPanel();
    expect(figuresShown()).toEqual([
      ["Meetings", "5"],
      ["Countries", "6"],
      ["Participants", "1,217"],
      ["Waiting", "2"],
    ]);
    refilter(filtered({ formats: ["virtual"] }));
    expect(figuresShown()).toEqual([
      ["Meetings", "2"],
      ["Countries", "2"],
      ["Participants", "1,184"],
      ["Waiting", "0"],
    ]);
  });

  it("lists the eight statuses in the lifecycle's order, each named by its status and counted in the window", () => {
    renderPanel();
    const status = within(screen.getByRole("group", { name: "Status" }));
    expect(status.getAllByRole("checkbox")).toEqual(MEETING_STATUSES.map((s) => status.getByRole("checkbox", { name: STATUS_LABELS[s] })));
    expect(rowsOf("Status")).toEqual([
      "Requested: 1 meeting",
      "Developing: 1 meeting",
      "Clearance: 0 meetings",
      "Confirmed: 2 meetings",
      "Completed: 0 meetings",
      "Closed: 0 meetings",
      "On Hold: 0 meetings",
      "Cancelled: 1 meeting",
    ]);
    expect(screen.getByRole("checkbox", { name: "Confirmed" })).toHaveAccessibleDescription("2 meetings");
    expect(screen.getByRole("checkbox", { name: "Confirmed" })).not.toBeChecked();
  });

  it("counts each group under every filter but its own, so a reader sees what each choice would give", () => {
    const { refilter } = renderPanel(filtered({ statuses: ["confirmed"] }));
    expect(screen.getByRole("checkbox", { name: "Confirmed" })).toBeChecked();
    // The status filter leaves the status counts alone, and recounts the formats.
    expect(rowsOf("Status")).toEqual(["Requested: 1 meeting", "Developing: 1 meeting", "Clearance: 0 meetings", "Confirmed: 2 meetings", "Completed: 0 meetings", "Closed: 0 meetings", "On Hold: 0 meetings", "Cancelled: 1 meeting"]);
    expect(rowsOf("Format")).toEqual(["In person: 1 meeting", "Hybrid: 1 meeting", "Virtual: 0 meetings"]);

    refilter(filtered({ formats: ["virtual"] }));
    expect(rowsOf("Status")).toEqual(["Requested: 1 meeting", "Developing: 0 meetings", "Clearance: 0 meetings", "Confirmed: 0 meetings", "Completed: 0 meetings", "Closed: 0 meetings", "On Hold: 0 meetings", "Cancelled: 1 meeting"]);
    expect(rowsOf("Format")).toEqual(["In person: 2 meetings", "Hybrid: 1 meeting", "Virtual: 2 meetings"]);
  });

  it("lists the three formats in the map's order, each with its glyph", () => {
    renderPanel();
    const format = screen.getByRole("group", { name: "Format" });
    expect([...format.querySelectorAll("svg[data-format]")].map((glyph) => glyph.getAttribute("data-format"))).toEqual(["in_person", "hybrid", "virtual"]);
    expect(rowsOf("Format")).toEqual(["In person: 2 meetings", "Hybrid: 1 meeting", "Virtual: 2 meetings"]);
  });

  it("draws each bar as long as its count against the busiest row in its group", () => {
    renderPanel();
    expect(barOf("Confirmed")).toBe("scaleX(1)");
    expect(barOf("Requested")).toBe("scaleX(0.5)");
    expect(barOf("Hybrid")).toBe("scaleX(0.5)");
    expect(barOf("Virtual")).toBe("scaleX(1)");
  });

  it("keeps a row with nothing in it as it is: an empty bar, full-strength text, and a checkbox that still works", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel();
    const clearance = screen.getByRole("checkbox", { name: "Clearance" });
    expect(barOf("Clearance")).toBe("scaleX(0)");
    expect(clearance).not.toHaveAttribute("aria-disabled");
    expect(clearance).not.toHaveAttribute("data-disabled");
    expect(dimmed(screen.getByText("Clearance"))).toBe(false);
    expect(dimmed(document.getElementById(clearance.getAttribute("aria-describedby") ?? "") as Element)).toBe(false);

    await user.click(clearance);
    expect(onChange).toHaveBeenLastCalledWith(filtered({ statuses: ["clearance"] }));
  });

  it("checks and unchecks statuses and formats, keeping each list in the order its group reads", async () => {
    const user = userEvent.setup();
    const filters = filtered({ statuses: ["cancelled"], formats: ["virtual"] });
    const { onChange } = renderPanel(filters);

    await user.click(screen.getByRole("checkbox", { name: "Confirmed" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...filters, statuses: ["confirmed", "cancelled"] });
    await user.click(screen.getByRole("checkbox", { name: "Cancelled" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...filters, statuses: [] });

    await user.click(screen.getByRole("checkbox", { name: "In person" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...filters, formats: ["in_person", "virtual"] });
    await user.click(screen.getByRole("checkbox", { name: "Virtual" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...filters, formats: [] });
  });

  it("takes the whole row as the checkbox's label, and Space from the keyboard", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPanel(filtered({ formats: ["virtual"] }));

    await user.click(screen.getByText("Hybrid"));
    expect(onChange).toHaveBeenLastCalledWith(filtered({ formats: ["hybrid", "virtual"] }));

    screen.getByRole("checkbox", { name: "Developing" }).focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(filtered({ statuses: ["developing"], formats: ["virtual"] }));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("opens each menu on its way out, then the busiest first with their counts; bureaus read by code and full name", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Region" }));
    expect(await menuRows("Region", "button")).toEqual(["All regions", "Asia-Pacific2", "Africa1", "Americas1", "Europe1"]);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Bureau or office" }));
    expect(await menuRows("Bureau or office", "option")).toEqual(["All bureaus and offices", "WTBWireless Telecommunications Bureau3", "OETOffice of Engineering and Technology2", "SBSpace Bureau1"]);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Topic" }));
    expect(await menuRows("Topic", "option")).toEqual(["All topics", "Spectrum policy3", "Broadband mapping1", "Cybersecurity1", "Emergency alerting1", "Satellite licensing1"]);
  });

  it("sets a region, bureau or topic from its menu, and the way out sets it back to none", async () => {
    const user = userEvent.setup();
    const { onChange, refilter } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Region" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Region" })).getByRole("button", { name: /^Africa/ }));
    expect(onChange).toHaveBeenLastCalledWith(filtered({ region: "Africa" }));

    await user.click(screen.getByRole("button", { name: "Bureau or office" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Bureau or office" })).getByRole("option", { name: /Space Bureau/ }));
    expect(onChange).toHaveBeenLastCalledWith(filtered({ bureau: "SB" }));

    await user.click(screen.getByRole("button", { name: "Topic" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Topic" })).getByRole("option", { name: /^Cybersecurity/ }));
    expect(onChange).toHaveBeenLastCalledWith(filtered({ topic: "Cybersecurity" }));

    const chosen = filtered({ region: "Africa", bureau: "OET", topic: "Cybersecurity" });
    refilter(chosen);
    await user.click(screen.getByRole("button", { name: "Region Africa" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Region" })).getByRole("button", { name: "All regions" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, region: null });

    await user.click(screen.getByRole("button", { name: "Bureau or office OET" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Bureau or office" })).getByRole("option", { name: "All bureaus and offices" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, bureau: null });

    await user.click(screen.getByRole("button", { name: "Topic Cybersecurity" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Topic" })).getByRole("option", { name: "All topics" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, topic: null });
  });

  it("keeps a chosen value listed at 0 when the other filters empty it, so it can be seen and undone", async () => {
    const user = userEvent.setup();
    const { refilter } = renderPanel(filtered({ formats: ["virtual"], region: "Europe" }));
    await user.click(screen.getByRole("button", { name: "Region Europe" }));
    expect(await menuRows("Region", "button")).toEqual(["All regions", "Americas1", "Asia-Pacific1", "Europe0"]);
    await user.keyboard("{Escape}");

    refilter(filtered({ formats: ["virtual"], bureau: "SB" }));
    await user.click(screen.getByRole("button", { name: "Bureau or office SB" }));
    expect(await menuRows("Bureau or office", "option")).toEqual(["All bureaus and offices", "OETOffice of Engineering and Technology1", "SBSpace Bureau0"]);
  });

  it("turns the Chairman's office and high priority switches on and off, each named by its own label", async () => {
    const user = userEvent.setup();
    const { onChange, refilter } = renderPanel();
    const och = screen.getByRole("switch", { name: "Chairman's office attending" });
    expect(och).not.toBeChecked();
    await user.click(och);
    expect(onChange).toHaveBeenLastCalledWith(filtered({ och: true }));
    await user.click(screen.getByText("High priority only"));
    expect(onChange).toHaveBeenLastCalledWith(filtered({ high: true }));

    refilter(filtered({ high: true }));
    const high = screen.getByRole("switch", { name: "High priority only" });
    expect(high).toBeChecked();
    await user.click(high);
    expect(onChange).toHaveBeenLastCalledWith(NO_FILTERS);
  });

  it("offers Reset only while something is set; Reset goes to the screen, and the keyboard carries on from the first filter", async () => {
    const user = userEvent.setup();
    const { onChange, onReset, refilter } = renderPanel();
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();

    const each: Partial<ReachFilters>[] = [{ statuses: ["confirmed"] }, { formats: ["hybrid"] }, { region: "Africa" }, { bureau: "OET" }, { topic: "Cybersecurity" }, { och: true }, { high: true }];
    for (const over of each) {
      refilter(filtered(over));
      expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Requested" })).toHaveFocus();

    refilter(NO_FILTERS);
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("has no axe violations with every kind of filter set", async () => {
    const { container } = renderPanel(filtered({ statuses: ["confirmed", "developing"], formats: ["in_person"], region: "Europe", bureau: "SB", topic: "Spectrum policy", och: true, high: true }));
    await expectNoViolations(container);
  });
});
