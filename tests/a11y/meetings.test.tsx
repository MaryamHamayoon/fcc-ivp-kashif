// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { Pagination } from "@/components/common/Pagination";
import { MeetingsBoard } from "@/components/meetings/MeetingsBoard";
import { MeetingsCalendar } from "@/components/meetings/MeetingsCalendar";
import { MeetingsTable } from "@/components/meetings/MeetingsTable";
import { TransitionDialog } from "@/components/meetings/TransitionDialog";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { FIXTURE_NOW, makeListItem, makeReadiness } from "@/tests/fixtures/meetings";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/meetings",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

afterEach(cleanup);

/** Confirmed, dated, fully ready. */
const scheduled = makeListItem();

/** Undated, waiting on the visitor, part-ready — the row with every derived signal on it. */
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
  nextCandidate: new Date("2026-09-02T14:00:00Z"),
  candidateDates: [
    { id: "cd_1", start: new Date("2026-09-02T14:00:00Z"), end: null, status: "proposed", proposedBy: "fcc" },
    { id: "cd_2", start: new Date("2026-09-03T14:00:00Z"), end: null, status: "proposed", proposedBy: "fcc" },
  ],
  experts: [
    { id: "mex_2", staffId: "stf_tomas", name: "Tomas Lindqvist", bureauCode: "SB", status: "requested", role: "briefer" },
    { id: "mex_3", staffId: "stf_ada", name: "Ada Bell", bureauCode: "WTB", status: "tbd", role: "attendee" },
  ],
  readiness: makeReadiness({ status: "developing", hasAcceptedDate: false, experts: [{ status: "requested" }], documents: [], namedParticipants: 0 }),
  waiting: { who: "visitor", label: "ARTCI POC", since: new Date("2026-08-07T13:00:00Z"), businessDays: 16, band: "alert", activityId: "act_1", nextAction: "Re-send the date options", nextActionDueAt: null },
  leadName: "Marcus Bell",
});

/** A multi-country delegation the Chairman's office is joining. */
const multi = makeListItem({
  id: "mtg_sadc",
  code: "IVP-2026-060",
  title: "SADC regulators roundtable",
  status: "requested",
  countryCode: "ZA",
  countryName: "South Africa",
  countryCodes: ["ZA", "BW", "NA"],
  orgName: "Independent Communications Authority of South Africa",
  orgShortName: "ICASA",
  ochAttending: true,
  scheduledStart: new Date("2026-09-22T14:00:00Z"),
  scheduledEnd: new Date("2026-09-22T16:00:00Z"),
  candidateDates: [],
});

const items: MeetingListItem[] = [scheduled, undated, multi];
const transition = vi.fn(async () => ({ ok: true as const }));
const resume = vi.fn(async () => ({ ok: true as const, status: "developing" as const }));

describe("meetings list accessibility", () => {
  it("the table carries no WCAG violations, populated or empty", async () => {
    const { container, rerender } = render(<MeetingsTable items={items} now={FIXTURE_NOW} sort="date" dir="asc" onSortChange={vi.fn()} onClearFilters={vi.fn()} />);
    await expectNoViolations(container);
    rerender(<MeetingsTable items={[]} now={FIXTURE_NOW} sort="date" dir="asc" hasFilters onSortChange={vi.fn()} onClearFilters={vi.fn()} />);
    await expectNoViolations(container);
  });

  it("the table carries no WCAG violations with its pager, and while the next page loads", async () => {
    const pager = <Pagination page={2} pageSize={25} total={122} noun="meetings" hrefForPage={(page) => `/meetings?page=${page}`} onPageSizeChange={vi.fn()} className="border-t-0" />;
    const { container, rerender } = render(<MeetingsTable items={items} now={FIXTURE_NOW} sort="date" dir="asc" onSortChange={vi.fn()} pagination={pager} />);
    await expectNoViolations(container);
    rerender(<MeetingsTable items={items} now={FIXTURE_NOW} sort="date" dir="asc" onSortChange={vi.fn()} pagination={pager} isPlaceholder />);
    await expectNoViolations(container);
  });

  it("the board carries no WCAG violations", async () => {
    const { container } = render(<MeetingsBoard items={items} now={FIXTURE_NOW} transition={transition} resume={resume} />);
    await expectNoViolations(container);
  });

  it("the calendar carries no WCAG violations", async () => {
    const { container } = render(<MeetingsCalendar items={items} now={FIXTURE_NOW} />);
    await expectNoViolations(container);
  });

  it("the open transition dialog carries no WCAG violations", async () => {
    render(<TransitionDialog meetingId="mtg_artci" code="IVP-2026-041" status="developing" hasAcceptedDate={false} open onOpenChange={vi.fn()} action={vi.fn(async () => ({ ok: true as const }))} />);
    // The dialog is portalled out of the render container, so scan the whole document.
    await screen.findByRole("dialog");
    await expectNoViolations(document.body);
  });

  it("the hold dialog carries no WCAG violations", async () => {
    render(<TransitionDialog meetingId="mtg_artci" code="IVP-2026-041" status="developing" hasAcceptedDate target="on_hold" open onOpenChange={vi.fn()} action={vi.fn(async () => ({ ok: true as const }))} />);
    await screen.findByRole("dialog");
    await expectNoViolations(document.body);
  });
});
