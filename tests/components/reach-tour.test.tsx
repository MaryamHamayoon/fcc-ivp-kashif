// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { NOTHING_TO_TOUR, Tour, TourButton } from "@/components/reach/Tour";
import { STOP_MS, useTour } from "@/components/reach/useTour";
import { type ReachCountry, type ReachMeeting, travelText } from "@/lib/domain/reach";
import { expectNoViolations } from "@/tests/a11y/axe";
import { makeReachMeeting, REACH_COUNTRIES, REACH_NOW } from "@/tests/fixtures/reach";

/* --------------------------------- doubles -------------------------------- */

const reduce = vi.hoisted(() => ({ value: false as boolean | null }));
vi.mock("@/lib/motion", () => ({ useReducedMotion: () => reduce.value, reducedMotionNow: () => reduce.value === true, motionTransition: (t: unknown) => (reduce.value ? { duration: 0 } : t) }));

/* --------------------------------- fixtures ------------------------------- */

const COUNTRIES = new Map(REACH_COUNTRIES.map((c) => [c.cca2, c]));

function country(cca2: string): ReachCountry {
  const c = COUNTRIES.get(cca2);
  if (!c) throw new Error(`no fixture for ${cca2}`);
  return c;
}

// REACH_NOW is Monday, September 28, 2026, noon in Washington.
const at = (iso: string) => new Date(iso);

/**
 * Three visits, soonest first: Japan with Kenya in person, 10:30 PM on Tuesday, October 6 in
 * Washington (already Wednesday in UTC); Brazil by video on a proposed date with no OIA lead yet;
 * Japan again, hybrid.
 */
function visits(): [ReachMeeting, ReachMeeting, ReachMeeting] {
  return [
    makeReachMeeting({ id: "v1", countries: ["JP", "KE"], start: at("2026-10-07T02:30:00Z"), readiness: 80, waiting: { who: "expert", label: "FCC expert", businessDays: 6, band: "warn" } }),
    makeReachMeeting({ id: "v2", countries: ["BR"], region: "Americas", start: at("2026-10-12T14:00:00Z"), format: "virtual", status: "developing", proposed: true, lead: null, orgName: "Anatel", readiness: 40 }),
    makeReachMeeting({ id: "v3", countries: ["JP"], start: at("2026-11-02T15:00:00Z"), format: "hybrid", readiness: 90 }),
  ];
}

/** The screen in miniature: a search field, the strip's button, and the tour it starts. */
function Harness({ stops, onEnd }: { stops: readonly ReachMeeting[]; onEnd?: () => void }) {
  const tour = useTour();
  const end = () => {
    onEnd?.();
    tour.end();
  };
  return (
    <>
      <input aria-label="Find a country or organization" />
      <div role="textbox" contentEditable aria-label="Notes" />
      <TourButton count={stops.length} onStart={() => tour.start(stops)} />
      <Tour tour={tour} countries={COUNTRIES} now={REACH_NOW} onEnd={end} />
    </>
  );
}

/* ---------------------------------- setup --------------------------------- */

/** Renders the harness and starts the tour from the strip's button, as a reader would. */
function startTour(stops: readonly ReachMeeting[] = visits(), onEnd?: () => void) {
  const view = render(<Harness stops={stops} onEnd={onEnd} />);
  fireEvent.click(screen.getByRole("button", { name: "Tour" }));
  return view;
}

const card = () => screen.getByRole("region", { name: "Tour" });
const pill = () => screen.getByText("International Visitors Program").parentElement as HTMLElement;
const pauseButton = () => screen.getByRole("button", { name: "Pause the tour" });
/** A key pressed wherever focus is; false when the tour took it. */
const press = (key: string, target: Element = document.activeElement ?? document.body) => fireEvent.keyDown(target, { key });
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const line = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-progress]");

