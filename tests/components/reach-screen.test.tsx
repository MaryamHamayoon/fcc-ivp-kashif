// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { MAP_LABEL, NO_WEBGL } from "@/components/geo/ReachMap";
import { NOTHING_TO_TOUR } from "@/components/reach/Tour";
import { ReachScreen } from "@/components/reach/ReachScreen";
import { PANELS_PREF } from "@/components/reach/usePanelsChoice";
import { nyDate } from "@/lib/domain/fiscal-year";
import { NO_FILTERS } from "@/lib/domain/reach";
import { CAMERA_MS, TOUR_VIEW } from "@/lib/geo/reach-engine";
import { LAYERS } from "@/lib/geo/reach-style";
import { OPEN_PREFERENCES_EVENT } from "@/lib/preferences/open";
import { TOUR_PADDING } from "@/lib/reach/layout";
import { DEFAULT_VIEW, type ReachView } from "@/lib/reach/url";
import { FakeMap } from "@/tests/fixtures/fake-maplibre";
import { makeReachData, makeReachMeeting } from "@/tests/fixtures/reach";

/* --------------------------------- doubles -------------------------------- */

const webgl = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/geo/webgl", () => ({ webgl2Available: () => webgl.value }));
vi.mock("@/lib/motion", () => ({ useReducedMotion: () => false, reducedMotionNow: () => false, motionTransition: (t: unknown) => t }));
vi.mock("maplibre-gl", async () => (await import("@/tests/fixtures/fake-maplibre")).fakeMapLibre);
vi.mock("@/lib/geo/shapes", async () => {
  const { MAP_SHAPES } = await import("@/tests/fixtures/map");
  return { loadShapes: async () => MAP_SHAPES };
});

/* --------------------------------- fixtures ------------------------------- */

// REACH_NOW is Monday, September 28, 2026, noon in Washington.
const at = (iso: string) => new Date(iso);
const DATA = makeReachData([
  makeReachMeeting({ id: "mtg_jp", countries: ["JP"], start: at("2026-10-01T14:00:00Z"), format: "hybrid", participants: 12 }),
  makeReachMeeting({ countries: ["JP"], start: at("2026-11-20T14:00:00Z") }),
  makeReachMeeting({ id: "mtg_ke", countries: ["KE"], region: "Africa", start: at("2026-10-08T14:00:00Z"), format: "virtual", orgName: "Communications Authority of Kenya" }),
  makeReachMeeting({ countries: ["BR"], region: "Americas", start: at("2026-03-10T14:00:00Z") }),
  makeReachMeeting({ countries: ["DE"], region: "Europe", start: at("2026-12-01T14:00:00Z"), proposed: true }),
  makeReachMeeting({ countries: ["GB"], region: "Europe", start: at("2025-06-02T14:00:00Z") }),
]);

const view = (over: Partial<ReachView> = {}): ReachView => ({ ...DEFAULT_VIEW, ...over });

/* ---------------------------------- setup --------------------------------- */

/** Waits for MapLibre to arrive, then lets the map draw its own land and marks. */
async function mapReady(): Promise<FakeMap> {
  const map = await waitFor(() => {
    if (!FakeMap.last) throw new Error("no map yet");
    return FakeMap.last;
  });
  act(() => {
    map.loadStyle();
    map.drawOwnSources();
  });
  return map;
}

/** The fact in a surface's title bar. */
const noteOf = (surface: HTMLElement) => surface.querySelector('[data-slot="section-note"]');
const details = () => screen.getByRole("complementary", { name: "Details" });
const filters = () => screen.getByRole("complementary", { name: "Filters" });
/** One of the four figures at the top of the Filters panel. */
const figure = (term: string) => within(filters()).getByText(term, { selector: "dt" }).nextElementSibling;
/** The strip. (jsdom calls every <header> a banner; a browser does so only outside the page's sections, and the e2e axe run checks it there.) */
const strip = () => screen.getByRole("heading", { level: 1, name: "Global reach" }).closest("header") as HTMLElement;
const timeline = () => screen.getByRole("region", { name: "Timeline" });
const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** Opens a menu in the Filters panel and chooses a row from it. */
async function pickRegion(button: string, row: RegExp) {
  await userEvent.click(within(filters()).getByRole("button", { name: button }));
  await userEvent.click(await screen.findByRole("button", { name: row }));
}

