// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeetingsCalendar } from "@/components/meetings/MeetingsCalendar";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { FIXTURE_NOW, makeListItem } from "@/tests/fixtures/meetings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/meetings",
  useSearchParams: () => new URLSearchParams(),
}));

/** Two days out — inside the month on screen and inside the agenda window. */
const soon = makeListItem({
  id: "mtg_artci",
  code: "IVP-2026-041",
  orgShortName: "ARTCI",
  scheduledStart: new Date("2026-08-31T14:00:00Z"),
  scheduledEnd: new Date("2026-08-31T16:00:00Z"),
});

/** Next month: off the August grid, still inside the thirty-day agenda. */
const nextMonth = makeListItem({
  id: "mtg_icasa",
  code: "IVP-2026-060",
  title: "SADC regulators roundtable",
  countryCode: "ZA",
  countryName: "South Africa",
  countryCodes: ["ZA"],
  orgName: "Independent Communications Authority of South Africa",
  orgShortName: "ICASA",
  ochAttending: true,
  scheduledStart: new Date("2026-09-15T14:00:00Z"),
  scheduledEnd: new Date("2026-09-15T17:00:00Z"),
});

/** Far enough out that the agenda must leave it alone. */
const later = makeListItem({
  id: "mtg_anatel",
  code: "IVP-2026-075",
  title: "Satellite licensing roundtable",
  countryCode: "BR",
  countryName: "Brazil",
  countryCodes: ["BR"],
  orgName: "Agência Nacional de Telecomunicações",
  orgShortName: "Anatel",
  scheduledStart: new Date("2026-11-20T15:00:00Z"),
  scheduledEnd: null,
});

/** Nothing agreed yet: it belongs in the tray, not on a square. */
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
  candidateDates: [
    { id: "cd_1", start: new Date("2026-09-02T14:00:00Z"), end: null, status: "proposed", proposedBy: "fcc" },
    { id: "cd_2", start: new Date("2026-09-03T14:00:00Z"), end: null, status: "proposed", proposedBy: "fcc" },
  ],
});

const items: MeetingListItem[] = [soon, nextMonth, later, undated];

const renderCalendar = (over: Partial<Parameters<typeof MeetingsCalendar>[0]> = {}) => render(<MeetingsCalendar items={items} now={FIXTURE_NOW} {...over} />);

const monthHeading = () => screen.getByRole("heading", { level: 3, name: /\d{4}$/ }).textContent;

describe("MeetingsCalendar", () => {
  it("lays the month out over seven weekday columns", () => {
    renderCalendar();
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(7);
    expect(headers.map((header) => header.textContent)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("opens on the month containing today and marks today", () => {
    const { container } = renderCalendar();
    expect(monthHeading()).toBe("August 2026");
    expect(container.querySelector('[data-day="2026-08-29"]')).toHaveAttribute("data-today", "true");
  });

  it("puts each meeting on its Washington day", () => {
    const { container } = renderCalendar();
    const cell = container.querySelector('[data-day="2026-08-31"]');
    expect(cell).not.toBeNull();
    expect(within(cell as HTMLElement).getByText("ARTCI")).toBeInTheDocument();
    expect(within(container.querySelector('[data-day="2026-08-30"]') as HTMLElement).queryByText("ARTCI")).not.toBeInTheDocument();
  });

  it("moves between months and back to today", async () => {
    const user = userEvent.setup();
    renderCalendar();

    await user.click(screen.getByRole("button", { name: /next month/i }));
    expect(monthHeading()).toBe("September 2026");

    await user.click(screen.getByRole("button", { name: /previous month/i }));
    await user.click(screen.getByRole("button", { name: /previous month/i }));
    expect(monthHeading()).toBe("July 2026");

    await user.click(screen.getByRole("button", { name: /today/i }));
    expect(monthHeading()).toBe("August 2026");
  });

  it("lists the next thirty days in the agenda, and nothing beyond them", () => {
    renderCalendar();
    const agenda = screen.getByRole("region", { name: /next 30 days/i });
    expect(within(agenda).getByRole("link", { name: /ARTCI/ })).toHaveAttribute("href", "/meetings/mtg_artci");
    expect(within(agenda).getByRole("link", { name: /ICASA/ })).toBeInTheDocument();
    expect(within(agenda).queryByText(/Anatel/)).not.toBeInTheDocument();
  });

  it("focuses the agenda on a day when that day is chosen", async () => {
    const user = userEvent.setup();
    renderCalendar();

    await user.click(screen.getByRole("button", { name: /August 31, 2026/ }));

    const agenda = screen.getByRole("region", { name: /August 31, 2026/ });
    expect(within(agenda).getByRole("link", { name: /ARTCI/ })).toBeInTheDocument();
    expect(within(agenda).queryByText(/ICASA/)).not.toBeInTheDocument();

    await user.click(within(agenda).getByRole("button", { name: /next 30 days/i }));
    expect(screen.getByRole("region", { name: /next 30 days/i })).toBeInTheDocument();
  });

  it("keeps undated meetings in a dates-pending tray", () => {
    renderCalendar();
    const tray = screen.getByRole("region", { name: /dates pending/i });
    expect(within(tray).getByRole("link", { name: /Ofcom/ })).toHaveAttribute("href", "/meetings/mtg_ofcom");
    expect(within(tray).getByText(/Sep 2, Sep 3/)).toBeInTheDocument();
    expect(within(tray).queryByText(/ARTCI/)).not.toBeInTheDocument();
  });

  it("says so when nothing matches the filters", () => {
    renderCalendar({ items: [], hasFilters: true });
    expect(screen.getByText(/no meetings match these filters/i)).toBeInTheDocument();
  });
});
