// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ActivityEntryView, LogActivityAction, ResolveActivityAction } from "@/components/meetings/record/activity-entries";
import { toActivityEntries } from "@/components/meetings/record/activity-entries";
import { ActivityTab } from "@/components/meetings/record/ActivityTab";
import { businessDaysBetween } from "@/lib/domain/business-days";
import { makeRecord, RECORD_NOW } from "@/tests/fixtures/record";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/meetings/mtg_artci/activity",
  useSearchParams: () => new URLSearchParams(),
}));

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError, message: vi.fn() } }));

const NOW = new Date("2026-08-29T14:00:00Z");

const entry = (over: Partial<ActivityEntryView> & Pick<ActivityEntryView, "id" | "occurredAt">): ActivityEntryView => ({
  kind: "note",
  body: "…",
  authorName: "Priya Raman",
  waitingOn: "none",
  waitingOnLabel: null,
  nextAction: null,
  nextActionDueAt: null,
  resolvedAt: null,
  resolvedByName: null,
  ...over,
});

/** Aug 7 09:00 EDT — still open, and the record's current waiting-on. */
const openWait = entry({
  id: "act_4",
  kind: "email_out",
  body: "Sent the draft agenda and asked for the final delegation roster.",
  occurredAt: new Date("2026-08-07T13:00:00Z"),
  waitingOn: "visitor",
  waitingOnLabel: "ARTCI POC",
  nextAction: "Re-send the roster request",
  nextActionDueAt: new Date("2026-09-02T13:00:00Z"),
});

/** Later the same day — the day header must gather both. */
const sameDayNote = entry({ id: "act_3", body: "Embassy confirmed the delegation lands on the 14th.", occurredAt: new Date("2026-08-07T19:00:00Z"), authorName: "Marcus Bell" });

/** Aug 3, answered two days later: no Resolve button, a quiet resolved line instead. */
const closedWait = entry({
  id: "act_2",
  kind: "call",
  body: "Called OEA to chase the briefer.",
  occurredAt: new Date("2026-08-03T13:00:00Z"),
  waitingOn: "expert",
  waitingOnLabel: "OEA front office",
  resolvedAt: new Date("2026-08-05T13:00:00Z"),
  resolvedByName: "Priya Raman",
});

const statusChange = entry({ id: "act_1", kind: "status_change", body: "Status → Confirmed", occurredAt: new Date("2026-07-30T15:00:00Z"), authorName: "Marcus Bell" });

const ENTRIES = [openWait, sameDayNote, closedWait, statusChange];

type Options = { entries?: ActivityEntryView[]; canLog?: boolean; resolve?: ResolveActivityAction; log?: LogActivityAction };

function renderTab({ entries = ENTRIES, canLog = false, resolve = vi.fn(async () => ({ ok: true as const, id: "act_4" })), log = vi.fn(async () => ({ ok: true as const, id: "act_new" })) }: Options = {}) {
  render(<ActivityTab meetingId="mtg_artci" entries={entries} waitingActivityId={openWait.id} canLog={canLog} now={NOW} log={log} resolve={resolve} />);
  return { resolve, log };
}

const dayHeaders = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
const items = () => screen.getAllByRole("listitem");
const bodies = () => items().map((li) => li.textContent ?? "");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityTimeline", () => {
  it("groups the log by Washington day, newest first, with mono day headers", () => {
    renderTab();
    const headers = dayHeaders();
    expect(headers).toHaveLength(3);
    expect(headers[0]).toMatch(/Aug 7/);
    expect(headers[1]).toMatch(/Aug 3/);
    expect(headers[2]).toMatch(/Jul 30/);
    expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveClass("numeric");
  });

  it("shows how long we have been waiting, and offers Resolve only while it is open", () => {
    renderTab({ canLog: true });
    const days = businessDaysBetween(openWait.occurredAt, NOW);

    expect(screen.getByText(/Waiting on ARTCI POC/)).toBeInTheDocument();
    expect(screen.getByText(`${days} business days`)).toBeInTheDocument();
    expect(screen.getByText(/Re-send the roster request/)).toBeInTheDocument();

    // Only the open one can be resolved; the answered one reports who closed it.
    expect(screen.getAllByRole("button", { name: "Resolve" })).toHaveLength(1);
    expect(screen.getByText(/Resolved · Priya Raman/)).toBeInTheDocument();
  });

  it("gives the open waiting entry the #waiting anchor the rail links to", () => {
    const { container } = render(<ActivityTab meetingId="mtg_artci" entries={ENTRIES} waitingActivityId={openWait.id} canLog={false} now={NOW} log={vi.fn()} resolve={vi.fn()} />);
    expect(container.querySelector("#waiting")).not.toBeNull();
  });

  it("renders a status change as a compact system row, not a full entry", () => {
    renderTab();
    const row = screen.getByText(/Status → Confirmed/).closest("li");
    expect(row).not.toBeNull();
    expect(row?.textContent).toMatch(/by Marcus B\./);
    // System rows are not attributed with an avatar the way a person's note is.
    expect(within(row as HTMLElement).queryByRole("img")).toBeNull();
  });

  it("filters by kind, by who we are waiting on, and down to the unresolved", () => {
    renderTab();
    expect(items()).toHaveLength(4);

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "call" } });
    expect(bodies()).toEqual([expect.stringContaining("Called OEA")]);

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "all" } });
    fireEvent.click(screen.getByRole("button", { name: "Visitor" }));
    expect(screen.getByRole("button", { name: "Visitor" })).toHaveAttribute("aria-pressed", "true");
    expect(bodies()).toEqual([expect.stringContaining("Sent the draft agenda")]);

    fireEvent.click(screen.getByRole("button", { name: "Visitor" }));
    fireEvent.click(screen.getByRole("button", { name: "Unresolved only" }));
    expect(bodies()).toEqual([expect.stringContaining("Sent the draft agenda")]);

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "hold" } });
    expect(screen.getByText(/No entries match/i)).toBeInTheDocument();
  });

  it("resolves a waiting entry with an optional note and says so on the timeline", async () => {
    const { resolve } = renderTab({ canLog: true });

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    fireEvent.change(screen.getByLabelText("Resolution note"), { target: { value: "  Roster arrived by email.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Mark resolved" }));

    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    expect(resolve).toHaveBeenCalledWith({ meetingId: "mtg_artci", activityId: "act_4", note: "Roster arrived by email." });
  });

  it("keeps the entry open and explains itself when resolving fails", async () => {
    renderTab({ canLog: true, resolve: vi.fn(async () => ({ ok: false as const, error: "That entry is already resolved." })) });

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark resolved" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("That entry is already resolved."));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Resolve" })).toHaveLength(1));
  });

  it("invites the first entry when nothing has been logged", () => {
    renderTab({ entries: [] });
    expect(screen.getByText(/Nothing logged yet/i)).toBeInTheDocument();
  });

  it("reads the record's own activities, authors and resolutions", () => {
    const record = makeRecord();
    const mapped = toActivityEntries(record);

    expect(mapped).toHaveLength(record.activities.length);
    expect(mapped[0]).toMatchObject({ id: "act_2", kind: "email_out", authorName: "Priya Raman", waitingOn: "visitor", waitingOnLabel: "ARTCI POC" });
    expect(record.waiting?.activityId).toBe("act_2");
    expect(businessDaysBetween(mapped[0]?.occurredAt ?? RECORD_NOW, RECORD_NOW)).toBeGreaterThan(0);
  });
});
