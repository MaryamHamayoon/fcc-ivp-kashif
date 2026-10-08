// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityList } from "@/components/activity/ActivityList";
import { ActivityPulse } from "@/components/activity/ActivityPulse";
import { ActivityToolbar } from "@/components/activity/ActivityToolbar";
import type { ActivityOptions } from "@/components/activity/options";
import { Pagination } from "@/components/common/Pagination";
import { applyPatch, type ParamPatch } from "@/lib/url-state";
import { makeFeedItem } from "@/tests/fixtures/activity";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/activity",
  useSearchParams: () => new URLSearchParams(),
}));

// Saturday 29 Aug 2026, 10:00 in Washington.
const NOW = new Date("2026-08-29T14:00:00Z");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityList", () => {
  const items = [
    makeFeedItem({ id: "a", occurredAt: new Date("2026-08-29T13:42:00Z") }),
    makeFeedItem({ id: "b", kind: "call", body: "Spoke with the embassy about interpreters.", occurredAt: new Date("2026-08-28T19:05:00Z"), authorName: "Marcus Bell", authorId: "usr_marcus", meetingId: "mtg_2", meetingCode: "IVP-2026-052", orgName: "Ofcom", countryCode: "GB", countryName: "United Kingdom" }),
  ];

  it("files each entry under the Washington day it happened on", () => {
    render(<ActivityList items={items} now={NOW} />);
    const today = screen.getByRole("group", { name: "Today" });
    const yesterday = screen.getByRole("group", { name: "Yesterday" });
    expect(within(today).getAllByRole("listitem")).toHaveLength(1);
    expect(within(yesterday).getByText(/Spoke with the embassy/)).toBeInTheDocument();
  });

  it("says on one line when, what kind, what, which meeting and who", () => {
    render(<ActivityList items={items} now={NOW} />);
    const row = within(screen.getByRole("group", { name: "Today" })).getByRole("listitem");
    expect(within(row).getByText("9:42 AM")).toBeInTheDocument();
    expect(within(row).getByText("Email sent")).toBeInTheDocument();
    expect(within(row).getByText(/Sent the draft agenda/)).toBeInTheDocument();
    expect(within(row).getByText("Priya R.")).toBeInTheDocument();
    const meeting = within(row).getByRole("link", { name: /IVP-2026-041/ });
    expect(meeting).toHaveAttribute("href", "/meetings/mtg_1/activity");
    expect(meeting).toHaveTextContent("ARTCI");
  });

  it("flags a wait that is still open with who it is on and how long it has run, and a closed one as resolved", () => {
    render(
      <ActivityList
        now={NOW}
        items={[
          makeFeedItem({ id: "open", waitingOn: "visitor", waitingOnLabel: "ARTCI POC", occurredAt: new Date("2026-08-05T15:00:00Z") }),
          makeFeedItem({ id: "closed", waitingOn: "expert", occurredAt: new Date("2026-08-04T15:00:00Z"), resolvedAt: new Date("2026-08-10T15:00:00Z"), resolvedByName: "Priya Raman" }),
        ]}
      />,
    );
    expect(screen.getByText("Waiting on ARTCI POC · 17 business days")).toBeInTheDocument();
    expect(screen.getByText("Resolved Aug 10")).toBeInTheDocument();
  });

  it("opens an entry in place: which meeting, what happens next and by when, who logged it", async () => {
    render(<ActivityList now={NOW} items={[makeFeedItem({ id: "x", nextAction: "Confirm the delegation list", nextActionDueAt: new Date("2026-09-04T15:00:00Z") })]} />);
    const toggle = screen.getByRole("button", { name: /^Show details/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Confirm the delegation list")).toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(panel).toHaveTextContent("ARTCI study visit on spectrum valuation");
    expect(panel).toHaveTextContent("Confirm the delegation list");
    expect(panel).toHaveTextContent("Priya Raman");
    expect(panel).toHaveTextContent("Sep 4, 2026");
    expect(within(panel).getByRole("link", { name: /Open the meeting/ })).toHaveAttribute("href", "/meetings/mtg_1/activity");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("offers a way out when nothing matches", async () => {
    const onClearFilters = vi.fn();
    render(<ActivityList items={[]} now={NOW} hasFilters onClearFilters={onClearFilters} />);
    expect(screen.getByText("Nothing in the log matches.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClearFilters).toHaveBeenCalled();
  });
});

describe("Pagination", () => {
  const hrefForPage = (page: number) => `/activity?page=${page}`;
  /** The range is set in two weights, so it is matched as the paragraph reads rather than by one text node. */
  const range = (text: string) => screen.getByText((_, el) => el?.tagName === "P" && el.textContent === text);

  it("says which rows are on screen, and links the pages around this one", () => {
    render(<Pagination page={10} pageSize={50} total={1000} noun="entries" hrefForPage={hrefForPage} onPageSizeChange={vi.fn()} />);
    expect(range("451–500 of 1,000")).toBeInTheDocument();
    const nav = within(screen.getByRole("navigation", { name: "Pagination" }));
    expect(nav.getByRole("link", { name: "Page 10" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Page 11" })).toHaveAttribute("href", "/activity?page=11");
    expect(nav.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/activity?page=9");
    expect(nav.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/activity?page=11");
    expect(nav.queryByRole("link", { name: "Page 5" })).toBeNull();
  });

  it("has nowhere to go back to on the first page, or forward to on the last", () => {
    const { rerender } = render(<Pagination page={1} pageSize={50} total={120} noun="entries" hrefForPage={hrefForPage} onPageSizeChange={vi.fn()} />);
    expect(screen.queryByRole("link", { name: "Previous page" })).toBeNull();
    expect(screen.getByRole("link", { name: "Next page" })).toBeInTheDocument();
    rerender(<Pagination page={3} pageSize={50} total={120} noun="entries" hrefForPage={hrefForPage} onPageSizeChange={vi.fn()} />);
    expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
    expect(range("101–120 of 120")).toBeInTheDocument();
  });

  it("changes how many rows a page holds", async () => {
    const onPageSizeChange = vi.fn();
    render(<Pagination page={1} pageSize={50} total={120} noun="entries" hrefForPage={hrefForPage} onPageSizeChange={onPageSizeChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "100");
    expect(onPageSizeChange).toHaveBeenCalledWith(100);
  });

  it("says so plainly when there is nothing to page", () => {
    render(<Pagination page={1} pageSize={50} total={0} noun="entries" hrefForPage={hrefForPage} onPageSizeChange={vi.fn()} />);
    expect(screen.getByText("No entries")).toBeInTheDocument();
  });
});

describe("ActivityPulse", () => {
  const pulse = [
    { week: "2026-08-10", count: 12 },
    { week: "2026-08-17", count: 0 },
    { week: "2026-08-24", count: 31 },
  ];

  it("names every week with its dates and its count", () => {
    render(<ActivityPulse pulse={pulse} selected={null} onSelect={vi.fn()} />);
    const strip = within(screen.getByRole("group", { name: "Entries per week, last 3 weeks" }));
    expect(strip.getByRole("button", { name: "Aug 10 – 16: 12 entries" })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: "Aug 17 – 23: no entries" })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: "Aug 24 – 30: 31 entries" })).toBeInTheDocument();
  });

  it("is one stop in the tab order, and the arrow keys travel the weeks", async () => {
    render(<ActivityPulse pulse={pulse} selected={null} onSelect={vi.fn()} />);
    const bars = within(screen.getByRole("group", { name: /^Entries per week/ })).getAllByRole("button");
    // The current week is where a reader arrives: it is the one most often wanted.
    expect(bars.map((bar) => bar.tabIndex)).toEqual([-1, -1, 0]);

    bars[2]?.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(bars[1]).toHaveFocus();
    expect(bars.map((bar) => bar.tabIndex)).toEqual([-1, 0, -1]);
    await userEvent.keyboard("{Home}");
    expect(bars[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(bars[0]).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(bars[2]).toHaveFocus();
  });

  it("arrives on the picked week when there is one", () => {
    render(<ActivityPulse pulse={pulse} selected="2026-08-10" onSelect={vi.fn()} />);
    const bars = within(screen.getByRole("group", { name: /^Entries per week/ })).getAllByRole("button");
    expect(bars.map((bar) => bar.tabIndex)).toEqual([0, -1, -1]);
  });

  it("narrows the log to a week when its bar is pressed, and lets go when pressed again", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<ActivityPulse pulse={pulse} selected={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /^Aug 10/ }));
    expect(onSelect).toHaveBeenLastCalledWith("2026-08-10");

    rerender(<ActivityPulse pulse={pulse} selected="2026-08-10" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /^Aug 10/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /^Aug 10/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe("ActivityToolbar", () => {
  const options: ActivityOptions = {
    kinds: [
      { value: "note", label: "Note" },
      { value: "call", label: "Call" },
    ],
    parties: [{ value: "visitor", label: "Visiting delegation" }],
    authors: [{ value: "usr_priya", label: "Priya Raman" }],
    regions: [{ value: "af", label: "Africa" }],
    fiscalYears: [{ value: "2026", label: "FY26" }],
    statuses: [{ value: "developing", label: "Developing" }],
  };
  const setFilter = vi.fn();
  const hrefFor = (params: URLSearchParams) => (patch: ParamPatch) => {
    const query = applyPatch(params, { ...patch, page: null, pageSize: null }).toString();
    return query ? `/activity?${query}` : "/activity";
  };
  const renderToolbar = (query = "") => {
    const params = new URLSearchParams(query);
    return render(<ActivityToolbar params={params} options={options} counts={{ all: 2314, open: 37, mine: 212 }} total={37} isLoading={false} hrefFor={hrefFor(params)} setFilter={setFilter} onClearAll={vi.fn()} />);
  };

  it("offers the whole log, the waits still open and the reader's own entries, each with its count", () => {
    renderToolbar("scope=open&kind=call");
    const tabs = within(screen.getByRole("navigation", { name: "Scope" }));
    expect(tabs.getByRole("link", { name: /^Open follow-ups/ })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: /^Open follow-ups/ })).toHaveTextContent("37");
    // The order of a query string carries no meaning, so compare what it says.
    const queryOf = (link: HTMLElement) => Object.fromEntries(new URL(link.getAttribute("href") ?? "", "http://ivp.test").searchParams);
    expect(queryOf(tabs.getByRole("link", { name: /^All/ }))).toEqual({ kind: "call" });
    expect(queryOf(tabs.getByRole("link", { name: /^Mine/ }))).toEqual({ scope: "mine", kind: "call" });
    expect(tabs.getByRole("link", { name: /^All/ })).toHaveTextContent("2,314");
  });

  it("shows a picked week among the filters in force, removable like any other", async () => {
    renderToolbar("week=2026-08-17&kind=call");
    expect(screen.getByText("Aug 17 – 23")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Week · Aug 17 – 23/ }));
    expect(setFilter).toHaveBeenCalledWith({ week: null });
  });
});
