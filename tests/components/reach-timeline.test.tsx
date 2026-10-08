// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TIP_GRACE_MS } from "@/components/geo/ReachMap";
import { Timeline, type TimelineProps } from "@/components/reach/Timeline";
import styles from "@/components/reach/timeline.module.css";
import { nyDate } from "@/lib/domain/fiscal-year";
import { meetingName, NO_FILTERS, type ReachMeeting } from "@/lib/domain/reach";
import { rangeSpan, type Span } from "@/lib/domain/reach-time";
import { RailSurface } from "@/lib/rail-surface";
import { markTip, rowName, type TimelineLayout, timelineLayout, timelineMeetings } from "@/lib/reach/timeline";
import { expectNoViolations } from "@/tests/a11y/axe";
import { makeReachMeeting, REACH_COUNTRIES, REACH_NOW } from "@/tests/fixtures/reach";

/* --------------------------------- fixtures ------------------------------- */

// REACH_NOW is Monday, September 28, 2026, noon in Washington.
const THIS_YEAR = rangeSpan("this", REACH_NOW);
const NEXT_30 = rangeSpan("next30", REACH_NOW);
const NEXT_7 = rangeSpan("next7", REACH_NOW);
const MARCH = { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) };
const OCTOBER = { from: nyDate(2026, 10, 1), to: nyDate(2026, 11, 1) };
/** The height the layout's own tests draw at: the full screen's timeline under its title bar. */
const HEIGHT = 126;
/** Ten in the morning in Washington on a day in 2026. */
const at10 = (month: number, day: number) => nyDate(2026, month, day, 10);
const on = (month: number, day: number, over: Partial<ReachMeeting> = {}) => makeReachMeeting({ start: at10(month, day), ...over });
const nameOf = (cca2: string) => REACH_COUNTRIES.find((c) => c.cca2 === cca2)?.name ?? cca2;
/** A box that gives every calendar day this many pixels between the 16 px margins, as the layout's own tests size it. */
const widthFor = (span: Span, perDay: number) => 32 + perDay * Math.round((span.to.getTime() - span.from.getTime()) / 86_400_000);

/** jsdom lays nothing out: this ResizeObserver reports the box a test set, the moment it observes. */
let box = { width: 0, height: 0 };
class BoxObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback([{ contentRect: box } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

/* ---------------------------------- setup --------------------------------- */

type Setup = { range: Span; perDay: number; height?: number; meetings?: ReachMeeting[]; narrow?: Span | null; focus?: string | null; locked?: boolean; lastBooked?: Date | null };

/** The timeline as the screen hands it over, inside the full screen's surfaces, and the layout it should draw. */
function renderTimeline({ range, perDay, height = HEIGHT, meetings = [], narrow = null, focus = null, locked = false, lastBooked = null }: Setup) {
  box = { width: widthFor(range, perDay), height };
  const list = timelineMeetings(meetings, NO_FILTERS, range);
  const onWindow = vi.fn();
  const onChoose = vi.fn();
  const onPoint = vi.fn();
  const props: TimelineProps = { range, window: narrow ?? range, narrowed: narrow !== null, meetings: list, now: REACH_NOW, lastBooked, focus, nameOf, onWindow, onChoose, onPoint, locked };
  const ui = (over: Partial<TimelineProps> = {}) => (
    <RailSurface value>
      <Timeline {...props} {...over} />
    </RailSurface>
  );
  const view = render(ui());
  const layout = timelineLayout({ span: range, width: box.width, height, meetings: list, now: REACH_NOW, lastBooked }) as TimelineLayout;
  /** The timeline once the screen takes a window on: null is the whole range. */
  const rewindow = (next: Span | null) => view.rerender(ui({ window: next ?? range, narrowed: next !== null }));
  /** The timeline with other props, its window as first given. */
  const restyle = (over: Partial<TimelineProps>) => view.rerender(ui(over));
  return { ...view, layout, onWindow, onChoose, onPoint, rewindow, restyle };
}

const markOf = (container: HTMLElement, m: ReachMeeting) => container.querySelector<SVGGElement>(`g[data-meeting="${m.id}"]`);
const chipOf = (m: ReachMeeting) => screen.getByRole("button", { name: meetingName(m, nameOf) });
const rowOf = (m: ReachMeeting) => screen.getByRole("button", { name: rowName(m, nameOf) });
/** The tooltip for a meeting, found by its first line: portaled to the end of the page, outside the timeline. */
const tipOf = (m: ReachMeeting) => screen.queryByText(markTip(m, nameOf)[0])?.closest<HTMLElement>(".glass") ?? null;

/**
 * The mouse on the drag window, in the box's own pixels: jsdom measures nothing, so d3 reads the
 * pointer's clientX as x. d3-brush follows a drag on the window its events name as their view,
 * which jsdom's MouseEvent will not take from its init under Vitest, so each event is given it after.
 */
const page = () => document.defaultView as Window;
function mouse(type: "mousedown" | "mousemove" | "mouseup", x: number): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 60 });
  Object.defineProperty(event, "view", { value: page() });
  return event;
}
function grab(container: HTMLElement, x: number) {
  const overlay = container.querySelector(".overlay");
  if (!overlay) throw new Error("no brush");
  fireEvent(overlay, mouse("mousedown", x));
}
const moveTo = (x: number) => fireEvent(page(), mouse("mousemove", x));
const letGo = (x: number) => fireEvent(page(), mouse("mouseup", x));

