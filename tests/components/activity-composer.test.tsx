// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ActivityActionResult, ActivityEntryView, LogActivityAction, ResolveActivityAction } from "@/components/meetings/record/activity-entries";
import { ActivityTab } from "@/components/meetings/record/ActivityTab";
import { nyDate } from "@/lib/domain/fiscal-year";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/meetings/mtg_artci/activity",
  useSearchParams: () => new URLSearchParams(),
}));

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError, message: vi.fn() } }));

const NOW = new Date("2026-08-29T14:00:00Z");

const seeded: ActivityEntryView = {
  id: "act_1",
  kind: "status_change",
  body: "Status → Confirmed",
  occurredAt: new Date("2026-07-30T15:00:00Z"),
  authorName: "Marcus Bell",
  waitingOn: "none",
  waitingOnLabel: null,
  nextAction: null,
  nextActionDueAt: null,
  resolvedAt: null,
  resolvedByName: null,
};

type Options = { log?: LogActivityAction; resolve?: ResolveActivityAction; canLog?: boolean };

function renderTab({ log = vi.fn(async () => ({ ok: true as const, id: "act_new" })), resolve = vi.fn(async () => ({ ok: true as const, id: "act_1" })), canLog = true }: Options = {}) {
  render(<ActivityTab meetingId="mtg_artci" entries={[seeded]} waitingActivityId={null} canLog={canLog} now={NOW} log={log} resolve={resolve} />);
  return { log, resolve };
}

/** A controlled textarea keeps its text as a child node, so timeline queries stay scoped to the log. */
const timeline = () => within(screen.getByRole("region", { name: "Activity log" }));
const body = () => screen.getByLabelText("What happened?");
const type = (text: string) => fireEvent.change(body(), { target: { value: text } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Log activity" }));

afterEach(() => {
  cleanup();
  window.location.hash = "";
  vi.clearAllMocks();
});

describe("ActivityComposer", () => {
  it("starts on Note and lets a kind chip take over", () => {
    renderTab();
    expect(screen.getByRole("radio", { name: "Note" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Call" }));
    expect(screen.getByRole("radio", { name: "Call" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Note" })).not.toBeChecked();
  });

  it("asks who exactly only once a waiting-on party is chosen", () => {
    renderTab();
    expect(screen.queryByLabelText("Who exactly?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
    expect(screen.getByLabelText("Who exactly?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Nobody" }));
    expect(screen.queryByLabelText("Who exactly?")).not.toBeInTheDocument();
  });

  it("refuses to log an empty note", () => {
    const { log } = renderTab();
    submit();
    expect(log).not.toHaveBeenCalled();
    expect(screen.getByText(/Say what happened/i)).toBeInTheDocument();
  });

  it("sends the whole entry — kind, waiting-on, next action and its Washington-time due date", async () => {
    // Holding the action open keeps the transition — and the optimistic entry — pending.
    let settle: (result: ActivityActionResult) => void = () => {};
    const inFlight = new Promise<ActivityActionResult>((resolve) => {
      settle = resolve;
    });
    const { log } = renderTab({ log: vi.fn(() => inFlight) });

    fireEvent.click(screen.getByRole("radio", { name: "Call" }));
    type("Called the POC; the roster comes Friday.");
    fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
    fireEvent.change(screen.getByLabelText("Who exactly?"), { target: { value: "  MoC Lithuania POC  " } });
    fireEvent.change(screen.getByLabelText("Next action"), { target: { value: "Chase the roster" } });
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2026-09-02" } });
    submit();

    await waitFor(() => expect(log).toHaveBeenCalledTimes(1));
    expect(log).toHaveBeenCalledWith({
      meetingId: "mtg_artci",
      kind: "call",
      body: "Called the POC; the roster comes Friday.",
      waitingOn: "visitor",
      waitingOnLabel: "MoC Lithuania POC",
      nextAction: "Chase the roster",
      nextActionDueAt: nyDate(2026, 9, 2, 17, 0).toISOString(),
    });

    // Optimistic: the entry is on the timeline before the server has answered.
    await waitFor(() => expect(timeline().getByText("Called the POC; the roster comes Friday.")).toBeInTheDocument());
    expect(timeline().getByText(/Waiting on MoC Lithuania POC/)).toBeInTheDocument();

    await act(async () => {
      settle({ ok: true, id: "act_new" });
      await inFlight;
    });
  });

  it("rolls the optimistic entry back and says why when the server refuses", async () => {
    renderTab({ log: vi.fn(async () => ({ ok: false as const, error: "You cannot log activity on this meeting." })) });

    type("Rang the embassy.");
    submit();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("You cannot log activity on this meeting."));
    await waitFor(() => expect(timeline().queryByText("Rang the embassy.")).not.toBeInTheDocument());
    // The words are kept so nothing is retyped after a failure.
    expect(body()).toHaveValue("Rang the embassy.");
  });

  it("clears the composer once the entry is saved", async () => {
    const { log } = renderTab();
    type("Sent the draft agenda.");
    submit();

    await waitFor(() => expect(log).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(body()).toHaveValue(""));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("submits on Ctrl+Enter from the textarea", async () => {
    const { log } = renderTab();
    type("Left a voicemail for the POC.");
    fireEvent.keyDown(body(), { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(log).toHaveBeenCalledTimes(1));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ body: "Left a voicemail for the POC.", kind: "note", waitingOn: "none" }));
  });

  it("takes focus when the record header sends the reader to #composer", () => {
    window.location.hash = "#composer";
    renderTab();
    expect(body()).toHaveFocus();
  });

  it("is not rendered at all for a reader who may not log activity", () => {
    renderTab({ canLog: false });
    expect(screen.queryByLabelText("What happened?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log activity" })).not.toBeInTheDocument();
    // The timeline is still readable.
    expect(screen.getByText(/Status → Confirmed/)).toBeInTheDocument();
  });
});
