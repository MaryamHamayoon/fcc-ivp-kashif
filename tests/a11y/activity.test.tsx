// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityList } from "@/components/activity/ActivityList";
import { ActivityPulse } from "@/components/activity/ActivityPulse";
import { ActivityToolbar } from "@/components/activity/ActivityToolbar";
import type { ActivityOptions } from "@/components/activity/options";
import { Pagination } from "@/components/common/Pagination";
import { makeFeedItem } from "@/tests/fixtures/activity";
import { expectNoViolations } from "./axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/activity",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

// Saturday 29 Aug 2026, 10:00 in Washington.
const NOW = new Date("2026-08-29T14:00:00Z");

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

const items = [
  makeFeedItem({ id: "plain", occurredAt: new Date("2026-08-29T13:42:00Z") }),
  makeFeedItem({ id: "open", kind: "call", waitingOn: "visitor", waitingOnLabel: "ARTCI POC", nextAction: "Confirm the delegation list", nextActionDueAt: new Date("2026-09-04T15:00:00Z"), occurredAt: new Date("2026-08-05T15:00:00Z") }),
  makeFeedItem({ id: "closed", kind: "expert_requested", waitingOn: "expert", occurredAt: new Date("2026-08-04T15:00:00Z"), resolvedAt: new Date("2026-08-10T15:00:00Z"), resolvedByName: "Priya Raman" }),
  makeFeedItem({ id: "system", kind: "status_change", body: "Status: Developing → Clearance.", authorId: null, authorName: null, occurredAt: new Date("2026-08-03T15:00:00Z") }),
];

describe("activity log accessibility", () => {
  it("the toolbar, with a scope, filters and a picked week in force, carries no WCAG violations", async () => {
    const { container } = render(
      <ActivityToolbar params={new URLSearchParams("scope=open&kind=call&status=developing&week=2026-08-17")} options={options} counts={{ all: 2314, open: 37, mine: 212 }} total={37} isLoading={false} hrefFor={() => "/activity"} setFilter={vi.fn()} onClearAll={vi.fn()} />,
    );
    await expectNoViolations(container);
  });

  it("the weekly pulse carries no WCAG violations, at rest and with a week picked", async () => {
    const pulse = [
      { week: "2026-08-10", count: 12 },
      { week: "2026-08-17", count: 0 },
      { week: "2026-08-24", count: 31 },
    ];
    const { container, rerender } = render(<ActivityPulse pulse={pulse} selected={null} onSelect={vi.fn()} />);
    await expectNoViolations(container);
    rerender(<ActivityPulse pulse={pulse} selected="2026-08-10" onSelect={vi.fn()} />);
    await expectNoViolations(container);
  });

  it("the list carries no WCAG violations: closed rows, an opened row, empty, loading and failed", async () => {
    const { container, rerender } = render(<ActivityList items={items} now={NOW} />);
    await expectNoViolations(container);

    const toggles = screen.getAllByRole("button", { name: /^Show details/ });
    await userEvent.click(toggles[1]!);
    await expectNoViolations(container);

    rerender(<ActivityList items={[]} now={NOW} hasFilters onClearFilters={vi.fn()} />);
    await expectNoViolations(container);
    rerender(<ActivityList items={[]} now={NOW} isLoading />);
    await expectNoViolations(container);
    rerender(<ActivityList items={[]} now={NOW} isError onRetry={vi.fn()} />);
    await expectNoViolations(container);
  });

  it("the pages carry no WCAG violations, mid-run and with nothing to page", async () => {
    const { container, rerender } = render(<Pagination page={10} pageSize={50} total={1000} noun="entries" hrefForPage={(page) => `/activity?page=${page}`} onPageSizeChange={vi.fn()} />);
    await expectNoViolations(container);
    rerender(<Pagination page={1} pageSize={50} total={0} noun="entries" hrefForPage={(page) => `/activity?page=${page}`} onPageSizeChange={vi.fn()} />);
    await expectNoViolations(container);
  });
});