/** A drag across the timeline through these points: one point is a click. */
function drag(container: HTMLElement, path: number[]) {
  const [first = 0, ...rest] = path;
  grab(container, first);
  for (const x of rest) moveTo(x);
  letGo(path.at(-1) ?? first);
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", BoxObserver);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ---------------------------------- tests --------------------------------- */

describe("Timeline: the weeks view (This year)", () => {
  it("draws a mark per meeting where the layout puts it, the months, and Today, in an svg hidden from assistive technology", () => {
    const meetings = [on(3, 10), on(10, 6), on(10, 7, { format: "hybrid", countries: ["KE"] }), on(11, 17, { format: "virtual", countries: ["BR"] })];
    const { container, layout } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings });
    expect(layout.view).toBe("weeks");
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");

    const marks = [...container.querySelectorAll("g[data-meeting]")];
    expect(marks.map((g) => [g.getAttribute("data-meeting"), g.getAttribute("transform")])).toEqual(layout.marks.map((m) => [m.meeting.id, `translate(${m.cx},${m.cy})`]));

    const texts = [...container.querySelectorAll("svg text")];
    expect(texts.map((t) => t.textContent)).toEqual(["Jan 2026", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Today"]);
    const today = texts.at(-1);
    expect(today).toHaveAttribute("x", String((layout.today?.x ?? 0) - 5));
    expect(today).toHaveAttribute("text-anchor", "end");
    expect(today?.previousElementSibling).toHaveAttribute("x1", String(layout.today?.x));
  });

  it("tells the format by shape in the status color: a disc in person, a ring around a core hybrid, an open ring virtual", () => {
    const inPerson = on(10, 6);
    const hybrid = on(10, 6, { format: "hybrid" });
    const virtual = on(10, 6, { format: "virtual", status: "on_hold" });
    const { container, layout } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings: [inPerson, hybrid, virtual] });
    expect(layout.markSize).toBe(9);
    const circles = (m: ReachMeeting) => [...(markOf(container, m)?.querySelectorAll("circle") ?? [])].map((c) => [c.getAttribute("r"), c.getAttribute("fill"), c.getAttribute("stroke")]);
    // Each mark starts with a transparent disc a little wider, for the pointer.
    expect(circles(inPerson)).toEqual([
      ["6", "transparent", null],
      ["4.5", "var(--status-confirmed)", null],
    ]);
    expect(circles(hybrid)).toEqual([
      ["6", "transparent", null],
      ["3.8", "var(--card)", "var(--status-confirmed)"],
      ["1.8", "var(--status-confirmed)", null],
    ]);
    expect(circles(virtual)).toEqual([
      ["6", "transparent", null],
      ["3.8", "var(--card)", "var(--status-on-hold)"],
    ]);
  });

  it("says where the calendar runs out", () => {
    const { layout } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings: [on(10, 6)], lastBooked: at10(10, 6) });
    const note = screen.getByText("Nothing booked after Oct 6, 2026");
    expect(note).toHaveAttribute("x", String(layout.note?.x));
    expect(note).toHaveAttribute("y", String((layout.note?.y ?? 0) + 4));
    expect(note).toHaveAttribute("text-anchor", "middle");
  });

  it("offers the keyboard only the window's two sliders: the Details panel lists every meeting the marks show", () => {
    const { container } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings: [on(3, 10), on(10, 6)] });
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.getAllByRole("slider").map((s) => s.getAttribute("aria-label"))).toEqual(["Window start", "Window end"]);
    expect(container.querySelector("[tabindex]:not([role='slider'])")).toBeNull();
  });

  it("chooses a meeting when its mark is clicked", () => {
    const visit = on(10, 6);
    const { container, onChoose } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings: [on(10, 7), visit] });
    fireEvent.click(markOf(container, visit) as Element);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(visit);
  });

  it("draws compact marks in a strip under 80 px", () => {
    const visit = on(10, 6);
    const { container, layout } = renderTimeline({ range: THIS_YEAR, perDay: 4, height: 64, meetings: [visit] });
    expect(layout.view).toBe("compact");
    expect(markOf(container, visit)).toHaveAttribute("transform", `translate(${layout.marks[0]?.cx},${layout.marks[0]?.cy})`);
    expect(screen.getByText("Today")).toHaveAttribute("y", String(layout.top + 9));
    expect(screen.getByText("Oct")).toHaveAttribute("y", String(layout.base + 13));
  });
});

