// @vitest-environment jsdom
import type { StyleSpecification } from "maplibre-gl";
import { COUNTRY_ZOOM } from "@/lib/geo/camera";
import { cityIcon, glyphImage, glyphRadius } from "@/lib/geo/glyphs";
import { MAP_PALETTES } from "@/lib/geo/map-palette";
import { CAMERA_MS, type EngineOptions, ReachEngine, TILE_PATIENCE_MS, TOUR_VIEW } from "@/lib/geo/reach-engine";
import { LAYERS } from "@/lib/geo/reach-style";
import { markScaleAt, STILL_LAYERS } from "@/lib/geo/signals";
import { asMapLibre, FakeMap } from "@/tests/fixtures/fake-maplibre";
import { BRAZIL, JAPAN, KENYA, MAP_MARKS, MAP_RAMP, MAP_SHAPES, MAP_THEME } from "@/tests/fixtures/map";

const IMAGE = { width: 2, height: 2, data: new Uint8Array(16) };
vi.mock("@/lib/geo/glyphs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/geo/glyphs")>()),
  glyphImage: vi.fn(() => IMAGE),
  cityIcon: vi.fn(() => IMAGE),
}));

/** An engine on a fake map, in an 800 × 500 container, with a frame clock the test turns by hand. */
function start(over: Partial<EngineOptions> = {}) {
  const container = document.createElement("div");
  Object.defineProperties(container, { clientWidth: { value: 800 }, clientHeight: { value: 500 } });
  const frames: FrameRequestCallback[] = [];
  const cancelRaf = vi.fn();
  const handlers = { onReady: vi.fn(), onHover: vi.fn(), onSelect: vi.fn(), onBasemap: vi.fn() };
  const engine = new ReachEngine(asMapLibre(), container, {
    mode: "preview",
    shapes: MAP_SHAPES,
    tiles: "pmtiles://https://ivp.example.gov/map/world.pmtiles/{z}/{x}/{y}",
    theme: MAP_THEME,
    data: { marks: MAP_MARKS, ramp: MAP_RAMP, focus: null },
    signals: "moving",
    label: "World map of the program's meetings",
    raf: (callback) => frames.push(callback),
    cancelRaf,
    ...handlers,
    ...over,
  });
  const map = FakeMap.last as FakeMap;
  return { engine, map, frames, cancelRaf, ...handlers };
}

/** The same, with its first style in. */
function loaded(over: Partial<EngineOptions> = {}) {
  const s = start(over);
  s.map.loadStyle();
  return s;
}

const lastCamera = (map: FakeMap) => map.camera.at(-1) ?? ["none", {}];

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("building the map", () => {
  it("sets the card's map, never drags it: no handlers, no world copies, our own attribution", () => {
    const { map } = start({ describedBy: "map-sentence" });
    expect(map.options).toMatchObject({ interactive: false, renderWorldCopies: false, attributionControl: false, dragRotate: false, locale: { "Map.Title": "World map of the program's meetings" } });
    expect((map.options.style as StyleSpecification).layers.map((l) => l.id)).toContain(LAYERS.glyph);
    expect(map.getCanvas()).toHaveAttribute("aria-describedby", "map-sentence");
    expect(map.getCanvas()).toHaveAttribute("tabindex", "-1");
  });

  it("lets the full screen pan and zoom, from the keyboard too, but never rotate", () => {
    const { map } = start({ mode: "explore" });
    expect(map.options.interactive).toBe(true);
    expect(map.getCanvas()).toHaveAttribute("tabindex", "0");
    expect(map.keyboard.disableRotation).toHaveBeenCalled();
    expect(map.touchZoomRotate.disableRotation).toHaveBeenCalled();
  });

  it("keeps the camera on one world and away from the poles", () => {
    const { map } = start();
    const constrain = map.options.transformConstrain as (lngLat: { lng: number; lat: number }, zoom: number) => { center: { lng: number; lat: number }; zoom: number };
    const kept = constrain({ lng: 200, lat: 88 }, 9);
    expect([kept.center.lng, kept.center.lat, kept.zoom]).toEqual([180, 76, 6]);
  });
});