/** jsdom lays nothing out: this ResizeObserver hands the timeline a 1,000 × 126 px box the moment it observes. */
class TimelineBox {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback([{ contentRect: { width: 1000, height: 126 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

/**
 * Animation frames the test turns by hand, 100 ms apart: the replay's clock runs on them, and so
 * do the map's rings. Call it before rendering; it returns how to let time pass.
 */
function turnFrames() {
  const waiting = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => (waiting.set(++id, callback), id)));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((frame: number) => waiting.delete(frame)));
  let now = 0;
  return (ms: number) =>
    act(() => {
      for (const end = now + ms; now < end; ) {
        now += 100;
        const due = [...waiting.values()];
        waiting.clear();
        for (const callback of due) callback(now);
      }
    });
}

/** The window is resized to `width` CSS pixels. */
const resize = (width: number) =>
  act(() => {
    vi.stubGlobal("innerWidth", width);
    window.dispatchEvent(new Event("resize"));
  });

const pointAt = (map: FakeMap, cca2: string) =>
  act(() => {
    map.hits = { [LAYERS.glyph]: [{ properties: { cca2 } }] };
    map.fire("mousemove", { point: { x: 1, y: 1 } });
  });

beforeEach(() => {
  webgl.value = true;
  FakeMap.last = null;
  window.localStorage.clear();
  // A desktop window, with the panels as the width decides: beside the map.
  vi.stubGlobal("innerWidth", 1440);
  PANELS_PREF.set("auto");
  window.history.replaceState(null, "", "/reach");
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* ---------------------------------- tests --------------------------------- */

describe("the full screen", () => {
  it("is laid out in order: the strip is the banner with the only h1, and main holds Filters, the map, Details and the timeline, in that order", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const main = screen.getByRole("main");
    expect(main).not.toContainElement(strip());
    expect(follows(strip(), main)).toBe(true);

    const [filters, region, panel, bottom] = [screen.getByRole("complementary", { name: "Filters" }), screen.getByRole("region", { name: MAP_LABEL }), details(), timeline()];
    for (const part of [filters, region, panel, bottom]) expect(main).toContainElement(part);
    expect(follows(filters, region) && follows(region, panel) && follows(panel, bottom)).toBe(true);
    expect(screen.getByRole("heading", { level: 2, name: "Map" })).toBeInTheDocument();

    // The skip link lands on the map; from there the canvas takes the keyboard.
    expect(screen.getByRole("link", { name: "Skip to the map" })).toHaveAttribute("href", "#map");
    expect(document.getElementById("map")).toHaveAttribute("tabindex", "-1");
    expect(map.getCanvas()).toHaveAttribute("tabindex", "0");
  });

  it("opens on the view the URL describes, and states the window in the strip and on the timeline", async () => {
    render(<ReachScreen data={DATA} initial={view({ range: "next30" })} />);
    await mapReady();
    expect(within(strip()).getByText("Next 30 days · Sep 28 – Oct 27, 2026")).toBeInTheDocument();
    expect(noteOf(timeline())).toHaveTextContent("2 meetings · Sep 28 – Oct 27, 2026");
    expect(screen.getByRole("button", { name: "Next 30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(figure("Countries")).toHaveTextContent("2");
  });

  it("recounts on a new range without rebuilding the map, and writes the view into the URL", async () => {
    render(<ReachScreen data={DATA} initial={view({ range: "next30" })} />);
    const map = await mapReady();
    fireEvent.click(screen.getByRole("button", { name: "This year" }));
    expect(figure("Countries")).toHaveTextContent("4");
    expect(noteOf(timeline())).toHaveTextContent("5 meetings · Jan 1 – Dec 31, 2026");
    const [features] = map.getSource("marks")?.setData.mock.lastCall ?? [];
    expect((features as GeoJSON.FeatureCollection).features.map((f) => f.properties?.cca2)).toEqual(["JP", "BR", "DE", "KE"]);
    expect(map.styleCalls).toHaveLength(0);
    expect(window.location.search).toBe("?range=this");
  });

  it("reads a narrowed window from the URL, and Clear selection gives the whole range back and hands focus to the range in force", async () => {
    render(<ReachScreen data={DATA} initial={view({ window: { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) } })} />);
    await mapReady();
    expect(within(strip()).getByText("Mar 1 – Mar 31, 2026")).toBeInTheDocument();
    expect(noteOf(timeline())).toHaveTextContent("1 meeting · Mar 1 – Mar 31, 2026");
    const clear = screen.getByRole("button", { name: "Clear selection" });
    act(() => clear.focus());
    fireEvent.click(clear);
    expect(noteOf(timeline())).toHaveTextContent("5 meetings · Jan 1 – Dec 31, 2026");
    expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
    expect(window.location.search).toBe("?range=this");
    // The button took itself away while it had focus: focus moves on to the range in force, never to the page.
    expect(screen.getByRole("button", { name: "This year" })).toHaveFocus();
  });

  it("draws the range on the timeline: a chip lights and chooses its meeting, and the window's sliders narrow everything the screen counts", async () => {
    vi.stubGlobal("ResizeObserver", TimelineBox);
    render(<ReachScreen data={DATA} initial={view({ range: "next30" })} />);
    const map = await mapReady();
    const band = within(timeline());
    // Next 30 days is a day view: a chip per meeting, named as the meeting's row in the Details panel is.
    const kenya = band.getByRole("button", { name: /^Kenya, Communications Authority of Kenya, Oct 8, 2026/ });
    fireEvent.pointerEnter(kenya);
    expect(map.stateOf("marks", "KE")).toMatchObject({ hover: true });
    fireEvent.click(kenya);
    expect(map.stateOf("marks", "KE")).toMatchObject({ selected: true });
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.country })]);
    expect(window.location.search).toBe("?meeting=mtg_ke&range=next30");

    // From the keyboard the window is two sliders; in a day view an arrow moves an edge a day.
    const start = band.getByRole("slider", { name: "Window start" });
    for (let day = 0; day < 4; day++) fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(start).toHaveAttribute("aria-valuetext", "Oct 2, 2026");
    expect(within(strip()).getByText("Oct 2 – Oct 27, 2026")).toBeInTheDocument();
    expect(noteOf(timeline())).toHaveTextContent("1 meeting · Oct 2 – Oct 27, 2026");
    expect(figure("Countries")).toHaveTextContent("1");
    expect(window.location.search).toBe("?meeting=mtg_ke&range=next30&from=2026-10-02&to=2026-10-27");
  });

  it("describes the map in one sentence tied to it, rebuilt from the window's numbers", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    const sentence = document.getElementById(map.getCanvas().getAttribute("aria-describedby") ?? "");
    expect(sentence).toHaveTextContent("This year: 5 meetings in 4 countries. Most: Japan 2, Brazil 1, Germany 1. 2 countries have a meeting coming up in the next 30 days.");
  });

  it("lists what is next in the Details panel; choosing a meeting selects and flies to its country, and writes the meeting into the URL", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    const panel = within(details());
    expect(panel.getByRole("tab", { name: "Next up" })).toHaveAttribute("aria-selected", "true");
    expect(noteOf(details())).toHaveTextContent("4 visits ahead");
    fireEvent.pointerEnter(panel.getByRole("button", { name: /^Kenya, Communications Authority of Kenya/ }));
    expect(map.stateOf("marks", "KE")).toMatchObject({ hover: true });

    fireEvent.click(panel.getByRole("button", { name: /^Kenya, Communications Authority of Kenya/ }));
    expect(map.stateOf("marks", "KE")).toMatchObject({ selected: true, hover: false });
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.country })]);
    expect(window.location.search).toBe("?meeting=mtg_ke&range=this");

    // The meeting opens in the panel; Back returns to the list and lets the selection go, leaving the camera where it is.
    expect(panel.getByRole("heading", { level: 3, name: "Communications Authority of Kenya" })).toHaveFocus();
    const flights = map.camera.length;
    fireEvent.click(panel.getByRole("button", { name: "Back to Next up" }));
    expect(panel.getByRole("tab", { name: "Next up" })).toHaveFocus();
    expect(map.stateOf("marks", "KE")).toMatchObject({ selected: false });
    expect(map.camera).toHaveLength(flights);
    expect(window.location.search).toBe("?range=this");
  });

  it("opens a country chosen on the map in the Details panel, and a linked meeting too", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    pointAt(map, "JP");
    act(() => map.fire("click", { point: { x: 1, y: 1 } }));
    expect(within(details()).getByRole("heading", { level: 3, name: "Japan" })).toBeInTheDocument();
    expect(within(details()).getByRole("link", { name: "Open Japan" })).toHaveAttribute("href", "/countries/JP");

    cleanup();
    render(<ReachScreen data={DATA} initial={view({ selection: { kind: "meeting", id: "mtg_jp" } })} />);
    await mapReady();
    expect(within(details()).getByRole("heading", { level: 3, name: "Ministry of Internal Affairs and Communications" })).toBeInTheDocument();
    expect(within(details()).getByRole("link", { name: "Open the meeting record" })).toHaveAttribute("href", "/meetings/mtg_jp");
  });

  it("chooses a country from the Countries tab: selected on the map, flown to, and written into the URL; pointing at a row lights its country", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    fireEvent.click(screen.getByRole("tab", { name: "Countries" }));
    expect(noteOf(details())).toHaveTextContent("4 countries");
    expect(window.location.search).toBe("?range=this&tab=countries");
    const list = within(details());
    fireEvent.pointerEnter(list.getByRole("button", { name: /^Kenya/ }));
    expect(map.stateOf("marks", "KE")).toMatchObject({ hover: true });
    fireEvent.pointerLeave(list.getByRole("button", { name: /^Kenya/ }));
    expect(map.stateOf("marks", "KE")).toMatchObject({ hover: false });

    fireEvent.click(list.getByRole("button", { name: "Japan, Asia-Pacific, 2 meetings: 1 in person, 1 hybrid" }));
    expect(map.stateOf("marks", "JP")).toMatchObject({ selected: true });
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.country })]);
    expect(window.location.search).toBe("?country=JP&range=this&tab=countries");
  });

  it("names a country's next visit in its tooltip, selects it on a click, and lets it go on a click on the water", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    pointAt(map, "JP");
    expect(screen.getByRole("tooltip")).toHaveTextContent("2 meetings · 18 participants");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Next: Ministry of Internal Affairs and Communications, Oct 1 · Hybrid");

    act(() => map.fire("click", { point: { x: 1, y: 1 } }));
    expect(map.stateOf("marks", "JP")).toMatchObject({ selected: true });
    expect(window.location.search).toBe("?country=JP&range=this");
    act(() => {
      map.hits = {};
      map.fire("click", { point: { x: 1, y: 1 } });
    });
    expect(map.stateOf("marks", "JP")).toMatchObject({ selected: false });
    expect(window.location.search).toBe("?range=this");
  });

  it("opens on a selected country, zooms from its own buttons, and returns to the whole world", async () => {
    render(<ReachScreen data={DATA} initial={view({ selection: { kind: "country", cca2: "KE" } })} />);
    const map = await mapReady();
    expect(map.stateOf("marks", "KE")).toMatchObject({ selected: true });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(map.camera.at(-1)?.[0]).toBe("zoomIn");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(map.camera.at(-1)?.[0]).toBe("zoomOut");
    fireEvent.click(screen.getByRole("button", { name: "Whole world" }));
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.world })]);
  });

  it("says so when the window holds nothing: no countries, no ramp, and a sentence that says none", async () => {
    render(<ReachScreen data={DATA} initial={view({ range: "last", filters: { ...NO_FILTERS, formats: ["virtual"] } })} />);
    const map = await mapReady();
    expect(noteOf(details())).toHaveTextContent("0 meetings");
    expect(within(details()).getByText("No meetings in this window. Widen the timeline or clear a filter.")).toBeInTheDocument();
    expect(screen.queryByText(/Countries shaded by meetings/)).toBeNull();
    expect(document.getElementById(map.getCanvas().getAttribute("aria-describedby") ?? "")).toHaveTextContent("Last year: no meetings.");
  });

  it("without WebGL, says so where the map would be and lists the same countries there; the map's own controls are withdrawn", () => {
    webgl.value = false;
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    expect(screen.getByText(NO_WEBGL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Japan, Asia-Pacific, 2 meetings: 1 in person, 1 hybrid" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause the signals" })).toBeNull();
  });

  it("narrows everything from the Filters panel, frames a chosen region, and writes the filters into the URL", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    await userEvent.click(within(filters()).getByRole("checkbox", { name: "In person" }));
    expect(figure("Countries")).toHaveTextContent("3");
    const [features] = map.getSource("marks")?.setData.mock.lastCall ?? [];
    expect((features as GeoJSON.FeatureCollection).features.map((f) => f.properties?.cca2)).toEqual(["BR", "DE", "JP"]);
    expect(window.location.search).toBe("?range=this&format=in_person");

    await pickRegion("Region", /^Europe/);
    expect(figure("Countries")).toHaveTextContent("1");
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.bounds })]);
    expect(window.location.search).toBe("?range=this&format=in_person&region=Europe");

    await pickRegion("Region Europe", /^All regions/);
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.world })]);
  });

  it("resets every filter at once, and returns the camera to the whole world", async () => {
    render(<ReachScreen data={DATA} initial={view({ filters: { ...NO_FILTERS, formats: ["virtual"], region: "Africa" } })} />);
    const map = await mapReady();
    expect(figure("Countries")).toHaveTextContent("1");
    await userEvent.click(within(filters()).getByRole("button", { name: "Reset" }));
    expect(figure("Countries")).toHaveTextContent("4");
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.world })]);
    expect(window.location.search).toBe("?range=this");
  });

  it("finds an organization anywhere in the program's history from the strip, and selects and flies to its country", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    const field = within(strip()).getByRole("combobox", { name: "Find a country or organization" });
    await userEvent.type(field, "communications authority");
    expect(screen.getByRole("option", { name: /^Communications Authority of Kenya, organization/ })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(map.stateOf("marks", "KE")).toMatchObject({ selected: true });
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.country })]);
    expect(window.location.search).toBe("?country=KE&range=this");
    expect(within(details()).getByRole("heading", { level: 3, name: "Kenya" })).toBeInTheDocument();
    // The field clears and keeps the keyboard, ready for the next search.
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
  });

  it("reaches search with Ctrl+K from anywhere on the page, and leaves the key alone without its modifier", () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const field = within(strip()).getByRole("combobox", { name: "Find a country or organization" });
    expect(fireEvent.keyDown(document.body, { key: "k" })).toBe(true);
    expect(field).not.toHaveFocus();
    expect(fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })).toBe(false);
    expect(field).toHaveFocus();
  });

  it("tours the next 90 days: the chrome slides away out of reach, the map keeps only the tour's countries, and the camera tilts in on each visit", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    fireEvent.click(within(strip()).getByRole("button", { name: "Tour" }));

    for (const surface of [strip(), filters(), details(), timeline()]) {
      expect(surface).toHaveAttribute("inert");
      expect(surface.style.transform).not.toBe("");
    }
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    const card = screen.getByRole("region", { name: "Tour" });
    expect(within(card).getByRole("heading", { level: 2, name: "Japan" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Pause the tour" })).toHaveFocus();

    // Four visits in the next 90 days: Japan twice, Kenya and Germany. Nothing else stays on the map.
    const [features] = map.getSource("marks")?.setData.mock.lastCall ?? [];
    expect((features as GeoJSON.FeatureCollection).features.map((f) => [f.properties?.cca2, f.properties?.o])).toEqual([["JP", 1], ["DE", 0.4], ["KE", 0.4]]);
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ center: [139.69, 35.68], pitch: TOUR_VIEW.pitch, duration: CAMERA_MS.tour, padding: TOUR_PADDING })]);

    fireEvent.click(within(card).getByRole("button", { name: "Next visit" }));
    expect(within(card).getByRole("heading", { level: 2, name: "Kenya" })).toBeInTheDocument();
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ center: [36.82, -1.29], pitch: TOUR_VIEW.pitch })]);

    // The summary frames every country the tour visited, flat again; Done hands the page back.
    for (let i = 0; i < 3; i++) fireEvent.click(within(card).getByRole("button", { name: "Next visit" }));
    expect(within(card).getByRole("heading", { level: 2, name: "4 visits from 3 countries" })).toBeInTheDocument();
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ pitch: 0, duration: CAMERA_MS.bounds })]);
    fireEvent.click(within(card).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
    for (const surface of [strip(), filters(), details(), timeline()]) {
      expect(surface).not.toHaveAttribute("inert");
      expect(surface.style.transform).toBe("");
    }
    expect(within(strip()).getByRole("button", { name: "Tour" })).toHaveFocus();
  });

  it("ends a tour where the reader left the page: the selection, the narrowed window and the spot they zoomed to, with focus on the Tour button", async () => {
    render(<ReachScreen data={DATA} initial={view({ range: "next365", window: { from: nyDate(2026, 10, 1), to: nyDate(2026, 11, 1) }, selection: { kind: "country", cca2: "KE" } })} />);
    const map = await mapReady();
    // The reader pans and zooms the map by hand.
    map.center = { lng: 30, lat: 5 };
    map.zoom = 3.2;
    act(() => map.fire("movestart", { originalEvent: new MouseEvent("mousedown") }));

    const button = within(strip()).getByRole("button", { name: "Tour" });
    act(() => button.focus());
    fireEvent.click(button);
    expect(map.stateOf("marks", "KE")).toMatchObject({ selected: false });
    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
    expect(map.stateOf("marks", "KE")).toMatchObject({ selected: true });
    expect(within(details()).getByRole("heading", { level: 3, name: "Kenya" })).toBeInTheDocument();
    expect(within(strip()).getByText("Oct 1 – Oct 31, 2026")).toBeInTheDocument();
    expect(map.camera.at(-1)).toEqual(["flyTo", expect.objectContaining({ center: [30, 5], zoom: 3.2, pitch: 0, duration: CAMERA_MS.at })]);
    expect(button).toHaveFocus();
    // The tour never touched the view, so it never wrote the URL.
    expect(window.location.search).toBe("");
  });

  it("counts the filters in: with no visit left to tour, the Tour button says why and starts nothing", () => {
    render(<ReachScreen data={DATA} initial={view({ filters: { ...NO_FILTERS, region: "Americas" } })} />);
    const button = within(strip()).getByRole("button", { name: "Tour" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(NOTHING_TO_TOUR);
    fireEvent.click(button);
    expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
  });

  it("replays the year: a 30-day window sweeps it without writing the URL, its month takes the legend's corner, and Pause keeps the window it reached", async () => {
    const pass = turnFrames();
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    await mapReady();
    const band = within(timeline());
    expect(screen.getByText(/^Countries shaded by meetings/)).toBeInTheDocument();
    fireEvent.click(band.getByRole("button", { name: "Replay" }));
    expect(noteOf(timeline())).toHaveTextContent("0 meetings · Jan 1 – Jan 30, 2026");
    expect(screen.getByText("Replaying this year").nextElementSibling).toHaveTextContent("Jan 2026");
    expect(screen.queryByText(/^Countries shaded by meetings/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();

    // The window moves 14 days a second. After 3.4 s it runs from February 17 into March and holds
    // Brazil's visit on March 10; the Details panel lists it by month.
    pass(3500);
    expect(screen.getByText("Replaying this year").nextElementSibling).toHaveTextContent("Mar 2026");
    expect(figure("Countries")).toHaveTextContent("1");
    expect(within(details()).getByRole("tab", { name: "Meetings" })).toBeInTheDocument();
    expect(within(details()).getByRole("heading", { level: 3, name: "March 2026" })).toBeInTheDocument();
    expect(window.location.search).toBe("");

    // Pause: the window it reached, in whole days, is the reader's own now, and the URL takes it once.
    fireEvent.click(band.getByRole("button", { name: "Pause" }));
    expect(window.location.search).toBe("?range=this&from=2026-02-18&to=2026-03-19");
    expect(noteOf(timeline())).toHaveTextContent("1 meeting · Feb 18 – Mar 19, 2026");
    expect(screen.queryByText("Replaying this year")).toBeNull();
    expect(screen.getByText(/^Countries shaded by meetings/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeInTheDocument();

    // Played to the end, it gives the whole range back.
    fireEvent.click(band.getByRole("button", { name: "Replay" }));
    pass(30_000);
    expect(band.getByRole("button", { name: "Replay" })).toBeInTheDocument();
    expect(noteOf(timeline())).toHaveTextContent("5 meetings · Jan 1 – Dec 31, 2026");
    expect(window.location.search).toBe("?range=this");
  });

  it("keeps a replay going through a chosen country or a filter, never lets its window be dragged, and stops it with no window left behind on a new range or the tour", async () => {
    vi.stubGlobal("ResizeObserver", TimelineBox);
    const pass = turnFrames();
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    await mapReady();
    const band = within(timeline());
    fireEvent.click(band.getByRole("button", { name: "Replay" }));
    pass(3000);

    // The window is the replay's: its sliders say so and take no keys.
    const start = band.getByRole("slider", { name: "Window start" });
    expect(start).toHaveAttribute("aria-disabled", "true");
    const at = start.getAttribute("aria-valuenow");
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(start).toHaveAttribute("aria-valuenow", at);

    // A chosen country lets it go on: the selection reaches the URL, and the replay's window never does.
    await userEvent.type(within(strip()).getByRole("combobox", { name: "Find a country or organization" }), "kenya{Enter}");
    expect(within(details()).getByRole("heading", { level: 3, name: "Kenya" })).toBeInTheDocument();
    expect(window.location.search).toBe("?country=KE&range=this");
    pass(500);
    expect(band.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    // A filter narrows the moving window without stopping it.
    await userEvent.click(within(filters()).getByRole("checkbox", { name: "Virtual" }));
    expect(figure("Countries")).toHaveTextContent("0");
    pass(1000);
    expect(band.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    // A new range stops it, and leaves no window behind.
    fireEvent.click(band.getByRole("button", { name: "Next 365 days" }));
    expect(band.getByRole("button", { name: "Replay" })).toBeInTheDocument();
    expect(noteOf(timeline())).toHaveTextContent("1 meeting · Sep 28, 2026 – Sep 27, 2027");
    expect(window.location.search).toBe("?country=KE&range=next365&format=virtual");

    // So does the tour: after it, the timeline holds the reader's own window again, the whole range.
    fireEvent.click(band.getByRole("button", { name: "Replay" }));
    pass(2000);
    fireEvent.click(within(strip()).getByRole("button", { name: "Tour" }));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(band.getByRole("button", { name: "Replay" })).toBeInTheDocument();
    expect(noteOf(timeline())).toHaveTextContent("1 meeting · Sep 28, 2026 – Sep 27, 2027");
    expect(window.location.search).toBe("?country=KE&range=next365&format=virtual");
  });

  it("tucks the panels away as the window narrows past 1280 px: edge tabs stand for them, focus inside one moves to its tab, the timeline becomes a strip, and the camera takes their space; they come back as it widens", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    expect(filters()).not.toHaveAttribute("inert");
    expect(within(strip()).getByRole("button", { name: "Panels" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    act(() => within(filters()).getByRole("button", { name: "Region" }).focus());

    resize(1100);
    expect(filters()).toHaveAttribute("inert");
    expect(details()).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Filters" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Details" })).toBeInTheDocument();
    expect(timeline()).toHaveStyle({ height: "64px" });
    expect(map.camera.at(-1)).toEqual(["easeTo", expect.objectContaining({ padding: { top: 76, right: 52, bottom: 88, left: 52 }, duration: CAMERA_MS.reframe })]);
    expect(within(strip()).getByRole("button", { name: "Panels" })).toHaveAttribute("aria-pressed", "false");

    resize(1440);
    expect(filters()).not.toHaveAttribute("inert");
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    expect(timeline()).toHaveStyle({ height: "172px" });
    expect(map.camera.at(-1)).toEqual(["easeTo", expect.objectContaining({ padding: { top: 76, right: 392, bottom: 196, left: 320 }, duration: CAMERA_MS.reframe })]);
  });

  it("opens a tucked panel as a drawer from its edge tab and moves focus in; Escape or its close button gives focus back to the tab, and Panels brings both panels back for good", async () => {
    PANELS_PREF.set("tucked");
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    await mapReady();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(filters()).not.toHaveAttribute("inert");
    expect(within(filters()).getByRole("button", { name: "Close Filters" })).toHaveFocus();
    // Its tab steps aside while it is open.
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();

    // A menu inside the drawer keeps its own Escape.
    await userEvent.click(within(filters()).getByRole("button", { name: "Region" }));
    await screen.findByRole("button", { name: /^All regions/ });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: /^All regions/ })).toBeNull();
    expect(filters()).not.toHaveAttribute("inert");

    // The next Escape closes the drawer, and focus goes back to its tab.
    await userEvent.keyboard("{Escape}");
    expect(filters()).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Filters" })).toHaveFocus();

    // The Details drawer's close button does the same.
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    await userEvent.click(within(details()).getByRole("button", { name: "Close Details" }));
    expect(details()).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Details" })).toHaveFocus();

    // Panels brings both back, and the choice is kept for this browser.
    await userEvent.click(within(strip()).getByRole("button", { name: "Panels" }));
    expect(filters()).not.toHaveAttribute("inert");
    expect(details()).not.toHaveAttribute("inert");
    expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
    expect(window.localStorage.getItem("ivp.reach.panels")).toBe("open");
  });

  it("leaves the Escapes the search field uses to it; the next one closes the open drawer and leaves focus in the field", async () => {
    PANELS_PREF.set("tucked");
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    await mapReady();
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    const field = within(strip()).getByRole("combobox", { name: "Find a country or organization" });
    await userEvent.type(field, "ken");
    // The field's own Escapes come first: one closes its list, the next clears it.
    await userEvent.keyboard("{Escape}");
    expect(field).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{Escape}");
    expect(field).toHaveValue("");
    expect(details()).not.toHaveAttribute("inert");

    await userEvent.keyboard("{Escape}");
    expect(details()).toHaveAttribute("inert");
    expect(field).toHaveFocus();
  });

  it("shows what is chosen while the panels are tucked: the Details drawer opens on it, and focus stays where it was", async () => {
    PANELS_PREF.set("tucked");
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    act(() => map.getCanvas().focus());
    pointAt(map, "KE");
    act(() => map.fire("click", { point: { x: 1, y: 1 } }));
    expect(details()).not.toHaveAttribute("inert");
    expect(within(details()).getByRole("heading", { level: 3, name: "Kenya" })).toBeInTheDocument();
    expect(map.getCanvas()).toHaveFocus();
  });

  it("shrinks the timeline to a strip of marks while the panels are tucked, and grows it back while the pointer or focus is on it", async () => {
    PANELS_PREF.set("tucked");
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    await mapReady();
    const bottom = timeline();
    expect(bottom).toHaveStyle({ height: "64px" });
    fireEvent.pointerEnter(bottom);
    expect(bottom).toHaveStyle({ height: "172px" });
    // It lingers a moment after the pointer leaves, so overshooting its edge on the way to a control does not lose it.
    fireEvent.pointerLeave(bottom);
    expect(bottom).toHaveStyle({ height: "172px" });
    await waitFor(() => expect(bottom).toHaveStyle({ height: "64px" }));

    // Its title bar is out of sight but in reach: focus arriving on it grows the timeline back.
    const thisYear = within(bottom).getByRole("button", { name: "This year" });
    act(() => thisYear.focus());
    expect(bottom).toHaveStyle({ height: "172px" });
    act(() => thisYear.blur());
    expect(bottom).toHaveStyle({ height: "64px" });
  });

  it("renders only the skeleton on the server, since its layout waits for the window's width", () => {
    const html = renderToString(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    expect(html).toContain("Loading the map");
    expect(html).not.toContain("Global reach");
  });

  it("follows the window's width as it changes: panels docked at 1440 px, tucked at 1100, the strip and the ranges folded into menus at 700, and all of it back at 1440; the search keeps the reader's text and focus throughout", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    await mapReady();
    const field = within(strip()).getByRole("combobox", { name: "Find a country or organization" });
    await userEvent.type(field, "ken");
    const title = screen.getByRole("heading", { level: 1, name: "Global reach" });
    const ranges = () => within(timeline()).getByRole("group", { name: "Range" });

    resize(1100);
    expect(filters()).toHaveAttribute("inert");
    expect(within(strip()).getByRole("button", { name: "Panels" })).toHaveAttribute("aria-pressed", "false");
    expect(field).toHaveFocus();

    resize(700);
    // The search stays open across the strip with the reader's text, and the title steps out of sight.
    expect(field).toHaveFocus();
    expect(field).toHaveValue("ken");
    expect(within(strip()).getByRole("button", { name: "Close search" })).toBeInTheDocument();
    expect(title).toHaveClass("sr-only");
    // Tour and Display fold into More. Panels goes: at this width the panels stay tucked.
    expect(within(strip()).getByRole("button", { name: "More" })).toBeInTheDocument();
    for (const name of ["Tour", "Panels", "Display & accessibility"]) expect(within(strip()).queryByRole("button", { name })).toBeNull();
    // The six ranges fold into a menu named by the range in force.
    expect(within(ranges()).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-haspopup")])).toEqual([["This year", "menu"]]);

    resize(1440);
    expect(field).toHaveFocus();
    expect(field).toHaveValue("ken");
    expect(filters()).not.toHaveAttribute("inert");
    expect(within(strip()).queryByRole("button", { name: "Close search" })).toBeNull();
    expect(title).not.toHaveClass("sr-only");
    expect(within(strip()).getByRole("button", { name: "Panels" })).toHaveAttribute("aria-pressed", "true");
    expect(within(ranges()).getAllByRole("button")).toHaveLength(6);
  });

  it("under 768 px opens the search across the strip from its button or with Ctrl+K; an Escape the field has not used closes it and gives focus back to the button", async () => {
    vi.stubGlobal("innerWidth", 700);
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    await mapReady();
    expect(within(strip()).queryByRole("combobox")).toBeNull();
    await userEvent.click(within(strip()).getByRole("button", { name: "Find a country or organization" }));
    const field = within(strip()).getByRole("combobox", { name: "Find a country or organization" });
    expect(field).toHaveFocus();

    // The field's own Escapes come first: one closes its list, the next clears it. The search stays open.
    await userEvent.type(field, "ken");
    await userEvent.keyboard("{Escape}");
    expect(field).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{Escape}");
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();

    // Choosing keeps the search open, and the Details drawer opens on the country.
    await userEvent.type(field, "kenya{Enter}");
    expect(window.location.search).toBe("?country=KE&range=this");
    expect(within(details()).getByRole("heading", { level: 3, name: "Kenya" })).toBeInTheDocument();
    expect(field).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(within(strip()).queryByRole("combobox")).toBeNull();
    expect(within(strip()).getByRole("button", { name: "Find a country or organization" })).toHaveFocus();
    // The search used that Escape, so the drawer stays open.
    expect(details()).not.toHaveAttribute("inert");

    expect(fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })).toBe(false);
    expect(within(strip()).getByRole("combobox", { name: "Find a country or organization" })).toHaveFocus();
  });

  it("under 768 px keeps the tour and Display & accessibility in the strip's More menu; the tour takes focus, and gives it back to More", async () => {
    vi.stubGlobal("innerWidth", 700);
    // Base UI's menus open on an animation frame.
    const turn = turnFrames();
    const opened = vi.fn();
    window.addEventListener(OPEN_PREFERENCES_EVENT, opened);
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    await mapReady();
    const more = within(strip()).getByRole("button", { name: "More" });
    await userEvent.click(more);
    turn(100);
    await userEvent.click(screen.getByRole("menuitem", { name: "Display & accessibility" }));
    turn(100);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_PREFERENCES_EVENT, opened);

    await userEvent.click(more);
    turn(100);
    await userEvent.click(screen.getByRole("menuitem", { name: "Tour 4 visits in the next 90 days" }));
    turn(100);
    const card = screen.getByRole("region", { name: "Tour" });
    expect(within(card).getByRole("button", { name: "Pause the tour" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "End tour" }));
    expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
    expect(more).toHaveFocus();
  });

  it("under 768 px folds the six ranges into a menu named by the range in force; Clear selection hands focus to it", async () => {
    vi.stubGlobal("innerWidth", 700);
    const turn = turnFrames();
    render(<ReachScreen data={DATA} initial={view({ window: { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) } })} />);
    await mapReady();
    const ranges = within(timeline()).getByRole("group", { name: "Range" });
    const clear = screen.getByRole("button", { name: "Clear selection" });
    act(() => clear.focus());
    fireEvent.click(clear);
    expect(within(ranges).getByRole("button", { name: "This year" })).toHaveFocus();

    await userEvent.click(within(ranges).getByRole("button", { name: "This year" }));
    turn(100);
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Next 30 days" }));
    turn(100);
    expect(window.location.search).toBe("?range=next30");
    expect(within(ranges).getByRole("button", { name: "Next 30 days" })).toHaveFocus();
  });

  it("under 768 px opens a drawer as a sheet across the window and down over the timeline: what it covers is out of reach while it is open, and a choice made on the map is followed into it", async () => {
    vi.stubGlobal("innerWidth", 700);
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    const covered = () => [document.getElementById("map"), timeline()];
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(details()).not.toHaveAttribute("inert");
    expect(details()).toHaveStyle({ left: "12px", right: "12px", bottom: "12px" });
    expect(details().style.width).toBe("");
    // The map, the Filters tab and the timeline are under the sheet; the timeline slides away past the window's foot.
    for (const part of covered()) expect(part).toHaveAttribute("inert");
    expect(timeline().style.transform).not.toBe("");
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Close Details" }));
    for (const part of covered()) expect(part).not.toHaveAttribute("inert");
    expect(timeline().style.transform).toBe("");
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();

    // A country chosen on the map opens the sheet over it, so focus follows the choice onto its heading.
    act(() => map.getCanvas().focus());
    pointAt(map, "KE");
    act(() => map.fire("click", { point: { x: 1, y: 1 } }));
    expect(within(details()).getByRole("heading", { level: 3, name: "Kenya" })).toHaveFocus();
  });

  it("keeps its single-key shortcuts on the focused map: / reaches search, P tucks the panels and T starts the tour; anywhere else, with a modifier or held down, the keys are left alone", async () => {
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    const canvas = map.getCanvas();
    const field = within(strip()).getByRole("combobox", { name: "Find a country or organization" });

    // Away from the map the letters are the reader's (WCAG 2.1.4).
    const region = within(filters()).getByRole("button", { name: "Region" });
    act(() => region.focus());
    for (const key of ["/", "t", "p"]) expect(fireEvent.keyDown(region, { key })).toBe(true);
    expect(region).toHaveFocus();
    expect(filters()).not.toHaveAttribute("inert");

    act(() => canvas.focus());
    expect(fireEvent.keyDown(canvas, { key: "/" })).toBe(false);
    expect(field).toHaveFocus();

    act(() => canvas.focus());
    expect(fireEvent.keyDown(canvas, { key: "p" })).toBe(false);
    expect(filters()).toHaveAttribute("inert");
    expect(window.localStorage.getItem("ivp.reach.panels")).toBe("tucked");
    // A held key repeats nothing, and a modifier leaves the key to the browser.
    expect(fireEvent.keyDown(canvas, { key: "p", repeat: true })).toBe(true);
    expect(fireEvent.keyDown(canvas, { key: "p", ctrlKey: true })).toBe(true);
    expect(filters()).toHaveAttribute("inert");
    expect(fireEvent.keyDown(canvas, { key: "P", shiftKey: true })).toBe(false);
    expect(filters()).not.toHaveAttribute("inert");

    fireEvent.keyDown(canvas, { key: "t" });
    const card = screen.getByRole("region", { name: "Tour" });
    expect(within(card).getByRole("button", { name: "Pause the tour" })).toHaveFocus();
    // While the tour runs, the map is the tour's: its letters start nothing and tuck nothing.
    act(() => canvas.focus());
    expect(fireEvent.keyDown(canvas, { key: "t" })).toBe(true);
    expect(fireEvent.keyDown(canvas, { key: "p" })).toBe(true);
    expect(window.localStorage.getItem("ivp.reach.panels")).toBe("open");
  });

  it("leaves T alone with no visit to tour, and P under 768 px, where the panels stay tucked", async () => {
    vi.stubGlobal("innerWidth", 700);
    render(<ReachScreen data={DATA} initial={view({ filters: { ...NO_FILTERS, region: "Americas" } })} />);
    const canvas = (await mapReady()).getCanvas();
    act(() => canvas.focus());
    expect(fireEvent.keyDown(canvas, { key: "t" })).toBe(true);
    expect(screen.queryByRole("region", { name: "Tour" })).toBeNull();
    expect(fireEvent.keyDown(canvas, { key: "p" })).toBe(true);
    expect(window.localStorage.getItem("ivp.reach.panels")).toBe("auto");
    expect(canvas).toHaveFocus();
  });

  it("steps back one thing at a time on Escape from the map: the tooltip, then the selection, then the open drawer, with focus left on the map", async () => {
    PANELS_PREF.set("tucked");
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const map = await mapReady();
    const canvas = map.getCanvas();
    act(() => canvas.focus());
    pointAt(map, "KE");
    act(() => map.fire("click", { point: { x: 1, y: 1 } }));
    expect(within(details()).getByRole("heading", { level: 3, name: "Kenya" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(window.location.search).toBe("?country=KE&range=this");

    await userEvent.keyboard("{Escape}");
    expect(window.location.search).toBe("?range=this");
    expect(map.stateOf("marks", "KE")).toMatchObject({ selected: false });
    expect(details()).not.toHaveAttribute("inert");

    await userEvent.keyboard("{Escape}");
    expect(details()).toHaveAttribute("inert");
    expect(canvas).toHaveFocus();
    // With nothing left to step back from, Escape is not the page's.
    expect(fireEvent.keyDown(canvas, { key: "Escape" })).toBe(true);
  });

  it("gives an Escape pressed in the Details panel's country or meeting to its Back, and one pressed in a drawer to the drawer, before the page's selection", async () => {
    render(<ReachScreen data={DATA} initial={view({ selection: { kind: "meeting", id: "mtg_ke" } })} />);
    await mapReady();
    // Docked: out of the meeting to the list, focus and all, as Back does.
    act(() => within(details()).getByRole("link", { name: "Open the meeting record" }).focus());
    await userEvent.keyboard("{Escape}");
    expect(within(details()).getByRole("tab", { name: "Next up" })).toHaveFocus();
    expect(window.location.search).toBe("?range=this");

    // Tucked: a country opened in the Details drawer goes back to the tabs first, then the drawer closes.
    act(() => within(strip()).getByRole("button", { name: "Panels" }).click());
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    await userEvent.click(within(details()).getByRole("tab", { name: "Countries" }));
    await userEvent.click(within(details()).getByRole("button", { name: /^Kenya/ }));
    expect(within(details()).getByRole("heading", { level: 3, name: "Kenya" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(within(details()).getByRole("tab", { name: "Countries" })).toHaveFocus();
    expect(details()).not.toHaveAttribute("inert");
    await userEvent.keyboard("{Escape}");
    expect(details()).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Details" })).toHaveFocus();

    // In the Filters drawer, Escape closes the drawer and leaves the selection the map shows.
    await userEvent.type(within(strip()).getByRole("combobox", { name: "Find a country or organization" }), "kenya{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    // Focus on a checkbox inside it: the close button's tooltip would take the first Escape (1.4.13).
    act(() => within(filters()).getByRole("checkbox", { name: "In person" }).focus());
    await userEvent.keyboard("{Escape}");
    expect(filters()).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Filters" })).toHaveFocus();
    expect(window.location.search).toBe("?country=KE&range=this&tab=countries");
  });

  it("states the result of a filter or range change once the reader pauses for 600 ms; arriving, moving the window and a replay say nothing", () => {
    vi.stubGlobal("ResizeObserver", TimelineBox);
    // Fake timers from the first render, so the wait after arriving counts too. The map is not needed here; waiting for it takes real timers.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
    const band = within(timeline());
    const said = within(screen.getByRole("main")).getByRole("status");
    // Outside the map, which a sheet takes out of reach.
    expect(document.getElementById("map")).not.toContainElement(said);
    // Arriving says nothing: the map's own sentence describes the page.
    wait(600);
    expect(said).toBeEmptyDOMElement();

    // Two changes in quick succession are stated once, as they left the page.
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "In person" }));
    wait(400);
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Hybrid" }));
    wait(599);
    expect(said).toBeEmptyDOMElement();
    wait(1);
    expect(said.textContent).toBe("4 meetings in 3 countries");

    // Moving the window is the reader's own gesture, and the replay moves it many times a second: neither is
    // stated, and nor is a change made while the replay plays.
    fireEvent.keyDown(band.getByRole("slider", { name: "Window start" }), { key: "ArrowRight" });
    expect(noteOf(timeline())).toHaveTextContent("4 meetings · Jan 8 – Dec 31, 2026");
    wait(600);
    expect(said.textContent).toBe("4 meetings in 3 countries");
    fireEvent.click(band.getByRole("button", { name: "Replay" }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Virtual" }));
    wait(600);
    expect(said.textContent).toBe("4 meetings in 3 countries");

    fireEvent.click(band.getByRole("button", { name: "Next 7 days" }));
    wait(600);
    expect(said.textContent).toBe("1 meeting in 1 country");
    // The same result is stated again: a trailing no-break space makes it a change a screen reader repeats.
    fireEvent.click(band.getByRole("button", { name: "Last year" }));
    wait(600);
    expect(said.textContent).toBe("1 meeting in 1 country\u00a0");
  });

  it("opens Display & accessibility without leaving the page, and exits to the dashboard", () => {
    const opened = vi.fn();
    window.addEventListener(OPEN_PREFERENCES_EVENT, opened);
    render(<ReachScreen data={DATA} initial={DEFAULT_VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: "Display & accessibility" }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_PREFERENCES_EVENT, opened);
    expect(screen.getByRole("link", { name: "Exit full screen" })).toHaveAttribute("href", "/");
  });
});