describe("Timeline: fading", () => {
  it("draws a mark at full strength in the window, a proposed one at half, one outside at a quarter, and another country's at 14% while one is lit", () => {
    const inside = on(10, 6);
    const proposed = on(10, 8, { proposed: true });
    const outside = on(11, 17);
    const kenya = on(10, 13, { countries: ["KE"] });
    const { container, restyle } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings: [inside, proposed, outside, kenya], narrow: OCTOBER });
    const opacity = (m: ReachMeeting) => markOf(container, m)?.style.opacity;
    expect([inside, proposed, outside, kenya].map(opacity)).toEqual(["1", "0.5", "0.25", "1"]);
    restyle({ focus: "KE" });
    expect([inside, proposed, outside, kenya].map(opacity)).toEqual(["0.14", "0.14", "0.14", "1"]);
  });

  it("fades chips the same way, except that a proposed chip keeps full strength in the window: its dashed border already says so", () => {
    const week = { from: nyDate(2026, 10, 5), to: nyDate(2026, 10, 10) };
    const inside = on(10, 6);
    const proposed = on(10, 7, { proposed: true });
    const outside = on(10, 13);
    const kenya = on(10, 8, { countries: ["KE"] });
    const { restyle } = renderTimeline({ range: NEXT_30, perDay: 40, meetings: [inside, proposed, outside, kenya], narrow: week });
    const opacity = (m: ReachMeeting) => chipOf(m).style.opacity;
    expect([inside, proposed, outside, kenya].map(opacity)).toEqual(["1", "1", "0.25", "1"]);
    expect(chipOf(proposed)).toHaveClass("border-dashed");
    expect(chipOf(inside)).not.toHaveClass("border-dashed");
    restyle({ focus: "KE" });
    expect([inside, proposed, outside, kenya].map(opacity)).toEqual(["0.14", "0.14", "0.14", "1"]);
  });

  it("turns a faded agenda row's text muted, never fainter, and drops its dot, flag and glyph to a quarter", () => {
    const day = { from: nyDate(2026, 9, 30), to: nyDate(2026, 10, 1) };
    const inside = on(9, 30);
    const outside = on(9, 29);
    const kenya = on(9, 30, { countries: ["KE"] });
    const { restyle } = renderTimeline({ range: NEXT_7, perDay: 200, meetings: [inside, outside, kenya], narrow: day });
    const quartered = (m: ReachMeeting) => rowOf(m).querySelectorAll(".opacity-25").length;
    expect(rowOf(inside)).toHaveClass("text-foreground");
    expect(quartered(inside)).toBe(0);
    expect(rowOf(outside)).toHaveClass("text-muted-foreground");
    expect(quartered(outside)).toBe(3);
    expect(rowOf(outside).style.opacity).toBe("");

    restyle({ focus: "KE" });
    expect(rowOf(inside)).toHaveClass("text-muted-foreground");
    expect(quartered(inside)).toBe(3);
    expect(rowOf(kenya)).toHaveClass("text-foreground");
    expect(quartered(kenya)).toBe(0);
  });
});

