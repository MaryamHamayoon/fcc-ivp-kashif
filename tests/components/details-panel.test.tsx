// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NO_COUNTRIES } from "@/components/reach/CountryList";
import { DetailsPanel, NOTHING_AHEAD } from "@/components/reach/DetailsPanel";
import { MeetingRow } from "@/components/reach/MeetingRow";
import { nyDate } from "@/lib/domain/fiscal-year";
import { NO_FILTERS, type ReachData, type ReachMeeting } from "@/lib/domain/reach";
import { reachScene } from "@/lib/reach/scene";
import { DEFAULT_VIEW, type DetailsTab, type ReachView, type Selection } from "@/lib/reach/url";
import { expectNoViolations } from "@/tests/a11y/axe";
import { makeReachData, makeReachMeeting, REACH_COUNTRIES } from "@/tests/fixtures/reach";

/* --------------------------------- fixtures ------------------------------- */

// REACH_NOW is Monday, September 28, 2026, noon in Washington. Its week runs from Sunday, September 27, to Saturday, October 3.
const at = (iso: string) => new Date(iso);

const TODAY = makeReachMeeting({ id: "ke_today", countries: ["KE"], region: "Africa", orgName: "Communications Authority of Kenya", start: at("2026-09-28T13:00:00Z") }); // 9 AM: earlier than now, still today
const THURSDAY = makeReachMeeting({ id: "jp_thu", start: at("2026-10-01T14:00:00Z") });
const NEXT_WEEK = makeReachMeeting({ id: "br_next", countries: ["BR"], region: "Americas", orgName: "Anatel", start: at("2026-10-06T14:00:00Z"), proposed: true });
const LATE_OCTOBER = makeReachMeeting({ id: "de_oct", countries: ["DE"], region: "Europe", orgName: "Bundesnetzagentur", start: at("2026-10-20T14:00:00Z") });
const NOVEMBER = makeReachMeeting({ id: "gb_nov", countries: ["GB", "JP"], region: "Europe", orgName: "Ofcom", format: "virtual", start: at("2026-11-20T15:00:00Z") });
const MARCH = makeReachMeeting({ id: "fj_mar", countries: ["FJ"], region: "Asia-Pacific", orgName: "Ministry of Communications", start: at("2026-03-10T14:00:00Z") });
const UNDATED = makeReachMeeting({ id: "jp_tbd", status: "requested", format: "hybrid", start: null });
const UNDATED_DONE = makeReachMeeting({ id: "ke_done", countries: ["KE"], region: "Africa", status: "completed", start: null });
const JUNE_2025 = makeReachMeeting({ id: "gb_jun", countries: ["GB"], region: "Europe", orgName: "Ofcom", start: at("2025-06-02T14:00:00Z") });
const LATE_JUNE_2025 = makeReachMeeting({ id: "de_jun", countries: ["DE"], region: "Europe", orgName: "Bundesnetzagentur", start: at("2025-06-20T14:00:00Z") });
const DECEMBER_2025 = makeReachMeeting({ id: "br_dec", countries: ["BR"], region: "Americas", orgName: "Anatel", start: at("2025-12-01T15:00:00Z") });

const DATA = makeReachData([JUNE_2025, LATE_JUNE_2025, DECEMBER_2025, MARCH, TODAY, THURSDAY, NEXT_WEEK, LATE_OCTOBER, NOVEMBER, UNDATED, UNDATED_DONE]);

const nameOf = (cca2: string) => REACH_COUNTRIES.find((c) => c.cca2 === cca2)?.name ?? cca2;

/* ---------------------------------- setup --------------------------------- */

