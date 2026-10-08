// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MeetingsTable } from "@/components/meetings/MeetingsTable";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { FIXTURE_NOW, makeListItem, makeReadiness } from "@/tests/fixtures/meetings";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/meetings",
  useSearchParams: () => new URLSearchParams(),
}));

/** Confirmed, dated, fully ready. */
const scheduled = makeListItem();

/** Undated: two dates on the table, nobody has said yes yet, and the visitor owes us an answer. */
const undated = makeListItem({
  id: "mtg_ofcom",
  code: "IVP-2026-052",
  title: "Broadband mapping exchange",
  status: "developing",
  countryCode: "GB",
  countryName: "United Kingdom",
  countryCodes: ["GB"],
  orgName: "Office of Communications",
  orgShortName: "Ofcom",
  scheduledStart: null,
  scheduledEnd: null,
  nextCandidate: new Date("2026-08-26T14:00:00Z"),
  candidateDates: [
    { id: "cd_1", start: new Date("2026-08-26T14:00:00Z"), end: null, status: "proposed", proposedBy: "fcc" },
    { id: "cd_2", start: new Date("2026-08-27T14:00:00Z"), end: null, status: "proposed", proposedBy: "fcc" },
    { id: "cd_3", start: new Date("2026-08-19T14:00:00Z"), end: null, status: "declined", proposedBy: "visitor" },
  ],
  experts: [
    { id: "mex_2", staffId: "stf_tomas", name: "Tomas Lindqvist", bureauCode: "SB", status: "requested", role: "briefer" },
    { id: "mex_3", staffId: "stf_ada", name: "Ada Bell", bureauCode: "WTB", status: "tbd", role: "attendee" },
  ],
  readiness: makeReadiness({ status: "developing", hasAcceptedDate: false, experts: [{ status: "requested" }], documents: [], namedParticipants: 0 }),
  waiting: { who: "visitor", label: "ARTCI POC", since: new Date("2026-08-07T13:00:00Z"), businessDays: 16, band: "alert", activityId: "act_1", nextAction: "Re-send the date options", nextActionDueAt: null },
  leadName: "Marcus Bell",
  updatedAt: new Date("2026-08-22T15:00:00Z"),
});

/** A multi-country delegation the Chairman's office is joining. */
const multi = makeListItem({
  id: "mtg_sadc",
  code: "IVP-2026-060",
  title: "SADC regulators roundtable",
  countryCode: "ZA",
  countryName: "South Africa",
  countryCodes: ["ZA", "BW", "NA"],
  orgName: "Independent Communications Authority of South Africa",
  orgShortName: "ICASA",
  ochAttending: true,
  topics: [
    { id: "spectrum-sharing", name: "Spectrum Sharing" },
    { id: "satellite-licensing", name: "Satellite Licensing" },
    { id: "broadband-mapping", name: "Broadband Mapping" },
  ],
  readiness: makeReadiness({ documents: [{ kind: "agenda_draft" }] }),
  scheduledStart: null,
  scheduledEnd: null,
  nextCandidate: null,
  candidateDates: [],
});

const items: MeetingListItem[] = [scheduled, undated, multi];

const onSortChange = vi.fn();
const onClearFilters = vi.fn();

function renderTable(props: Partial<ComponentProps<typeof MeetingsTable>> = {}) {
  return render(<MeetingsTable items={items} now={FIXTURE_NOW} sort="date" dir="asc" onSortChange={onSortChange} onClearFilters={onClearFilters} {...props} />);
}

beforeEach(() => {
  push.mockReset();
  onSortChange.mockReset();
  onClearFilters.mockReset();
});