describe("Timeline: the days view (Next 30 days)", () => {
  it("puts a chip per meeting where the layout does, named by the whole meeting, and chooses it with a click", () => {
    const japan = on(10, 6);
    const kenya = on(10, 6, { countries: ["KE"], format: "virtual", proposed: true });
    const { layout, onChoose } = renderTimeline({ range: NEXT_30, perDay: 40, meetings: [japan, kenya] });
    expect(layout.view).toBe("days");
    expect(layout.chips).toHaveLength(2);
    for (const chip of layout.chips) expect(chipOf(chip.meeting)).toHaveStyle({ left: `${chip.left}px`, top: `${chip.top}px`, width: `${chip.width}px`, height: "16px" });
    expect(chipOf(kenya)).toHaveAccessibleName("Kenya, Ministry of Internal Affairs and Communications, Oct 6, 2026, proposed, Virtual, Confirmed");
    expect(chipOf(kenya).querySelector("svg[data-format='virtual']")).not.toBeNull();
    fireEvent.click(chipOf(kenya));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(kenya);
  });

  it("shows a chip's flag alone once the chip is too narrow to hold its format glyph inside its border", () => {
    const visit = on(10, 6, { format: "hybrid" });
    const narrow = renderTimeline({ range: NEXT_30, perDay: 38, meetings: [visit] });
    expect(narrow.layout.chips[0]?.width).toBe(32);
    expect(chipOf(visit).querySelector("svg[data-format]")).toBeNull();
    expect(chipOf(visit).getAttribute("aria-label")).toContain("Hybrid");
    cleanup();

    const roomy = renderTimeline({ range: NEXT_30, perDay: 40, meetings: [visit] });
    expect(roomy.layout.chips[0]?.width).toBe(34);
    expect(chipOf(visit).querySelector("svg[data-format='hybrid']")).not.toBeNull();
  });

  it("lights a chip's first country while the pointer or focus is on it, puts it out after, and lights nothing for a visit with no foreign country", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const visit = on(10, 6, { countries: ["KE", "JP"] });
    const home = on(10, 7, { countries: [] });
    const { onPoint } = renderTimeline({ range: NEXT_30, perDay: 40, meetings: [visit, home] });

    fireEvent.pointerEnter(chipOf(visit));
    expect(onPoint).toHaveBeenLastCalledWith("KE");
    fireEvent.pointerLeave(chipOf(visit));
    act(() => {
      vi.advanceTimersByTime(TIP_GRACE_MS);
    });
    expect(onPoint).toHaveBeenLastCalledWith(null);

    act(() => chipOf(visit).focus());
    expect(onPoint).toHaveBeenLastCalledWith("KE");
    act(() => chipOf(visit).blur());
    expect(onPoint).toHaveBeenLastCalledWith(null);

    onPoint.mockClear();
    fireEvent.pointerEnter(chipOf(home));
    expect(onPoint).toHaveBeenCalledExactlyOnceWith(null);
    expect(tipOf(home)).not.toBeNull();
  });

  it("opens a crowded day from its +N, which the keyboard reaches after that day's chips", () => {
    const busy = Array.from({ length: 7 }, (_, i) => on(10, 6, { countries: [i % 2 ? "KE" : "JP"] }));
    const later = on(10, 9);
    const { layout, onWindow } = renderTimeline({ range: NEXT_30, perDay: 40, meetings: [...busy, later] });
    // The column holds five: four chips and the +3.
    expect(layout.chips).toHaveLength(5);
    const more = screen.getByRole("button", { name: "+3 more on Oct 6, 2026" });
    expect(more).toHaveTextContent(/^\+3$/);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([...layout.chips.slice(0, 4).map((c) => meetingName(c.meeting, nameOf)), "+3 more on Oct 6, 2026", meetingName(later, nameOf)]);

    fireEvent.click(more);
    expect(onWindow).toHaveBeenCalledExactlyOnceWith({ from: nyDate(2026, 10, 6), to: nyDate(2026, 10, 7) }, { live: false });
  });
});