function renderPanel({ data = DATA, view = {}, tab = "next", selection = null, replaying = false }: { data?: ReachData; view?: Partial<ReachView>; tab?: DetailsTab; selection?: Selection; replaying?: boolean } = {}) {
  const v: ReachView = { ...DEFAULT_VIEW, ...view };
  const handlers = { onTab: vi.fn(), onSelect: vi.fn(), onPoint: vi.fn() };
  const result = render(<DetailsPanel data={data} scene={reachScene(data, v)} filters={v.filters} tab={tab} selection={selection} replaying={replaying} {...handlers} />);
  return { ...handlers, ...result };
}

const tabs = () => screen.getAllByRole("tab").map((tab) => tab.textContent);
const headings = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const group = (name: string) => screen.getByRole("group", { name });
/** The first part of each row's name in a group: its countries. */
const leads = (name: string) => within(group(name)).getAllByRole("button").map((row) => row.getAttribute("aria-label")?.split(",")[0]);

afterEach(cleanup);

/* ---------------------------------- tests --------------------------------- */

describe("DetailsPanel, with nothing selected", () => {
  it("names its two tabs and states the active tab's fact on the bar's right", () => {
    renderPanel();
    expect(tabs()).toEqual(["Next up", "Countries"]);
    expect(screen.getByRole("tab", { name: "Next up" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("5 visits ahead")).toBeInTheDocument();

    cleanup();
    renderPanel({ tab: "countries" });
    expect(screen.getByRole("tab", { name: "Countries" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("6 countries")).toBeInTheDocument();
    expect(screen.queryByText(/visits? ahead/)).toBeNull();
  });

  it("reads Meetings when the whole window is in the past, and counts the window's meetings", () => {
    renderPanel({ view: { range: "last" } });
    expect(tabs()).toEqual(["Meetings", "Countries"]);
    expect(screen.getByText("3 meetings")).toBeInTheDocument();

    // A window that stops at midnight this morning holds nothing still to come.
    cleanup();
    renderPanel({ view: { window: { from: nyDate(2026, 9, 1), to: nyDate(2026, 9, 28) } } });
    expect(tabs()).toEqual(["Meetings", "Countries"]);
    expect(screen.getByText("0 meetings")).toBeInTheDocument();
  });

  it("groups what is ahead as this week, next week, then by month, soonest first, under small sticky headings", () => {
    renderPanel();
    expect(headings()).toEqual(["This week", "Next week", "October 2026", "November 2026", "Date to be set"]);
    expect(leads("This week")).toEqual(["Kenya", "Japan"]); // 9 AM this morning is still ahead
    expect(leads("Next week")).toEqual(["Brazil"]);
    expect(leads("October 2026")).toEqual(["Germany"]);
    expect(leads("November 2026")).toEqual(["United Kingdom and Japan"]);
    expect(screen.queryByRole("button", { name: /^Fiji/ })).toBeNull(); // March is behind us
    expect(screen.getByRole("heading", { level: 3, name: "This week" })).toHaveClass("eyebrow", "sticky"); // the eyebrow: small, muted, uppercase
  });

  it("lists a past window by month, newest month first and newest meeting first", () => {
    renderPanel({ view: { range: "last" } });
    expect(headings()).toEqual(["December 2025", "June 2025"]);
    expect(leads("December 2025")).toEqual(["Brazil"]);
    expect(leads("June 2025")).toEqual(["Germany", "United Kingdom"]);
  });

  it("lists the window the replay is sweeping by month, soonest first, with nothing undated", () => {
    renderPanel({ view: { window: { from: nyDate(2026, 9, 20), to: nyDate(2026, 10, 20) } }, replaying: true });
    expect(tabs()).toEqual(["Meetings", "Countries"]);
    expect(screen.getByText("3 meetings")).toBeInTheDocument();
    expect(headings()).toEqual(["September 2026", "October 2026"]);
    expect(leads("September 2026")).toEqual(["Kenya"]);
    expect(leads("October 2026")).toEqual(["Japan", "Brazil"]);
  });

  it("ends with the meetings that have no date yet, leaving out settled ones and keeping to the filters; a past window has no such group", () => {
    renderPanel();
    expect(headings().at(-1)).toBe("Date to be set");
    expect(within(group("Date to be set")).getAllByRole("button").map((row) => row.getAttribute("aria-label"))).toEqual([
      "Japan, Ministry of Internal Affairs and Communications, Date to be set, Hybrid, Requested",
    ]);

    cleanup();
    renderPanel({ view: { filters: { ...NO_FILTERS, region: "Africa" } } });
    expect(headings()).toEqual(["This week"]);

    cleanup();
    renderPanel({ view: { range: "last" } });
    expect(screen.queryByRole("group", { name: "Date to be set" })).toBeNull();
  });

  it("says so when the window holds nothing, and when nothing in it is still ahead, before any meeting without a date", () => {
    renderPanel({ view: { range: "next7", filters: { ...NO_FILTERS, region: "Europe" } } });
    expect(screen.getByText(NO_COUNTRIES)).toBeInTheDocument();
    expect(headings()).toEqual([]);
    expect(screen.getByText("0 visits ahead")).toBeInTheDocument();

    // Nothing dated in the window, but a hybrid visit still waiting for its date.
    cleanup();
    renderPanel({ view: { range: "next7", filters: { ...NO_FILTERS, formats: ["hybrid"] } } });
    expect(screen.getByText(NO_COUNTRIES)).toBeInTheDocument();
    expect(headings()).toEqual(["Date to be set"]);

    // March to September 29, in Asia-Pacific: Fiji's March visit, and nothing after today.
    cleanup();
    renderPanel({ view: { window: { from: nyDate(2026, 3, 1), to: nyDate(2026, 9, 30) }, filters: { ...NO_FILTERS, region: "Asia-Pacific" } } });
    expect(tabs()).toEqual(["Next up", "Countries"]);
    expect(screen.getByText(NOTHING_AHEAD)).toBeInTheDocument();
    expect(NOTHING_AHEAD).toBe("Nothing ahead in this window.");
    expect(screen.getByText("0 visits ahead")).toBeInTheDocument();
    expect(headings()).toEqual(["Date to be set"]);
  });

  it("chooses a meeting from its row; pointing at the row or focusing it lights the row's first country", () => {
    const { onSelect, onPoint } = renderPanel();
    const row = screen.getByRole("button", { name: /^United Kingdom and Japan, Ofcom/ });
    fireEvent.pointerEnter(row);
    expect(onPoint).toHaveBeenLastCalledWith("GB");
    fireEvent.pointerLeave(row);
    expect(onPoint).toHaveBeenLastCalledWith(null);
    fireEvent.focus(row);
    expect(onPoint).toHaveBeenLastCalledWith("GB");
    fireEvent.blur(row);
    expect(onPoint).toHaveBeenLastCalledWith(null);

    fireEvent.pointerEnter(row);
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith({ kind: "meeting", id: "gb_nov" });
    expect(onPoint).toHaveBeenLastCalledWith(null); // the selection takes over from the pointer
  });

  it("lists the window's countries on the Countries tab, and choosing one selects that country", () => {
    const { onSelect, onPoint } = renderPanel({ tab: "countries" });
    const japan = screen.getByRole("button", { name: "Japan, Asia-Pacific, 2 meetings: 1 in person, 1 virtual" });
    expect(japan).not.toHaveAttribute("aria-current");
    fireEvent.pointerEnter(japan);
    expect(onPoint).toHaveBeenLastCalledWith("JP");
    fireEvent.click(japan);
    expect(onSelect).toHaveBeenCalledWith({ kind: "country", cca2: "JP" });
  });

  it("asks for the other tab when it is chosen", () => {
    const { onTab } = renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Countries" }));
    expect(onTab).toHaveBeenCalledWith("countries");
  });

  it("has no axe violations", async () => {
    const { container } = renderPanel();
    await expectNoViolations(container);
  });
});

describe("MeetingRow", () => {
  function renderRow(meeting: ReachMeeting) {
    const handlers = { onChoose: vi.fn(), onPoint: vi.fn() };
    render(<MeetingRow meeting={meeting} nameOf={nameOf} {...handlers} />);
    return { row: screen.getByRole("button"), ...handlers };
  }

  it("is one button named in words: countries, organization, date, format and status", () => {
    const { row, onChoose, onPoint } = renderRow(makeReachMeeting({ id: "jp_oct" }));
    expect(row).toHaveAccessibleName("Japan, Ministry of Internal Affairs and Communications, Oct 6, 2026, In person, Confirmed");
    expect(within(row).getByText("Oct").closest("time")).toHaveAttribute("datetime", "2026-10-06T14:00:00.000Z");
    expect(within(row).getByText("6")).toBeInTheDocument();
    expect(within(row).getByText("Japan")).toBeInTheDocument();
    expect(within(row).getByText("In person")).toBeInTheDocument();
    expect(within(row).getByText("Ministry of Internal Affairs and Communications")).toHaveClass("truncate");
    expect(within(row).getByText("Confirmed")).toBeInTheDocument();
    expect(within(row).getByText("60%")).toBeInTheDocument();
    expect(within(row).getByText("Oct").closest("time")).not.toHaveClass("border-dashed");
    expect(within(row).queryByText("Date not confirmed")).toBeNull();
    expect(row).toHaveAccessibleDescription("60% ready");

    fireEvent.click(row);
    expect(onChoose).toHaveBeenCalledWith("jp_oct");
    fireEvent.focus(row);
    expect(onPoint).toHaveBeenLastCalledWith("JP");
  });

  it("draws a proposed date with a dashed edge, says the date is not confirmed, and names it proposed", () => {
    const { row } = renderRow(makeReachMeeting({ proposed: true }));
    expect(row).toHaveAccessibleName("Japan, Ministry of Internal Affairs and Communications, Oct 6, 2026, proposed, In person, Confirmed");
    expect(within(row).getByText("Oct").closest("time")).toHaveClass("border-dashed");
    expect(within(row).getByText("Date not confirmed")).toBeInTheDocument();
  });

  it("names every country of a visit to several, and shows the first with a count of the rest", () => {
    const { row } = renderRow(makeReachMeeting({ countries: ["JP", "KE", "FJ"], format: "hybrid", status: "developing" }));
    expect(within(row).getByText("Japan +2")).toBeInTheDocument();
    expect(row).toHaveAccessibleName("Japan, Kenya, and Fiji, Ministry of Internal Affairs and Communications, Oct 6, 2026, Hybrid, Developing");
  });

  it("says who it is waiting on, in the color of the wait's age, and describes the readiness and the wait in words", () => {
    const { row } = renderRow(makeReachMeeting({ readiness: 40, waiting: { who: "visitor", label: "Embassy of Japan", businessDays: 6, band: "warn" } }));
    expect(within(row).getByText("Waiting on Embassy of Japan · 6d")).toHaveClass("text-age-warn");
    expect(within(row).getByText("40%")).toBeInTheDocument();
    expect(row).toHaveAccessibleDescription("40% ready, waiting on Embassy of Japan for 6 business days");

    cleanup();
    const again = renderRow(makeReachMeeting({ waiting: { who: "internal", label: "OIA", businessDays: 1, band: "ok" } }));
    expect(within(again.row).getByText("Waiting on OIA · 1d")).toHaveClass("text-age-ok");
    expect(again.row).toHaveAccessibleDescription("60% ready, waiting on OIA for 1 business day");
  });

  it("gives a meeting with no date an empty block and says so in its name", () => {
    const { row } = renderRow(makeReachMeeting({ start: null, status: "requested" }));
    expect(row).toHaveAccessibleName("Japan, Ministry of Internal Affairs and Communications, Date to be set, In person, Requested");
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(row.querySelector("time")).toBeNull();
  });
});