describe("data", () => {
  it("gives each country with meetings its count, and takes it back when the window moves on", () => {
    const { engine, map } = loaded();
    expect(map.stateOf("shapes", 392)).toMatchObject({ count: 3 });
    expect(map.stateOf("shapes", 404)).toMatchObject({ count: 1 });

    engine.setData({ marks: [JAPAN, BRAZIL], ramp: MAP_RAMP, focus: null });
    expect(map.stateOf("shapes", 404)).toMatchObject({ count: 0 });
    expect(map.getSource("marks")?.setData).toHaveBeenCalledOnce();
  });

  it("swaps the marks and one paint property, and never rebuilds the style for data", () => {
    const { engine, map } = loaded();
    engine.setData({ marks: [KENYA], ramp: MAP_RAMP, focus: null });
    expect(map.styleCalls).toHaveLength(0);
    expect(map.paint.map(([layer, name]) => `${layer}.${name}`)).toEqual(["ivp-fill.fill-color"]);
  });

  it("applies data that arrived while its style was still loading", () => {
    const { engine, map } = start();
    engine.setData({ marks: [KENYA], ramp: MAP_RAMP, focus: null });
    map.loadStyle();
    expect(map.getSource("marks")?.setData).toHaveBeenCalledOnce();
    expect(map.stateOf("shapes", 392)).toEqual({});
    expect(map.stateOf("shapes", 404)).toMatchObject({ count: 1 });
  });
});

describe("pointing and choosing", () => {
  it("lights the country under the pointer, shape and mark, and says where its mark sits", () => {
    const { map, onHover } = loaded();
    map.hits = { [LAYERS.glyph]: [{ properties: { cca2: "JP" } }] };
    map.fire("mousemove", { point: { x: 10, y: 10 } });
    expect(map.stateOf("shapes", 392)).toMatchObject({ hover: true });
    expect(map.stateOf("marks", "JP")).toMatchObject({ hover: true });
    expect(onHover).toHaveBeenLastCalledWith({ cca2: "JP", x: 139.7, y: 35.7, r: glyphRadius(3) * markScaleAt(2) });
    expect(map.getCanvas().style.cursor).toBe("pointer");

    map.hits = {};
    map.fire("mousemove", { point: { x: 400, y: 10 } });
    expect(map.stateOf("marks", "JP")).toMatchObject({ hover: false });
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("finds a tinted country by its shape, and ignores a country with no meetings", () => {
    const { map, onHover } = loaded();
    map.hits = { [LAYERS.fill]: [{ properties: { ccn3: "250" } }] };
    map.fire("mousemove", { point: { x: 1, y: 1 } });
    expect(onHover).not.toHaveBeenCalled();
    map.hits = { [LAYERS.fill]: [{ properties: { ccn3: "404" } }] };
    map.fire("mousemove", { point: { x: 2, y: 2 } });
    expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ cca2: "KE" }));
  });

  it("chooses a country with a click, and lets go with a click on open map", () => {
    const { map, onSelect } = loaded();
    map.hits = { [LAYERS.glyph]: [{ properties: { cca2: "BR" } }] };
    map.fire("click", { point: { x: 5, y: 5 } });
    expect(onSelect).toHaveBeenLastCalledWith("BR");
    map.hits = {};
    map.fire("click", { point: { x: 5, y: 5 } });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("holds the selection in feature state, even for a country outside the window", () => {
    const { engine, map } = loaded({ places: [{ cca2: "FR", ccn3: "250", lng: 2.35, lat: 48.86 }] });
    engine.setSelected("JP");
    expect(map.stateOf("shapes", 392)).toMatchObject({ selected: true });
    engine.setSelected("FR");
    expect(map.stateOf("shapes", 392)).toMatchObject({ selected: false });
    expect(map.stateOf("shapes", 250)).toMatchObject({ selected: true });
    engine.setSelected(null);
    expect(map.stateOf("shapes", 250)).toMatchObject({ selected: false });
  });

  it("lights a country pointed at in a list, without a tooltip", () => {
    const { engine, map, onHover } = loaded();
    engine.setHighlight("KE");
    expect(map.stateOf("shapes", 404)).toMatchObject({ hover: true });
    expect(onHover).not.toHaveBeenCalled();
  });

  it("lets go of the hover when the camera starts to move", () => {
    const { map, onHover } = loaded();
    map.hits = { [LAYERS.glyph]: [{ properties: { cca2: "JP" } }] };
    map.fire("mousemove", { point: { x: 10, y: 10 } });
    map.fire("movestart", {});
    expect(onHover).toHaveBeenLastCalledWith(null);
  });
});

describe("theme", () => {
  it("rebuilds the style only for a new palette or typeface, and restores every state after", () => {
    const { engine, map } = loaded();
    engine.setSelected("JP");
    engine.setTheme({ ...MAP_THEME });
    expect(map.styleCalls).toHaveLength(0);

    engine.setTheme({ palette: MAP_PALETTES["dark-green-standard"], family: MAP_THEME.family });
    expect(map.styleCalls).toHaveLength(1);
    expect(map.styleCalls[0]?.options).toEqual({ diff: false });
    map.loadStyle();
    expect(map.stateOf("shapes", 392)).toMatchObject({ count: 3, selected: true });
  });

  it("draws each mark and city icon on demand, in the current palette, at twice its size", () => {
    const { map } = loaded();
    void map.resolver?.("g:1:0:1:1");
    expect(glyphImage).toHaveBeenCalledWith({ in_person: 1, hybrid: 0, virtual: 1 }, 1, MAP_THEME.palette, 2);
    expect(map.images.get("g:1:0:1:1")?.options).toEqual({ pixelRatio: 2 });
    void map.resolver?.("capital");
    expect(cityIcon).toHaveBeenCalledWith("capital", MAP_THEME.palette, 2);
  });
});

describe("the rings", () => {
  it("move each signaling country's clocks once a frame, and no one else's", () => {
    const { map, frames } = loaded();
    expect(frames).toHaveLength(1);
    frames.shift()?.(1400);
    expect(map.stateOf("marks", "JP")).toMatchObject({ ripple: 0.5, arrive: 1400 / 3200 });
    expect(map.stateOf("marks", "BR")).toMatchObject({ ripple: 0.5 });
    expect(map.stateOf("marks", "KE")).not.toHaveProperty("ripple");
    expect(frames).toHaveLength(1);
  });

  it("stand still when paused, and swap to the still rings", () => {
    const { engine, map, cancelRaf } = loaded();
    engine.setSignalMode("still");
    expect(cancelRaf).toHaveBeenCalled();
    expect(Object.fromEntries(map.layout.map(([layer, , value]) => [layer, value]))).toMatchObject({ "ivp-ripple-a": "none", [STILL_LAYERS.ring]: "visible" });
  });

  it("stop while the map is off screen or the tab is hidden, and start again after", () => {
    const { engine, frames, cancelRaf } = loaded();
    engine.setOnScreen(false);
    expect(cancelRaf).toHaveBeenCalledTimes(1);
    engine.setOnScreen(true);
    expect(frames).toHaveLength(2);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancelRaf).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames).toHaveLength(3);
  });

  it("never start when nothing is signaling", () => {
    const { frames } = loaded({ data: { marks: [KENYA], ramp: MAP_RAMP, focus: null } });
    expect(frames).toHaveLength(0);
  });
});