describe("Timeline: the agenda (Next 7 days)", () => {
  it("heads each day with a button that narrows the window to that day, pressed while that day is the window, and gives the range back", () => {
    const { onWindow, rewindow } = renderTimeline({ range: NEXT_7, perDay: 200, meetings: [on(9, 29)] });
    expect(screen.getAllByRole("button", { pressed: false }).map((b) => b.textContent)).toEqual(["Today · Mon, Sep 28", "Tue, Sep 29", "Wed, Sep 30", "Thu, Oct 1", "Fri, Oct 2", "Sat, Oct 3", "Sun, Oct 4"]);

    fireEvent.click(screen.getByRole("button", { name: "Tue, Sep 29" }));
    expect(onWindow).toHaveBeenLastCalledWith({ from: nyDate(2026, 9, 29), to: nyDate(2026, 9, 30) }, { live: false });

    rewindow({ from: nyDate(2026, 9, 29), to: nyDate(2026, 9, 30) });
    expect(screen.getByRole("button", { name: "Tue, Sep 29" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Wed, Sep 30" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Tue, Sep 29" }));
    expect(onWindow).toHaveBeenLastCalledWith(null, { live: false });

    // A window that only holds the day does not press it.
    rewindow({ from: nyDate(2026, 9, 29), to: nyDate(2026, 10, 1) });
    expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);
  });

  it("lists each day's meetings as rows named first by what they show, opens their tooltip on focus, and says so when a day is empty", () => {
    const morning = on(9, 29, { format: "hybrid", countries: ["JP", "KE"], status: "developing" });
    const afternoon = makeReachMeeting({ start: nyDate(2026, 9, 29, 14), countries: ["BR"], proposed: true });
    const { layout, onChoose, onPoint } = renderTimeline({ range: NEXT_7, perDay: 200, meetings: [afternoon, morning] });
    expect(layout.view).toBe("agenda");
    expect(rowOf(morning)).toHaveAccessibleName("10:00 AM, Japan and Kenya, Ministry of Internal Affairs and Communications, Sep 29, 2026, Hybrid, Developing");
    expect(rowOf(morning)).toHaveTextContent("10:00 AMJapan +1");
    expect(rowOf(afternoon)).toHaveStyle({ left: `${layout.days[1]?.left}px`, top: `${layout.days[1]?.rows[1]?.top}px`, width: `${layout.days[1]?.width}px` });
    // A proposed date's dot is a hollow ring.
    expect(rowOf(afternoon).firstElementChild?.getAttribute("style")).toContain("inset");
    expect(rowOf(morning).firstElementChild?.getAttribute("style")).not.toContain("inset");

    fireEvent.click(rowOf(afternoon));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(afternoon);
    act(() => rowOf(morning).focus());
    expect(tipOf(morning)).not.toBeNull();
    expect(onPoint).toHaveBeenLastCalledWith("JP");

    expect(screen.getAllByText("Nothing scheduled")).toHaveLength(6);
  });

  it("opens a day with more meetings than its column holds from its +N more", () => {
    const { onWindow } = renderTimeline({ range: NEXT_7, perDay: 200, meetings: Array.from({ length: 8 }, () => on(10, 1)) });
    const more = screen.getByRole("button", { name: "+3 more on Oct 1, 2026" });
    expect(more).toHaveTextContent("+3 more");
    fireEvent.click(more);
    expect(onWindow).toHaveBeenCalledExactlyOnceWith({ from: nyDate(2026, 10, 1), to: nyDate(2026, 10, 2) }, { live: false });
  });
});

