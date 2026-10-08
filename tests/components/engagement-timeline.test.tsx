// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EngagementTimeline } from "@/components/dossier/EngagementTimeline";
import type { Timeline, TimelineMeeting } from "@/lib/domain/dossier";

const NOW = new Date("2026-08-29T14:00:00Z");
const meeting = (id: string, over: Partial<TimelineMeeting>): TimelineMeeting => ({ id, code: `IVP-${id}`, title: `Meeting ${id}`, status: "completed", date: new Date("2026-03-10T14:00:00Z"), participants: 6, laneId: "spectrum-sharing", fiscalYear: 2026, ...over });

const timeline: Timeline = {
  lanes: [
    { id: "spectrum-sharing", name: "Spectrum Sharing" },
    { id: "other", name: "Other" },
  ],
  meetings: [
    meeting("a", { title: "Spectrum sharing study visit", date: new Date("2026-09-15T14:00:00Z"), participants: 12, status: "confirmed" }),
    meeting("b", { title: "Broadband mapping exchange", date: new Date("2024-05-02T14:00:00Z"), participants: 1, fiscalYear: 2024, laneId: "other" }),
    meeting("c", { title: "Orbital debris briefing", date: null, participants: 0, status: "requested", fiscalYear: 2027, laneId: "other" }),
  ],
  firstFy: 2024,
  lastFy: 2027,
};

/** jsdom has no ResizeObserver; this one reports a fixed width the moment it observes. */
function fakeResizeObserver(width: number) {
  class RO {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe() {
      this.cb([{ contentRect: { width, height: 200 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", RO);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EngagementTimeline", () => {
  it("draws one link per meeting, each spoken as a sentence, inside a labelled figure", () => {
    render(<EngagementTimeline timeline={timeline} now={NOW} subject="Kenya" />);
    expect(screen.getByRole("figure", { name: "Engagement timeline" })).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("aria-label"))).toEqual([
      "Broadband mapping exchange, May 2, 2024, 1 participant, Completed",
      "Spectrum sharing study visit, Sep 15, 2026, 12 participants, Confirmed",
      "Orbital debris briefing, not yet scheduled, 0 participants, Requested",
    ]);
    expect(links[1]).toHaveAttribute("href", "/meetings/a");
    expect(screen.getByText("FY24")).toBeInTheDocument();
    expect(screen.getByText("FY27")).toBeInTheDocument();
    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows the meeting in a tooltip on focus and hides it again on blur", async () => {
    render(<EngagementTimeline timeline={timeline} now={NOW} subject="Kenya" />);
    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip).not.toBeVisible();
    const [first, second] = screen.getAllByRole("link");
    act(() => first!.focus());
    expect(first).toHaveFocus();
    expect(tip).toBeVisible();
    expect(tip).toHaveTextContent("Broadband mapping exchange");
    expect(tip).toHaveTextContent("May 2, 2024 · 1 participant · Completed");
    expect(first).toHaveAttribute("aria-describedby", tip.id);
    act(() => second!.focus());
    expect(tip).toHaveTextContent("Spectrum sharing study visit");
    expect(first).not.toHaveAttribute("aria-describedby");
    act(() => second!.blur());
    expect(tip).not.toBeVisible();
  });

  it("lists the same meetings as data, newest first", async () => {
    render(<EngagementTimeline timeline={timeline} now={NOW} subject="Kenya" />);
    await userEvent.click(screen.getByRole("button", { name: /show data/i }));
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[1]!.textContent)).toEqual(["Orbital debris briefing", "Spectrum sharing study visit", "Broadband mapping exchange"]);
    expect(within(rows[0]!).getAllByRole("cell")[0]).toHaveTextContent("Not yet scheduled");
    expect(within(rows[1]!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Sep 15, 2026", "Spectrum sharing study visit", "Spectrum Sharing", "12", "Confirmed"]);
  });

  it("stacks into fiscal-year groups on a narrow screen", () => {
    fakeResizeObserver(390);
    render(<EngagementTimeline timeline={timeline} now={NOW} subject="Kenya" />);
    expect(screen.queryByText("Unscheduled")).toBeNull();
    expect(screen.queryAllByRole("link").every((l) => !l.hasAttribute("aria-label"))).toBe(true);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["FY27", "FY26", "FY24"]);
    expect(screen.getByRole("link", { name: /Spectrum sharing study visit/ })).toHaveAttribute("href", "/meetings/a");
    expect(screen.getByRole("link", { name: /Orbital debris briefing/ })).toHaveTextContent("Not yet scheduled · Other");
  });

  it("says so when there is nothing to plot", () => {
    render(<EngagementTimeline timeline={{ lanes: [], meetings: [], firstFy: 2026, lastFy: 2026 }} now={NOW} subject="Kenya" />);
    expect(screen.getByText("No engagements to plot yet.")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