describe("the camera", () => {
  it("flies home, to a region and to a country, each at its own pace", () => {
    const { engine, map } = loaded();
    engine.move({ kind: "world" });
    expect(lastCamera(map)).toEqual(["flyTo", expect.objectContaining({ duration: CAMERA_MS.world, pitch: 0 })]);
    engine.move({ kind: "bounds", bounds: [[-20, -35], [52, 38]] });
    expect(lastCamera(map)[1]).toMatchObject({ duration: CAMERA_MS.bounds });
    engine.move({ kind: "country", cca2: "JP" });
    const [, japan] = lastCamera(map);
    expect(japan).toMatchObject({ duration: CAMERA_MS.country });
    expect(japan.zoom).toBeLessThanOrEqual(COUNTRY_ZOOM);
  });

  it("never frames a region closer than a country, even when one country is all it has", () => {
    const { engine, map } = loaded();
    engine.move({ kind: "bounds", bounds: [[32.8, -5.3], [40.8, 2.7]] });
    expect(lastCamera(map)[1].zoom).toBe(COUNTRY_ZOOM);
  });

  it("shows a country too small for the atlas at its center, at zoom 4", () => {
    const { engine, map } = loaded();
    engine.move({ kind: "country", cca2: "KE" });
    expect(lastCamera(map)[1]).toMatchObject({ center: [36.8, -1.3], zoom: COUNTRY_ZOOM });
  });

  it("jumps instead of flying under reduced motion", () => {
    const { engine, map } = loaded({ reducedMotion: () => true });
    engine.move({ kind: "country", cca2: "JP" });
    expect(lastCamera(map)[0]).toBe("jumpTo");
  });

  it("tilts in for the tour, then pushes slowly closer; a newer move cancels the push", () => {
    const { engine, map } = loaded();
    engine.move({ kind: "tour", cca2: "JP" });
    expect(lastCamera(map)).toEqual(["flyTo", expect.objectContaining({ pitch: TOUR_VIEW.pitch, zoom: TOUR_VIEW.zoom, duration: CAMERA_MS.tour })]);
    map.fire("moveend");
    expect(lastCamera(map)).toEqual(["easeTo", expect.objectContaining({ zoom: TOUR_VIEW.push, duration: CAMERA_MS.push })]);

    engine.move({ kind: "tour", cca2: "BR" });
    engine.move({ kind: "world" });
    map.fire("moveend");
    expect(lastCamera(map)[0]).toBe("flyTo");
  });

  it("says where its camera is as a move back there: the view it was sent, or the spot the reader panned or zoomed to", () => {
    const { engine, map } = loaded({ mode: "explore" });
    expect(engine.camera()).toEqual({ kind: "world" });
    engine.move({ kind: "country", cca2: "JP" });
    expect(engine.camera()).toEqual({ kind: "country", cca2: "JP" });

    map.center = { lng: 139.7, lat: 35.7 };
    map.zoom = 4.6;
    map.fire("movestart", { originalEvent: new MouseEvent("mousedown") });
    const left = engine.camera();
    expect(left).toEqual({ kind: "at", center: [139.7, 35.7], zoom: 4.6 });

    engine.move({ kind: "tour", cca2: "BR" });
    engine.move(left);
    expect(lastCamera(map)).toEqual(["flyTo", expect.objectContaining({ center: [139.7, 35.7], zoom: 4.6, pitch: 0, duration: CAMERA_MS.at })]);
  });

  it("re-frames into the space the panels free, unless the reader has moved the map", () => {
    const { engine, map } = loaded({ mode: "explore" });
    engine.setPadding({ top: 76, right: 392, bottom: 196, left: 320 });
    expect(lastCamera(map)).toEqual(["easeTo", expect.objectContaining({ padding: { top: 76, right: 392, bottom: 196, left: 320 }, duration: CAMERA_MS.reframe, zoom: expect.any(Number) })]);

    map.fire("movestart", { originalEvent: new MouseEvent("mousedown") });
    engine.setPadding({ top: 76, right: 0, bottom: 76, left: 0 });
    expect(lastCamera(map)).toEqual(["easeTo", { padding: { top: 76, right: 0, bottom: 76, left: 0 }, duration: CAMERA_MS.reframe }]);
  });
});