describe("MeetingsTable", () => {
  it("renders one row per meeting, each opening its record", () => {
    renderTable();
    const rows = within(screen.getByRole("rowgroup", { name: "Meetings" })).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Côte d'Ivoire/ })).toHaveAttribute("href", "/meetings/mtg_artci");
    expect(screen.getByRole("link", { name: /United Kingdom/ })).toHaveAttribute("href", "/meetings/mtg_ofcom");
  });

  it("shows the scheduled range, and the proposed dates when nothing is booked", () => {
    renderTable();
    // The day and the time sit on two lines; a screen reader still gets the one phrase.
    expect(screen.getByText((_, element) => element?.tagName === "TIME" && element.textContent === "Sep 15, 2026 · 10:00 AM–12:00 PM")).toBeInTheDocument();
    expect(screen.getByText("TBD · Aug 26, Aug 27 proposed")).toBeInTheDocument();
    expect(screen.getByText("TBD")).toBeInTheDocument();
  });

  it("carries the derived signals: waiting-on, readiness, experts, topics and the OCH marker", () => {
    renderTable();
    expect(screen.getByText("ARTCI POC · 16d")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Readiness 100%" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Readiness 17%" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Tomas Lindqvist \(Requested\)/ })).toBeInTheDocument();
    expect(screen.getByTitle("Satellite Licensing, Broadband Mapping")).toHaveTextContent("+2"); // the topics beyond the one shown
    expect(screen.getByText("OCH attending")).toBeInTheDocument();
    expect(screen.getByTitle("Also BW, NA")).toHaveTextContent("+2");
  });

  it("reflects the sort in aria-sort and asks for a new sort when a header is pressed", () => {
    renderTable({ sort: "updated", dir: "desc" });
    expect(screen.getByRole("columnheader", { name: /Updated/ })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: /Country/ }));
    expect(onSortChange).toHaveBeenCalledWith("country");
  });

  it("offers a way out when the filters match nothing", () => {
    renderTable({ items: [], hasFilters: true });
    expect(screen.getByText("No meetings match these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/i }));
    expect(onClearFilters).toHaveBeenCalled();
  });

  it("holds the pager at the foot of its card, after the rows", () => {
    renderTable({ pagination: <nav aria-label="Pager">pages</nav> });
    const card = screen.getByRole("region", { name: "Meetings" });
    const pager = within(card).getByRole("navigation", { name: "Pager" });
    expect(card.lastElementChild).toBe(pager);
    expect(screen.queryByRole("button", { name: /Load more/i })).not.toBeInTheDocument();
  });

  it("never scrolls vertically and does not pin its header to a scroller", () => {
    renderTable();
    const scroller = screen.getByRole("table").parentElement as HTMLElement;
    expect(scroller).toHaveClass("relative", "overflow-x-auto");
    expect(scroller.className).not.toMatch(/max-h-|overflow-auto|overflow-y/);
    for (const header of screen.getAllByRole("columnheader")) expect(header.className).not.toMatch(/sticky/);
  });

  it("dims the old rows while the next page is on its way", () => {
    const { rerender } = renderTable();
    const scroller = () => screen.getByRole("table").parentElement as HTMLElement;
    expect(scroller()).not.toHaveAttribute("aria-busy");
    expect(scroller()).not.toHaveClass("opacity-60");
    rerender(<MeetingsTable items={items} now={FIXTURE_NOW} sort="date" dir="asc" onSortChange={onSortChange} isPlaceholder />);
    expect(scroller()).toHaveAttribute("aria-busy", "true");
    expect(scroller()).toHaveClass("opacity-60");
  });

  it("marks a lapsed accepted date on an open meeting, but not once the meeting is completed", () => {
    const staleOpen = makeListItem({
      id: "mtg_stale",
      code: "IVP-2026-070",
      title: "Stalled roundtable",
      status: "on_hold",
      scheduledStart: new Date("2026-08-01T14:00:00Z"),
      scheduledEnd: new Date("2026-08-01T16:00:00Z"),
    });
    const staleClosed = makeListItem({
      id: "mtg_done",
      code: "IVP-2026-030",
      title: "Completed visit",
      status: "completed",
      scheduledStart: new Date("2026-07-01T14:00:00Z"),
      scheduledEnd: new Date("2026-07-01T16:00:00Z"),
    });
    renderTable({ items: [staleOpen, staleClosed] });
    const markers = screen.getAllByTitle("Accepted date has passed and the meeting is not completed");
    expect(markers).toHaveLength(1);
    // The visible words stay in the accessible name (WCAG 2.5.3), with the rest spelled out for a screen reader.
    expect(markers[0]).toHaveTextContent("Past date — the accepted date has passed and the meeting is not completed");
  });
});