beforeEach(() => {
  reduce.value = false;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* ---------------------------------- tests --------------------------------- */

describe("the tour", () => {
  it("renders nothing until a tour runs", () => {
    const { result } = renderHook(() => useTour());
    const { container } = render(<Tour tour={result.current} countries={COUNTRIES} now={REACH_NOW} onEnd={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tells a visit in its caption: the date in Washington time, every country, the organization, where it stands, how they come, how soon, and who leads it", () => {
    const stops = visits();
    startTour(stops);
    const region = within(card());
    // 10:30 PM on Tuesday in Washington is Wednesday in UTC; the card keeps the program's clock.
    expect(region.getByText("Tue")).toBeInTheDocument();
    expect(region.getByText("6")).toBeInTheDocument();
    expect(region.getByText("Oct")).toBeInTheDocument();
    expect(region.getByText("Tuesday, October 6")).toHaveClass("sr-only");
    expect(region.getByRole("heading", { level: 2, name: "Japan, Kenya" })).toBeInTheDocument();
    expect(region.getByText("Ministry of Internal Affairs and Communications")).toBeInTheDocument();
    expect(region.getByText("Confirmed")).toBeInTheDocument();
    expect(region.getByText("80%").parentElement).toHaveTextContent("80% ready");
    expect(region.getByText(/^Waiting on FCC expert/)).toHaveTextContent("Waiting on FCC expert · 6d, 6 business days");

    const detail = travelText(stops[0], country("JP")).detail;
    expect(detail).toMatch(/^traveling about [\d,]+ miles to Washington$/);
    expect(region.getByText("In person").parentElement).toHaveTextContent(`In person · ${detail} · in 8 days · OIA lead Dana Whitfield`);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("says when a date is only proposed, when no OIA lead is named yet, and how a hybrid visit comes", () => {
    const stops = visits();
    startTour(stops);
    press("ArrowRight");
    const brazil = within(card());
    expect(brazil.getByRole("heading", { level: 2, name: "Brazil" })).toBeInTheDocument();
    expect(brazil.getByText("By video").parentElement).toHaveTextContent("By video · in 14 days (proposed) · OIA lead to be named");

    press("ArrowRight");
    const hybrid = travelText(stops[2], country("JP")).detail;
    expect(hybrid).toMatch(/^in the room and by video, about [\d,]+ miles from Washington$/);
    expect(within(card()).getByText("Hybrid").parentElement).toHaveTextContent(`Hybrid · ${hybrid} · in 35 days · OIA lead Dana Whitfield`);
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
  });

  it("heads the tour with the program's name, the window and its keys, and End tour ends it", () => {
    const onEnd = vi.fn();
    startTour(visits(), onEnd);
    const top = within(pill());
    expect(top.getByText("The next 90 days")).toBeInTheDocument();
    expect(top.getByText("←").tagName).toBe("KBD");
    expect(top.getByText("Space").tagName).toBe("KBD");
    fireEvent.click(top.getByRole("button", { name: "End tour" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  });

  it("moves on by itself after STOP_MS a visit, and waits on the summary", () => {
    vi.useFakeTimers();
    startTour();
    advance(STOP_MS - 1);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    advance(1);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    // One visit per step: each timer is armed once the visit before it has rendered.
    advance(STOP_MS);
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    advance(STOP_MS);
    expect(screen.getByRole("heading", { level: 2, name: "3 visits from 3 countries" })).toBeInTheDocument();
    advance(STOP_MS * 10);
    expect(screen.getByRole("heading", { level: 2, name: "3 visits from 3 countries" })).toBeInTheDocument();
  });

  it("holds a visit while paused, and on resuming runs only the time it had left", () => {
    vi.useFakeTimers();
    startTour();
    advance(3000);
    fireEvent.click(pauseButton());
    expect(pauseButton()).toHaveAttribute("aria-pressed", "true");
    advance(STOP_MS * 4);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();

    fireEvent.click(pauseButton());
    expect(pauseButton()).toHaveAttribute("aria-pressed", "false");
    advance(STOP_MS - 3000 - 1);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    advance(1);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("pauses and resumes on Space from outside the card's controls, the same way, and takes the key", () => {
    vi.useFakeTimers();
    startTour();
    advance(2000);
    expect(press(" ", document.body)).toBe(false);
    expect(pauseButton()).toHaveAttribute("aria-pressed", "true");
    advance(STOP_MS * 2);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();

    expect(press(" ", document.body)).toBe(false);
    expect(pauseButton()).toHaveAttribute("aria-pressed", "false");
    advance(STOP_MS - 2000);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("keeps a pause across a move: the next visit waits too, with its full time ahead of it", () => {
    vi.useFakeTimers();
    startTour();
    advance(5000);
    press(" ", document.body);
    press("ArrowRight");
    advance(STOP_MS * 2);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(pauseButton()).toHaveAttribute("aria-pressed", "true");
    press(" ", document.body);
    advance(STOP_MS - 1);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    advance(1);
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
  });

  it("moves with ← and →, which never reach the map, and Previous is disabled on the first visit", () => {
    startTour();
    const previous = screen.getByRole("button", { name: "Previous visit" });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(previous);
    expect(press("ArrowLeft")).toBe(false);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();

    const below = vi.fn();
    document.addEventListener("keydown", below);
    expect(press("ArrowRight")).toBe(false);
    document.removeEventListener("keydown", below);
    expect(below).not.toHaveBeenCalled();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous visit" })).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(screen.getByRole("button", { name: "Next visit" }));
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous visit" }));
    press("ArrowLeft");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("sums the tour up past its last visit, with its three counts, and Done ends it", () => {
    const onEnd = vi.fn();
    startTour(visits(), onEnd);
    for (let i = 0; i < 4; i += 1) press("ArrowRight");
    const summary = within(card());
    expect(summary.getByRole("heading", { level: 2, name: "3 visits from 3 countries" })).toBeInTheDocument();
    expect(["Next", "90", "days"].map((text) => summary.getByText(text))).toHaveLength(3);
    expect(summary.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1In person", "1Hybrid", "1Virtual"]);
    expect(summary.getByText("2 confirmed · 1 waiting on someone · 2 at least 80% ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause the tour" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next visit" })).toBeNull();

    fireEvent.click(summary.getByRole("button", { name: "Previous visit" }));
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    press("ArrowRight");
    fireEvent.click(within(card()).getByRole("button", { name: "Done" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  });

  it("leaves Space to a focused button, which it presses there as anywhere", () => {
    startTour();
    for (const name of ["Pause the tour", "Next visit", "End tour"]) {
      screen.getByRole("button", { name }).focus();
      expect(press(" ")).toBe(true);
    }
    expect(pauseButton()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("leaves Space to the focused control on the summary, where there is nothing to pause", () => {
    startTour();
    for (let i = 0; i < 3; i += 1) press("ArrowRight");
    expect(press(" ")).toBe(true);
    press("ArrowLeft");
    expect(pauseButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("ends on Escape, and marks the key handled so the screen's own Escape leaves it alone", () => {
    const onEnd = vi.fn();
    startTour(visits(), onEnd);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(document.activeElement ?? document.body, escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
    // With the tour over, the keys are the page's again.
    expect(press("Escape")).toBe(true);
    expect(press("ArrowRight")).toBe(true);
  });

  it("leaves keys typed into a field to the field", () => {
    const onEnd = vi.fn();
    startTour(visits(), onEnd);
    for (const name of ["Find a country or organization", "Notes"]) {
      const field = screen.getByRole("textbox", { name });
      for (const key of ["ArrowRight", " ", "Escape"]) expect(press(key, field)).toBe(true);
    }
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(pauseButton()).toHaveAttribute("aria-pressed", "false");
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("ignores keys held with a modifier, so browser shortcuts such as Alt+← still work", () => {
    startTour();
    expect(fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowRight", altKey: true })).toBe(true);
    expect(fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowRight", metaKey: true })).toBe(true);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("moves focus to Pause the tour as it opens, and hands focus on when the control that had it goes", () => {
    startTour();
    expect(pauseButton()).toHaveFocus();
    press("ArrowRight");
    press("ArrowRight");
    expect(pauseButton()).toHaveFocus();
    press("ArrowRight"); // the summary has no Pause
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
    press("ArrowLeft"); // and the last visit has no Done
    expect(pauseButton()).toHaveFocus();
  });

  it("leaves focus alone when it is outside the card", () => {
    startTour();
    const end = within(pill()).getByRole("button", { name: "End tour" });
    end.focus();
    for (let i = 0; i < 3; i += 1) press("ArrowRight");
    expect(end).toHaveFocus();
  });

  it("speaks each visit through a polite live region that holds the caption but not the controls", () => {
    vi.useFakeTimers();
    startTour();
    const live = card().querySelector('[aria-live="polite"]');
    expect(live).toHaveAttribute("aria-atomic", "true");
    expect(live).toContainElement(screen.getByRole("heading", { level: 2, name: "Japan, Kenya" }));
    expect(live).not.toContainElement(pauseButton());
    // The first visit is announced a moment after the region appears, so it is heard at all.
    expect(live).not.toHaveTextContent("Visit 1 of 3.");
    advance(500);
    expect(live).toHaveTextContent("Visit 1 of 3.");
    press("ArrowRight");
    expect(live).toHaveTextContent("Visit 2 of 3.");
  });

  it("draws a progress line that fills over the visit and holds while paused", () => {
    const { container } = startTour();
    expect(line(container)?.style.animationDuration).toBe(`${STOP_MS}ms`);
    expect(line(container)?.style.animationPlayState).toBe("running");
    fireEvent.click(pauseButton());
    expect(line(container)?.style.animationPlayState).toBe("paused");
    for (let i = 0; i < 3; i += 1) press("ArrowRight");
    expect(line(container)).toBeNull();
  });

  it("leaves the progress line out under reduced motion", () => {
    reduce.value = true;
    const { container } = startTour();
    expect(card()).toBeInTheDocument();
    expect(line(container)).toBeNull();
  });

  it("keeps the progress line in the markup until the preference is known", () => {
    reduce.value = null;
    const { container } = startTour();
    expect(line(container)).not.toBeNull();
  });

  it("has no axe violations on a visit or on the summary", async () => {
    const { container } = startTour();
    await expectNoViolations(container);
    for (let i = 0; i < 3; i += 1) press("ArrowRight");
    await expectNoViolations(container);
  });
});

describe("TourButton", () => {
  it("starts a tour, and is no toggle: the strip it sits in slides away while the tour runs", () => {
    const onStart = vi.fn();
    render(<TourButton count={3} onStart={onStart} />);
    const tour = screen.getByRole("button", { name: "Tour" });
    expect(tour).not.toHaveAttribute("aria-pressed");
    expect(tour).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(tour);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("with nothing to tour, stays focusable, does nothing, and says why", () => {
    const onStart = vi.fn();
    render(<TourButton count={0} onStart={onStart} />);
    const button = screen.getByRole("button", { name: "Tour" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleDescription(NOTHING_TO_TOUR);
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("hands its button to a ref, so focus can come back to it when a tour ends", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<TourButton ref={ref} count={3} onStart={() => {}} />);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Tour" }));
  });

  it("has no axe violations, enabled or not", async () => {
    const { container, rerender } = render(<TourButton count={0} onStart={() => {}} />);
    await expectNoViolations(container);
    rerender(<TourButton count={4} onStart={() => {}} />);
    await expectNoViolations(container);
  });
});

describe("useTour", () => {
  it("does nothing when there is nothing to tour", () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.start([]));
    expect(result.current.active).toBe(false);
  });

  it("keeps its own copy of the visits, so the list it was handed can change under it", () => {
    const list = visits();
    const { result } = renderHook(() => useTour());
    act(() => result.current.start(list));
    list.reverse();
    list.pop();
    expect(result.current.stops.map((m) => m.id)).toEqual(["v1", "v2", "v3"]);
  });

  it("keeps go between the first visit and the summary", () => {
    const { result } = renderHook(() => useTour());
    act(() => result.current.start(visits()));
    act(() => result.current.go(99));
    expect(result.current.index).toBe(3);
    act(() => result.current.go(-4));
    expect(result.current.index).toBe(0);
    act(() => result.current.go(2));
    expect(result.current.index).toBe(2);
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.index).toBe(3);
  });

  it("has nothing to pause on the summary, and counts nothing down there", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTour());
    act(() => result.current.start(visits()));
    act(() => result.current.go(3));
    act(() => result.current.togglePause());
    expect(result.current.paused).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer when the tour ends, and when the page goes away mid-visit", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useTour());
    act(() => result.current.start(visits()));
    expect(vi.getTimerCount()).toBe(1);
    act(() => result.current.end());
    expect(result.current.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    act(() => result.current.start(visits()));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
