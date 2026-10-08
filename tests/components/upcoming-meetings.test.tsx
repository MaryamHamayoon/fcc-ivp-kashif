// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { UpcomingMeetings } from "@/components/dashboard/UpcomingMeetings";
import { FIXTURE_NOW, makeListItem, makeReadiness } from "@/tests/fixtures/meetings";

// FIXTURE_NOW is Saturday, Aug 29, 2026, 10:00 AM in Washington.

/** This afternoon, in person, confirmed and ready. */
const today = makeListItem({ id: "mtg_today", scheduledStart: new Date("2026-08-29T18:30:00Z"), scheduledEnd: new Date("2026-08-29T20:00:00Z") });

/** Tomorrow morning, virtual, still in clearance, nobody leading it yet. */
const tomorrow = makeListItem({
  id: "mtg_ofcom",
  code: "IVP-2026-052",
  status: "clearance",
  format: "virtual",
  countryCode: "GB",
  countryName: "United Kingdom",
  countryCodes: ["GB"],
  orgName: "Office of Communications",
  orgShortName: "Ofcom",
  leadName: null,
  scheduledStart: new Date("2026-08-30T14:30:00Z"),
  scheduledEnd: new Date("2026-08-30T15:30:00Z"),
  readiness: makeReadiness({ status: "clearance", format: "virtual", documents: [], virtualLink: "https://example.test/join", location: null }),
});

/** Three weeks out: a hybrid roundtable for a delegation from two countries. */
const later = makeListItem({
  id: "mtg_sadc",
  code: "IVP-2026-060",
  status: "developing",
  format: "hybrid",
  countryCode: "ZA",
  countryName: "South Africa",
  countryCodes: ["ZA", "BW"],
  orgName: "Independent Communications Authority of South Africa",
  orgShortName: "ICASA",
  scheduledStart: new Date("2026-09-17T13:00:00Z"),
  scheduledEnd: null,
});

const meetings = [today, tomorrow, later];

describe("UpcomingMeetings", () => {
  it("opens with a slim title bar: the name, how many are ahead and the way to all of them", () => {
    render(<UpcomingMeetings meetings={meetings} total={12} now={FIXTURE_NOW} />);
    const heading = screen.getByRole("heading", { level: 2, name: "Upcoming meetings" });
    const bar = within(heading.closest("header") as HTMLElement);
    expect(bar.getByText("12")).toBeInTheDocument();
    expect(bar.getByRole("link", { name: "View all 12" })).toHaveAttribute("href", "/meetings?view=upcoming");
    expect(screen.getByRole("region", { name: "Upcoming meetings" })).toBeInTheDocument();
  });

  it("lists each meeting soonest first: when, who, how and in what state, linked to its record", () => {
    render(<UpcomingMeetings meetings={meetings} total={3} now={FIXTURE_NOW} />);
    const list = screen.getByRole("list", { name: "Upcoming meetings" });
    const rows = within(list).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/meetings/mtg_today", "/meetings/mtg_ofcom", "/meetings/mtg_sadc"]);

    expect(rows[0]).toHaveTextContent("ARTCI · Côte d'Ivoire");
    expect(rows[0]).toHaveTextContent("Today, 2:30 PM · In person · Confirmed");
    expect(rows[1]).toHaveTextContent("Ofcom · United Kingdom");
    expect(rows[1]).toHaveTextContent("Tomorrow, 10:30 AM · Virtual · Clearance");
    expect(rows[2]).toHaveTextContent("ICASA · South Africa");
    expect(rows[2]).toHaveTextContent("Thu, 9:00 AM · Hybrid · Developing");
    // Only everything fits, so there is no way to "all" of them.
    expect(screen.queryByRole("link", { name: /^View all/ })).toBeNull();
  });

  it("leads every row with its date as a calendar leaf, marked by how near it is", () => {
    const { container } = render(<UpcomingMeetings meetings={meetings} total={3} now={FIXTURE_NOW} />);
    const leaves = [...container.querySelectorAll("time[data-when]")];
    expect(leaves.map((leaf) => leaf.getAttribute("data-when"))).toEqual(["today", "soon", "later"]);
    expect(leaves.map((leaf) => leaf.textContent?.replace(/\s+/g, " ").trim())).toEqual(["Aug 29", "Aug 30", "Sep 17"]);
    expect(leaves[2]).toHaveAttribute("dateTime", "2026-09-17T13:00:00.000Z");
    expect(leaves[2]).toHaveAttribute("title", "Thursday, September 17, 2026");
  });

  it("shows readiness, the lead and the other countries of a delegation", () => {
    render(<UpcomingMeetings meetings={meetings} total={3} now={FIXTURE_NOW} />);
    expect(screen.getAllByRole("img", { name: /^Readiness \d+%$/ })).toHaveLength(3);
    expect(screen.getAllByRole("img", { name: "Lead: Priya Raman" })).toHaveLength(2);
    const icasa = screen.getByRole("link", { name: /ICASA/ });
    expect(within(icasa).getByText("+1")).toHaveAttribute("title", "Also BW");
  });

  it("says so when nothing is scheduled ahead", () => {
    render(<UpcomingMeetings meetings={[]} total={0} now={FIXTURE_NOW} />);
    expect(screen.getByText("No meetings are scheduled ahead.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Upcoming meetings" })).toBeNull();
  });
});