describe("loading", () => {
  it("is ready once its own land and marks have drawn, without waiting on the basemap", () => {
    const { map, onReady } = loaded();
    map.fire("sourcedata", { sourceId: "shapes" });
    expect(onReady).not.toHaveBeenCalled();
    map.drawOwnSources();
    map.drawOwnSources();
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("says so when the basemap has sent nothing for 10 seconds, and again when it does", () => {
    vi.useFakeTimers();
    const { map, onBasemap } = loaded();
    vi.advanceTimersByTime(TILE_PATIENCE_MS - 1);
    expect(onBasemap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onBasemap).toHaveBeenLastCalledWith(false);
    map.fire("sourcedata", { sourceId: "basemap", tile: {} });
    expect(onBasemap).toHaveBeenLastCalledWith(true);
  });

  it("stays quiet when the first tile arrives in time", () => {
    vi.useFakeTimers();
    const { map, onBasemap } = loaded();
    map.fire("sourcedata", { sourceId: "basemap", tile: {} });
    vi.advanceTimersByTime(TILE_PATIENCE_MS * 2);
    expect(onBasemap).not.toHaveBeenCalled();
  });

  it("cleans up after itself", () => {
    const { engine, map, frames, cancelRaf } = loaded();
    engine.destroy();
    expect(map.removed).toBe(true);
    expect(cancelRaf).toHaveBeenCalled();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames).toHaveLength(1);
  });
});