describe("Timeline: the window sliders", () => {
  it("names the window's edges and values them in days from the range's first, with the date in words; their grips show once the window is narrowed", () => {
    const { layout, rewindow } = renderTimeline({ range: THIS_YEAR, perDay: 4 });
    const start = screen.getByRole("slider", { name: "Window start" });
    const end = screen.getByRole("slider", { name: "Window end" });
    const values = (slider: HTMLElement) => ["aria-orientation", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"].map((a) => slider.getAttribute(a));
    expect(values(start)).toEqual(["horizontal", "0", "364", "0", "Jan 1, 2026"]);
    expect(values(end)).toEqual(["horizontal", "0", "364", "364", "Dec 31, 2026"]);
    expect(start.firstElementChild).toHaveClass("opacity-0");

    rewindow(MARCH);
    expect(values(start)).toEqual(["horizontal", "0", "364", "59", "Mar 1, 2026"]);
    expect(values(end)).toEqual(["horizontal", "0", "364", "89", "Mar 31, 2026"]);
    expect(start).toHaveStyle({ left: `${layout.scale.x(MARCH.from) - 6}px`, top: `${layout.top}px`, width: "12px", height: `${layout.base - layout.top}px` });
    expect(end).toHaveStyle({ left: `${layout.scale.x(MARCH.to) - 6}px` });
    expect(start.firstElementChild).toHaveClass("opacity-100");
    expect(start).toHaveAttribute("tabindex", "0");
    expect(start).not.toHaveAttribute("aria-disabled");
  });

  it("moves an edge a week with the arrows in the weeks view, a month with Page Up and Page Down, and to the range's ends with Home and End", () => {
    const { onWindow } = renderTimeline({ range: THIS_YEAR, perDay: 4, narrow: MARCH });
    const start = screen.getByRole("slider", { name: "Window start" });
    const end = screen.getByRole("slider", { name: "Window end" });
    const press = (slider: HTMLElement, key: string) => {
      const prevented = !fireEvent.keyDown(slider, { key });
      return [prevented, onWindow.mock.lastCall];
    };
    expect(press(start, "ArrowRight")).toEqual([true, [{ from: nyDate(2026, 3, 8), to: MARCH.to }, { live: false }]]);
    expect(press(end, "ArrowLeft")).toEqual([true, [{ from: MARCH.from, to: nyDate(2026, 3, 25) }, { live: false }]]);
    expect(press(end, "PageUp")).toEqual([true, [{ from: MARCH.from, to: nyDate(2026, 5, 1) }, { live: false }]]);
    expect(press(start, "PageDown")).toEqual([true, [{ from: nyDate(2026, 2, 1), to: MARCH.to }, { live: false }]]);
    expect(press(start, "Home")).toEqual([true, [{ from: THIS_YEAR.from, to: MARCH.to }, { live: false }]]);
    expect(press(end, "End")).toEqual([true, [{ from: MARCH.from, to: THIS_YEAR.to }, { live: false }]]);
  });

  it("moves an edge a day at a time in the day views, hands the whole range back as null, and lets other keys pass", () => {
    const narrow = { from: nyDate(2026, 10, 4), to: nyDate(2026, 10, 9) };
    const { onWindow, rewindow } = renderTimeline({ range: NEXT_30, perDay: 40, narrow });
    const start = screen.getByRole("slider", { name: "Window start" });
    const end = screen.getByRole("slider", { name: "Window end" });
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(onWindow).toHaveBeenLastCalledWith({ from: nyDate(2026, 10, 5), to: narrow.to }, { live: false });
    fireEvent.keyDown(end, { key: "ArrowDown" });
    expect(onWindow).toHaveBeenLastCalledWith({ from: narrow.from, to: nyDate(2026, 10, 8) }, { live: false });

    onWindow.mockClear();
    for (const key of ["a", "Tab", "Enter", " "]) expect(fireEvent.keyDown(start, { key })).toBe(true);
    expect(onWindow).not.toHaveBeenCalled();

    rewindow({ from: nyDate(2026, 9, 29), to: NEXT_30.to });
    expect(fireEvent.keyDown(start, { key: "ArrowLeft" })).toBe(false);
    expect(onWindow).toHaveBeenLastCalledWith(null, { live: false });
  });

  it("while Replay has the window, says the sliders are disabled, ignores their keys, and takes the brush from the pointer", () => {
    const { container, onWindow } = renderTimeline({ range: THIS_YEAR, perDay: 4, narrow: MARCH, locked: true });
    for (const slider of screen.getAllByRole("slider")) {
      expect(slider).toHaveAttribute("aria-disabled", "true");
      for (const key of ["ArrowRight", "ArrowLeft", "Home", "End", "PageUp"]) expect(fireEvent.keyDown(slider, { key })).toBe(true);
    }
    expect(onWindow).not.toHaveBeenCalled();
    const classes = [styles.brush, styles.locked].filter((c): c is string => Boolean(c));
    expect(classes).toHaveLength(2);
    expect(container.querySelector(".overlay")?.parentElement).toHaveClass(...classes);
  });
});

describe("Timeline: dragging the window", () => {
  it("reports the window live while a drag moves, then the window it ends on, either way across", () => {
    const { container, layout, onWindow } = renderTimeline({ range: THIS_YEAR, perDay: 4 });
    const span = (a: number, b: number) => ({ from: layout.scale.invert(a), to: layout.scale.invert(b) });
    drag(container, [256, 300, 376]);
    expect(onWindow.mock.calls).toEqual([
      [span(256, 300), { live: true }],
      [span(256, 376), { live: true }],
      [span(256, 376), { live: false }],
    ]);
    // The weeks view keeps the drag's own instants: here, March 2 to April 1.
    expect(onWindow.mock.lastCall?.[0]).toEqual({ from: nyDate(2026, 3, 2), to: nyDate(2026, 4, 1) });

    onWindow.mockClear();
    drag(container, [376, 300, 256]);
    expect(onWindow.mock.calls).toEqual([
      [span(300, 376), { live: true }],
      [span(256, 376), { live: true }],
      [span(256, 376), { live: false }],
    ]);
  });

  it("snaps a drag in a day view to whole days when it ends, and moves the drag window there", () => {
    const { container, onWindow } = renderTimeline({ range: NEXT_30, perDay: 40 });
    // From 6.325 days into the range to 11.675: Oct 4 at 7:48 AM to Oct 9 at 4:12 PM.
    drag(container, [269, 483]);
    expect(onWindow.mock.calls.map(([, options]) => options)).toEqual([{ live: true }, { live: false }]);
    expect(onWindow.mock.calls[0]?.[0]).toEqual({ from: nyDate(2026, 10, 4, 7, 48), to: nyDate(2026, 10, 9, 16, 12) });
    expect(onWindow.mock.lastCall?.[0]).toEqual({ from: nyDate(2026, 10, 4), to: nyDate(2026, 10, 10) });
    const selection = container.querySelector(".selection");
    expect(selection).toHaveAttribute("x", "256");
    expect(selection).toHaveAttribute("width", "240");
  });

  it("gives the whole range back on a click without a drag, and on a drag across all of it", () => {
    const { container, layout, onWindow } = renderTimeline({ range: THIS_YEAR, perDay: 4, narrow: MARCH });
    drag(container, [600]);
    expect(onWindow.mock.calls).toEqual([[null, { live: false }]]);

    onWindow.mockClear();
    drag(container, [layout.left, layout.right]);
    expect(onWindow.mock.calls).toEqual([
      [null, { live: true }],
      [null, { live: false }],
    ]);
  });

  it("keeps the drag window on the window it is given, and clear while the range is whole", () => {
    const { container, layout, rewindow } = renderTimeline({ range: THIS_YEAR, perDay: 4, narrow: MARCH });
    const selection = () => container.querySelector(".selection");
    expect(selection()).toHaveAttribute("x", String(layout.scale.x(MARCH.from)));
    expect(selection()).toHaveAttribute("width", String(layout.scale.x(MARCH.to) - layout.scale.x(MARCH.from)));
    rewindow(null);
    expect(selection()).toHaveStyle({ display: "none" });
    rewindow(OCTOBER);
    expect(selection()).not.toHaveStyle({ display: "none" });
    expect(selection()).toHaveAttribute("x", String(layout.scale.x(OCTOBER.from)));
  });

  it("never pulls the drag window from under a reader who is dragging it", () => {
    const { container, layout, onWindow, rewindow } = renderTimeline({ range: THIS_YEAR, perDay: 4 });
    const selection = () => container.querySelector(".selection");
    grab(container, 256);
    moveTo(300);
    rewindow(OCTOBER);
    expect(selection()).toHaveAttribute("x", "256");
    expect(selection()).toHaveAttribute("width", "44");
    letGo(300);

    // The screen takes the drag's window on: the drag window stays where the drag left it.
    rewindow(onWindow.mock.lastCall?.[0] ?? null);
    expect(selection()).toHaveAttribute("x", "256");
    expect(selection()).toHaveAttribute("width", "44");
    rewindow(MARCH);
    expect(selection()).toHaveAttribute("x", String(layout.scale.x(MARCH.from)));
  });
});

describe("Timeline: the tooltip", () => {
  it("shows a mark's meeting in three lines, portaled out of the panel, hidden from assistive technology, in the surface's colors", () => {
    const visit = on(10, 6, { countries: ["JP", "KE"], proposed: true });
    const { container, onPoint } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings: [visit] });
    expect(tipOf(visit)).toBeNull();
    fireEvent.pointerEnter(markOf(container, visit) as Element);

    const tip = tipOf(visit);
    expect(tip?.parentElement).toBe(document.body);
    expect(tip).toHaveAttribute("aria-hidden", "true");
    expect(tip).toHaveAttribute("data-rail-surface", "");
    expect(tip).toHaveClass("fixed");
    const lines = [...(tip?.querySelectorAll("p") ?? [])];
    expect(lines.map((p) => p.textContent)).toEqual(["Japan, Kenya · Oct 6, 2026 (proposed)", "Ministry of Internal Affairs and Communications · 10:00 AM ET", "In person·Confirmed"]);
    expect(lines[2]?.querySelector("svg[data-format='in_person']")).not.toBeNull();
    expect(lines[2]?.querySelector(".bg-status-confirmed")).not.toBeNull();
    expect(onPoint).toHaveBeenLastCalledWith("JP");
  });

  it("lets the pointer travel onto it, and closes a moment after the pointer leaves", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const visit = on(10, 6);
    const { container, onPoint } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings: [visit] });
    const mark = markOf(container, visit) as Element;

    fireEvent.pointerEnter(mark);
    fireEvent.pointerLeave(mark);
    act(() => {
      vi.advanceTimersByTime(TIP_GRACE_MS - 1);
    });
    expect(tipOf(visit)).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(tipOf(visit)).toBeNull();
    expect(onPoint).toHaveBeenLastCalledWith(null);

    fireEvent.pointerEnter(mark);
    fireEvent.pointerLeave(mark);
    fireEvent.pointerEnter(tipOf(visit) as Element);
    act(() => {
      vi.advanceTimersByTime(TIP_GRACE_MS * 2);
    });
    expect(tipOf(visit)).not.toBeNull();
    expect(onPoint).toHaveBeenLastCalledWith("JP");
    fireEvent.pointerLeave(tipOf(visit) as Element);
    expect(tipOf(visit)).toBeNull();
    expect(onPoint).toHaveBeenLastCalledWith(null);
  });

  it("closes on Escape and keeps that Escape from the screen; with no tooltip open, Escape passes", () => {
    const visit = on(10, 6);
    const { container, onPoint } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings: [visit] });
    fireEvent.pointerEnter(markOf(container, visit) as Element);
    expect(fireEvent.keyDown(document.body, { key: "Escape" })).toBe(false);
    expect(tipOf(visit)).toBeNull();
    expect(onPoint).toHaveBeenLastCalledWith(null);
    expect(fireEvent.keyDown(document.body, { key: "Escape" })).toBe(true);
  });

  it("opens when a chip takes focus and closes when it leaves", () => {
    const visit = on(10, 6);
    renderTimeline({ range: NEXT_30, perDay: 40, meetings: [visit] });
    act(() => chipOf(visit).focus());
    expect(tipOf(visit)).not.toBeNull();
    act(() => chipOf(visit).blur());
    expect(tipOf(visit)).toBeNull();
  });

  it("sits 8 px above what it describes, centered on it, and 8 px inside the viewport", () => {
    const visit = on(10, 6);
    renderTimeline({ range: NEXT_30, perDay: 40, meetings: [visit] });
    const chip = chipOf(visit);
    let anchor = { left: 600, top: 700, width: 34, height: 16 };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const r = this === chip ? anchor : this.classList.contains("glass") ? { left: 0, top: 0, width: 200, height: 60 } : { left: 0, top: 0, width: 0, height: 0 };
      return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r } as DOMRect;
    });
    const place = () => {
      act(() => chip.focus());
      const tip = tipOf(visit);
      const at = [tip?.style.left, tip?.style.top];
      act(() => chip.blur());
      return at;
    };
    // jsdom's viewport is 1024 px wide.
    expect(place()).toEqual(["517px", "632px"]);
    anchor = { left: 1000, top: 700, width: 34, height: 16 };
    expect(place()).toEqual(["816px", "632px"]);
    anchor = { left: 0, top: 20, width: 34, height: 16 };
    expect(place()).toEqual(["8px", "8px"]);
  });
});

