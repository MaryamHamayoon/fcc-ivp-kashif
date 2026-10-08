// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { NO_COUNTRIES } from "@/components/reach/CountryList";
import { DetailsPanel } from "@/components/reach/DetailsPanel";
import { nyDate } from "@/lib/domain/fiscal-year";
import type { ReachData } from "@/lib/domain/reach";
import { reachScene } from "@/lib/reach/scene";
import { DEFAULT_VIEW, type DetailsTab, type ReachView, type Selection } from "@/lib/reach/url";
import { expectNoViolations } from "@/tests/a11y/axe";
import { makeReachData, makeReachMeeting } from "@/tests/fixtures/reach";

/* --------------------------------- fixtures ------------------------------- */

// REACH_NOW is Monday, September 28, 2026, noon in Washington.
const at = (iso: string) => new Date(iso);

const OCTOBER = makeReachMeeting({
  id: "jp_oct",
  code: "IVP-2026-041",
  countries: ["JP", "KE"],
  start: at("2026-10-06T14:00:00Z"), // Tuesday, 10 AM in Washington
  proposed: true,
  participants: 8,
  topics: ["Spectrum policy", "Cybersecurity"],
  bureaus: ["WTB", "OET"],
  readiness: 60,
  lead: "Dana Whitfield",
  delegationSize: 6,
  waiting: { who: "visitor", label: "Embassy of Japan", businessDays: 6, band: "warn" },
  experts: [
    { name: "Ravi Patel", bureau: "WTB", lead: true, confirmed: true },
    { name: "Mia Chen", bureau: "OET", lead: false, confirmed: false },
  ],
  missing: [
    { label: "Agenda", detail: "No agenda items yet" },
    { label: "Briefing book", detail: "Not uploaded" },
  ],
});
const MARCH = makeReachMeeting({ id: "jp_mar", format: "hybrid", start: at("2026-03-10T14:00:00Z"), participants: 5, topics: ["Spectrum policy"], bureaus: ["WTB"] });
// Spectrum policy twice: a meeting counts once per topic.
const NOVEMBER = makeReachMeeting({ id: "jp_nov", format: "virtual", start: at("2026-11-20T15:00:00Z"), participants: 4, topics: ["Spectrum policy", "5G", "Spectrum policy"], bureaus: ["SB", "OGC"] });
const KENYA = makeReachMeeting({ id: "ke_mar", countries: ["KE"], region: "Africa", orgName: "Communications Authority of Kenya", start: at("2026-03-02T15:00:00Z") });
const UNDATED = makeReachMeeting({ id: "jp_tbd", status: "requested", start: null, lead: null, delegationSize: null, waiting: null, experts: [], missing: [], topics: [] });

const DATA = makeReachData([KENYA, MARCH, OCTOBER, NOVEMBER, UNDATED]);

/* ---------------------------------- setup --------------------------------- */

function renderPanel({ data = DATA, view = {}, tab = "next", selection = null }: { data?: ReachData; view?: Partial<ReachView>; tab?: DetailsTab; selection?: Selection } = {}) {
  const v: ReachView = { ...DEFAULT_VIEW, ...view };
  const handlers = { onTab: vi.fn(), onSelect: vi.fn(), onPoint: vi.fn() };
  const result = render(<DetailsPanel data={data} scene={reachScene(data, v)} filters={v.filters} tab={tab} selection={selection} {...handlers} />);
  return { ...handlers, ...result };
}

/** The panel as the screen drives it: choosing a row selects it, and Back lets it go. */
function Screen({ initial = null }: { initial?: Selection }) {
  const [selection, setSelection] = useState<Selection>(initial);
  const [tab, setTab] = useState<DetailsTab>("next");
  return <DetailsPanel data={DATA} scene={reachScene(DATA, DEFAULT_VIEW)} filters={DEFAULT_VIEW.filters} tab={tab} onTab={setTab} selection={selection} onSelect={setSelection} onPoint={() => {}} />;
}

/** What a `dl` says for a term. */
const fact = (term: string) => screen.getByText(term, { selector: "dt" }).nextElementSibling as HTMLElement;
/** A view's section, found by its heading. */
const section = (name: string) => screen.getByRole("heading", { level: 4, name }).closest("section") as HTMLElement;
const items = (el: HTMLElement) => within(el).getAllByRole("listitem").map((li) => li.textContent);

afterEach(cleanup);

/* ---------------------------------- tests --------------------------------- */