describe("Timeline: edges", () => {
  it("draws nothing into a box too small to read", () => {
    box = { width: 40, height: HEIGHT };
    const { container } = render(<Timeline range={THIS_YEAR} window={THIS_YEAR} narrowed={false} meetings={[]} now={REACH_NOW} lastBooked={null} focus={null} nameOf={nameOf} onWindow={vi.fn()} onChoose={vi.fn()} onPoint={vi.fn()} />);
    expect(container.firstElementChild).toBeEmptyDOMElement();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});

describe("Timeline: accessibility", () => {
  it("has no axe violations in the weeks view", async () => {
    const { container } = renderTimeline({ range: THIS_YEAR, perDay: 4, meetings: [on(3, 10), on(10, 6, { format: "hybrid" }), on(10, 7, { format: "virtual", proposed: true })], narrow: OCTOBER, lastBooked: at10(10, 7) });
    await expectNoViolations(container);
  });

  it("has no axe violations in the days view, with a proposed chip and a crowded day", async () => {
    const busy = Array.from({ length: 7 }, (_, i) => on(10, 6, { countries: [i % 2 ? "KE" : "JP"], proposed: i === 0 }));
    const { container } = renderTimeline({ range: NEXT_30, perDay: 40, meetings: [...busy, on(10, 9, { format: "virtual" })], narrow: { from: nyDate(2026, 10, 5), to: nyDate(2026, 10, 12) } });
    await expectNoViolations(container);
  });

  it("has no axe violations in the agenda, with a day pressed", async () => {
    const meetings = [on(9, 29, { proposed: true }), on(9, 29, { countries: ["KE"], format: "hybrid" }), ...Array.from({ length: 8 }, () => on(10, 1))];
    const { container } = renderTimeline({ range: NEXT_7, perDay: 200, meetings, narrow: { from: nyDate(2026, 9, 29), to: nyDate(2026, 9, 30) } });
    await expectNoViolations(container);
  });
});