describe("the country view", () => {
  it("shows the country, its figures for the window, and what is next", () => {
    renderPanel({ selection: { kind: "country", cca2: "JP" } });
    expect(screen.queryByRole("tablist")).toBeNull();
    const header = screen.getByRole("heading", { level: 3, name: "Japan" }).parentElement as HTMLElement;
    expect(within(header).getByText("Asia-Pacific")).toBeInTheDocument();
    expect(within(header).getByRole("list")).toHaveTextContent("1In person1Hybrid1Virtual"); // the format breakdown
    expect(fact("Meetings")).toHaveTextContent("3");
    expect(fact("Participants")).toHaveTextContent("17");
    expect(fact("Next")).toHaveTextContent("Oct 6");
    expect(fact("Next")).toHaveTextContent("proposed");
  });

  it("gives the last meeting when nothing in the window is still ahead", () => {
    renderPanel({ view: { window: { from: nyDate(2026, 1, 1), to: nyDate(2026, 9, 1) } }, selection: { kind: "country", cca2: "KE" } });
    expect(screen.queryByText("Next", { selector: "dt" })).toBeNull();
    expect(fact("Last")).toHaveTextContent("Mar 2");
    expect(fact("Meetings")).toHaveTextContent("1");
  });

  it("counts the topics raised, busiest first, a meeting once per topic", () => {
    renderPanel({ selection: { kind: "country", cca2: "JP" } });
    expect(items(section("Topics raised"))).toEqual(["Spectrum policy 3 meetings", "5G 1 meeting", "Cybersecurity 1 meeting"]);
  });

  it("links each bureau or office to its experts in the Directory, named code first", () => {
    renderPanel({ selection: { kind: "country", cca2: "JP" } });
    const bureaus = within(section("FCC bureaus and offices"));
    expect(bureaus.getAllByRole("link").map((link) => link.textContent)).toEqual(["WTB", "OET", "OGC", "SB"]); // busiest first
    const wtb = bureaus.getByRole("link", { name: "WTB, Wireless Telecommunications Bureau" });
    expect(wtb).toHaveAttribute("href", "/directory?bureauCode=WTB");
    expect(bureaus.getByRole("link", { name: "SB, Space Bureau" })).toHaveAttribute("href", "/directory?bureauCode=SB");
    // A code the payload has no name for is still a link, named by its code.
    expect(bureaus.getByRole("link", { name: "OGC" })).toHaveAttribute("href", "/directory?bureauCode=OGC");
  });

  it("names a bureau in full in a tooltip when its link is focused", async () => {
    renderPanel({ selection: { kind: "country", cca2: "JP" } });
    expect(screen.queryByText("Wireless Telecommunications Bureau")).toBeNull();
    act(() => screen.getByRole("link", { name: "WTB, Wireless Telecommunications Bureau" }).focus());
    // The popup has no role: the link's own name already says what it shows.
    expect(await screen.findByText("Wireless Telecommunications Bureau")).toBeVisible();
  });

  it("lists its meetings in the window as rows, soonest first, and chooses or points from them", () => {
    const { onSelect, onPoint } = renderPanel({ selection: { kind: "country", cca2: "JP" } });
    const rows = within(section("In this window")).getAllByRole("button");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Japan, Ministry of Internal Affairs and Communications, Mar 10, 2026, Hybrid, Confirmed",
      "Japan and Kenya, Ministry of Internal Affairs and Communications, Oct 6, 2026, proposed, In person, Confirmed",
      "Japan, Ministry of Internal Affairs and Communications, Nov 20, 2026, Virtual, Confirmed",
    ]);
    fireEvent.pointerEnter(rows[1] as HTMLElement);
    expect(onPoint).toHaveBeenLastCalledWith("JP");
    fireEvent.click(rows[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith({ kind: "meeting", id: "jp_oct" });
  });

  it("links to the country's dossier", () => {
    renderPanel({ selection: { kind: "country", cca2: "JP" } });
    expect(screen.getByRole("link", { name: "Open Japan" })).toHaveAttribute("href", "/countries/JP");
  });

  it("still opens a country the window holds none of, with zero figures and a note where its meetings would be", () => {
    renderPanel({ view: { range: "last" }, selection: { kind: "country", cca2: "JP" } });
    expect(screen.getByRole("heading", { level: 3, name: "Japan" })).toBeInTheDocument();
    expect(fact("Meetings")).toHaveTextContent("0");
    expect(fact("Participants")).toHaveTextContent("0");
    expect(fact("Next")).toHaveTextContent("—");
    expect(screen.queryByRole("heading", { level: 4, name: "Topics raised" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 4, name: "FCC bureaus and offices" })).toBeNull();
    expect(within(section("In this window")).getByText(NO_COUNTRIES)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Japan" })).toHaveAttribute("href", "/countries/JP");
  });
});

describe("the meeting view", () => {
  it("heads the view with its code, its countries and its organization, then its status and readiness", () => {
    renderPanel({ selection: { kind: "meeting", id: "jp_oct" } });
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("IVP-2026-041")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
    expect(screen.getByText("Kenya")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Ministry of Internal Affairs and Communications" })).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("states when, how, who leads and who owes the next move", () => {
    renderPanel({ selection: { kind: "meeting", id: "jp_oct" } });
    expect(fact("When")).toHaveTextContent("Tue, Oct 6, 2026 · 10:00 AM ET");
    expect(fact("When")).toHaveTextContent("proposed · in 8 days");
    expect(fact("Format")).toHaveTextContent("In person · delegation of 6");
    expect(fact("OIA lead")).toHaveTextContent("Dana Whitfield");
    expect(fact("Waiting on")).toHaveTextContent("Embassy of Japan · 6d");
    expect(within(fact("Waiting on")).getByText("· 6d")).toHaveClass("text-age-warn");
    // A screen reader hears the wait in full, not "6d".
    expect(within(fact("Waiting on")).getByText("for 6 business days")).toHaveClass("sr-only");
  });

  it("lists the experts with their bureau, the lead, and anyone not yet confirmed", () => {
    renderPanel({ selection: { kind: "meeting", id: "jp_oct" } });
    expect(items(section("FCC experts"))).toEqual(["Ravi Patel WTB lead", "Mia Chen OET not yet confirmed"]);
  });

  it("says what is missing before it is ready, and its topics, and links to the record", () => {
    renderPanel({ selection: { kind: "meeting", id: "jp_oct" } });
    expect(items(section("Before it is ready"))).toEqual(["Agenda No agenda items yet", "Briefing book Not uploaded"]);
    expect(items(section("Topics"))).toEqual(["Spectrum policy", "Cybersecurity"]);
    expect(screen.getByRole("link", { name: "Open the meeting record" })).toHaveAttribute("href", "/meetings/jp_oct");
  });

  it("lists a topic the meeting repeats only once", () => {
    renderPanel({ selection: { kind: "meeting", id: "jp_nov" } });
    expect(items(section("Topics"))).toEqual(["Spectrum policy", "5G"]);
  });

  it("says plainly what a new request does not have yet, and leaves out what it has nothing for", () => {
    renderPanel({ selection: { kind: "meeting", id: "jp_tbd" } });
    expect(fact("When")).toHaveTextContent("Date to be set");
    expect(fact("Format")).toHaveTextContent("In person");
    expect(fact("Format")).not.toHaveTextContent("delegation");
    expect(fact("OIA lead")).toHaveTextContent("Not assigned");
    expect(fact("Waiting on")).toHaveTextContent("Nobody");
    expect(within(section("FCC experts")).getByText("None yet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 4, name: "Before it is ready" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 4, name: "Topics" })).toBeNull();
  });
});

describe("going back", () => {
  it("names the tab it returns to, and lets the selection go", () => {
    const { onSelect } = renderPanel({ tab: "countries", selection: { kind: "country", cca2: "JP" } });
    fireEvent.click(screen.getByRole("button", { name: "Back to Countries" }));
    expect(onSelect).toHaveBeenCalledWith(null);

    cleanup();
    renderPanel({ selection: { kind: "meeting", id: "jp_oct" } });
    expect(screen.getByRole("button", { name: "Back to Next up" })).toBeInTheDocument();

    cleanup();
    renderPanel({ view: { range: "last" }, selection: { kind: "country", cca2: "JP" } });
    expect(screen.getByRole("button", { name: "Back to Meetings" })).toBeInTheDocument();
  });

  it("shows the tabs, as if nothing were selected, for a selection the data cannot answer", () => {
    renderPanel({ selection: { kind: "meeting", id: "someone_elses" } });
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();

    cleanup();
    renderPanel({ selection: { kind: "country", cca2: "FR" } });
    expect(screen.getByRole("tab", { name: "Next up" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
  });

  it("takes focus to the view it opens, and back to the tab it returns to", () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: /^Japan and Kenya, Ministry/ }));
    expect(screen.getByRole("heading", { level: 3, name: "Ministry of Internal Affairs and Communications" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Back to Next up" }));
    expect(screen.getByRole("tab", { name: "Next up" })).toHaveFocus();
  });

  it("takes focus on from a country's view to the meeting chosen in it", () => {
    render(<Screen initial={{ kind: "country", cca2: "JP" }} />);
    fireEvent.click(within(section("In this window")).getByRole("button", { name: /^Japan and Kenya, Ministry/ }));
    expect(screen.getByRole("heading", { level: 3, name: "Ministry of Internal Affairs and Communications" })).toHaveFocus();
    expect(screen.getByText("IVP-2026-041")).toBeInTheDocument();
  });

  it("leaves focus alone for a selection made elsewhere, such as on the map", () => {
    render(<Screen initial={{ kind: "country", cca2: "JP" }} />);
    expect(screen.getByRole("heading", { level: 3, name: "Japan" })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });
});

describe("the views' accessibility", () => {
  it("has no axe violations in the country view", async () => {
    const { container } = renderPanel({ selection: { kind: "country", cca2: "JP" } });
    await expectNoViolations(container);
  });

  it("has no axe violations in the meeting view", async () => {
    const { container } = renderPanel({ selection: { kind: "meeting", id: "jp_oct" } });
    await expectNoViolations(container);
  });
});
