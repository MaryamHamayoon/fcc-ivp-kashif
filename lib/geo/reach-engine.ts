import type { FeatureCollection, Point } from "geojson";
import type * as MapLibreModule from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, MapSourceDataEvent, StyleSpecification } from "maplibre-gl";
import { mixTotal } from "@/lib/domain/reach";
import { type Bounds, type CameraTarget, COUNTRY_ZOOM, constrainCamera, fitCamera, type LngLatPair, NO_PADDING, type Padding, WORLD_BOUNDS, ZOOM_MAX, ZOOM_MIN } from "./camera";
import { cityIcon, glyphImage, parseGlyphKey } from "./glyphs";
import { type MapPalette, type Ramp, samePalette } from "./map-palette";
import { fillColor, LAYERS, type MapMark, type MapState, type MarkProps, markFeatures, reachStyle, SOURCES, type TourFocus } from "./reach-style";
import type { Shapes } from "./shapes";
import { createTicker, markScaleAt, type SignalMode, shouldAnimate, signalClock, signalVisibility, type Ticker } from "./signals";

/**
 * The map engine: one MapLibre map, driven by plain calls. The React wrapper (`ReachMap`) hands
 * it data, theme, selection and camera moves; it turns them into the cheapest thing MapLibre
 * offers for each. Data swaps the marks source and sets each country's `count` in feature
 * state; hover and selection are feature state; the ring clocks are feature state, advanced
 * once a frame while the rings can be seen. Only a new palette or typeface rebuilds the style.
 * MapLibre itself is injected, so the page downloads it only when a map is drawn, and tests
 * drive the engine through a fake.
 */

/** The part of `maplibre-gl` the engine uses. */
export type MapLibre = Pick<typeof MapLibreModule, "Map" | "LngLat">;

/** Where a country is: enough to fly to it and to find its shape. A `MapMark`, a `CardCountry` and a `ReachCountry` are all places. */
export type Place = { cca2: string; ccn3: string; lng: number; lat: number };

/** The country under the pointer, with its mark's position and radius on screen, so a tooltip can sit beside it. */
export type MapHover = { cca2: string; x: number; y: number; r: number };

/** Where the camera goes. `at` is a spot the reader left the map on, kept to come back to (`camera()`). */
export type CameraMove = { kind: "world" } | { kind: "bounds"; bounds: Bounds } | { kind: "country"; cca2: string } | { kind: "tour"; cca2: string } | { kind: "at"; center: LngLatPair; zoom: number };

export type EngineTheme = { palette: MapPalette; family: string };
export type EngineData = { marks: readonly MapMark[]; ramp: Ramp; focus: TourFocus | null };

export type EngineOptions = {
  /** "preview" (the card): the camera is set, never dragged, and the page always scrolls. "explore" (the full screen): pan, zoom and keys. */
  mode: "preview" | "explore";
  shapes: Shapes;
  /** The basemap tile template (`basemapTiles`). */
  tiles: string;
  theme: EngineTheme;
  data: EngineData;
  /** Countries the map may be asked about beyond its marks: a search result, a selection outside the window. */
  places?: readonly Place[];
  signals: SignalMode;
  padding?: Padding;
  /** The first framing; the whole world unless said. */
  view?: CameraMove;
  /** The map region's name for screen readers. */
  label: string;
  /** The id of the sentence that describes the map. */
  describedBy?: string;
  /** Asked at each camera move: under reduced motion the camera jumps and the tour cuts. */
  reducedMotion?: () => boolean;
  /** Our own land, fill and marks have drawn: the map can fade in. The basemap may still be on its way. */
  onReady?: () => void;
  onHover?: (hover: MapHover | null) => void;
  onSelect?: (cca2: string | null) => void;
  /** False when no basemap tile has arrived for TILE_PATIENCE_MS; true again when one does. */
  onBasemap?: (available: boolean) => void;
  /** The frame clock; tests pass their own. */
  raf?: (callback: FrameRequestCallback) => number;
  cancelRaf?: (id: number) => void;
};

export const CAMERA_MS = { world: 1300, bounds: 900, country: 1500, tour: 3000, push: 9000, reframe: 450, zoom: 250, at: 1300 } as const;
/** The tour's camera: a tilted flight in, then a slow push closer while the stop is told. */
export const TOUR_VIEW = { zoom: 3.4, pitch: 42, push: 3.75, curve: 1.5 } as const;
/** How long the basemap may take to deliver its first tile before the map says its details are unavailable. */
export const TILE_PATIENCE_MS = 10_000;
/** The mark hit area reaches this far past a small mark, so it can be pointed at without precision. */
const HIT_SLOP = 4;
/** The glyph images are drawn at twice their size, so they stay crisp on dense screens. */
const IMAGE_RATIO = 2;

const WORLD: CameraMove = { kind: "world" };
const samePadding = (a: Padding, b: Padding) => a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

export class ReachEngine {
  readonly map: MapLibreMap;
  private theme: EngineTheme;
  private data: EngineData;
  private marks: FeatureCollection<Point, MarkProps>;
  private markProps = new Map<string, MarkProps>();
  private byCcn3 = new Map<string, string>();
  private places: Map<string, Place>;
  private signaling: string[] = [];
  private counted = new Map<string, number>();
  private mode: SignalMode;
  private padding: Padding;
  private view: CameraMove;
  private moveToken = 0;
  private userMoved = false;
  private styleReady = false;
  private ready = false;
  private onScreen = true;
  private pointer: string | null = null;
  private highlight: string | null = null;
  private selected: string | null = null;
  private lit = new Set<string>();
  private shownSelected: string | null = null;
  /** Bumped by every data change; the style remembers the version it was built with. */
  private version = 0;
  private styleVersion = 0;
  private readonly ticker: Ticker;
  private stall: ReturnType<typeof setTimeout> | null = null;
  private basemap = true;
  private destroyed = false;

  constructor(
    lib: MapLibre,
    private readonly container: HTMLElement,
    private readonly o: EngineOptions,
  ) {
    this.theme = o.theme;
    this.data = o.data;
    this.mode = o.signals;
    this.padding = o.padding ?? NO_PADDING;
    this.view = o.view ?? WORLD;
    this.places = new Map((o.places ?? []).map((p) => [p.cca2, p]));
    this.marks = markFeatures(o.data.marks, o.data.focus);
    this.index();
    this.ticker = createTicker(this.frame, o.raf, o.cancelRaf);

    const explore = o.mode === "explore";
    const first = this.target(this.view);
    this.map = new lib.Map({
      container,
      style: this.style(),
      center: first.center,
      zoom: first.zoom,
      interactive: explore,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      boxZoom: false,
      renderWorldCopies: false,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
      maxPitch: TOUR_VIEW.pitch + 3,
      // The attribution is ours (ReachMap), in the app's type and colors, where the free area is.
      attributionControl: false,
      locale: { "Map.Title": o.label },
      transformConstrain: (lngLat, zoom) => {
        const c = constrainCamera(lngLat.lng, lngLat.lat, zoom);
        return { center: new lib.LngLat(c.lng, c.lat), zoom: c.zoom };
      },
    });
    if (explore) {
      this.map.keyboard.disableRotation();
      this.map.touchZoomRotate.disableRotation();
    }
    if (o.describedBy) this.map.getCanvas().setAttribute("aria-describedby", o.describedBy);
    this.map.jumpTo({ padding: this.padding });
    this.map.setMissingStyleImageResolver((id) => this.drawImage(id));
    this.map.on("style.load", this.onStyleLoad);
    this.map.on("sourcedata", this.onSourceData);
    this.map.on("mousemove", this.onPointerMove);
    this.map.on("mouseout", this.onPointerLeave);
    this.map.on("click", this.onClick);
    this.map.on("movestart", this.onMoveStart);
    this.map.on("resize", this.onResize);
    document.addEventListener("visibilitychange", this.updateTicker);
  }

  /* ------------------------------- inputs -------------------------------- */

  /** A new palette or typeface rebuilds the style; anything else (Light to Hybrid) changes nothing. */
  setTheme(theme: EngineTheme): void {
    if (samePalette(theme.palette, this.theme.palette) && theme.family === this.theme.family) return;
    this.theme = theme;
    this.styleReady = false;
    this.updateTicker();
    // No diff: the old style's images were drawn in the old palette, and must be drawn again.
    this.map.setStyle(this.style(), { diff: false });
  }

  setData(data: EngineData): void {
    this.data = data;
    this.marks = markFeatures(data.marks, data.focus);
    this.version += 1;
    this.index();
    if (this.pointer !== null && !this.markProps.has(this.pointer)) this.hoverOn(null);
    if (this.styleReady) this.pushData();
  }

  setSelected(cca2: string | null): void {
    this.selected = cca2;
    if (this.styleReady) this.applySelected();
  }

  /** A country lit from outside the map: a row pointed at in a list. */
  setHighlight(cca2: string | null): void {
    this.highlight = cca2;
    if (this.styleReady) this.applyHover();
  }

  setSignalMode(mode: SignalMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.styleReady) for (const [id, visibility] of signalVisibility(mode)) this.map.setLayoutProperty(id, "visibility", visibility);
    this.updateTicker();
  }

  setOnScreen(onScreen: boolean): void {
    this.onScreen = onScreen;
    this.updateTicker();
  }

  /** The panels moved: frame the current view into the new free area, or, if the reader has moved the map, just shift it. */
  setPadding(padding: Padding): void {
    if (samePadding(padding, this.padding)) return;
    this.padding = padding;
    const duration = this.reduced() ? 0 : CAMERA_MS.reframe;
    if (this.userMoved) {
      this.map.easeTo({ padding, duration });
      return;
    }
    this.map.easeTo({ ...this.target(this.view), pitch: this.view.kind === "tour" ? TOUR_VIEW.pitch : 0, duration });
  }

  /* -------------------------------- camera ------------------------------- */

  move(to: CameraMove): void {
    this.view = to;
    this.userMoved = false;
    const token = ++this.moveToken;
    this.map.stop();
    const target = this.target(to);
    const reduced = this.reduced();
    if (to.kind === "tour") {
      if (reduced) {
        this.map.jumpTo({ ...target, pitch: TOUR_VIEW.pitch });
        return;
      }
      this.map.flyTo({ ...target, pitch: TOUR_VIEW.pitch, duration: CAMERA_MS.tour, curve: TOUR_VIEW.curve });
      // Once there, a slow push closer; a newer move cancels it.
      this.map.once("moveend", () => {
        if (token === this.moveToken && !this.destroyed) this.map.easeTo({ zoom: TOUR_VIEW.push, duration: CAMERA_MS.push, easing: (t) => t });
      });
      return;
    }
    if (reduced) this.map.jumpTo({ ...target, pitch: 0 });
    else this.map.flyTo({ ...target, pitch: 0, duration: CAMERA_MS[to.kind] });
  }

  /**
   * Where the camera is, as a move that comes back to it: the view it was last sent, or, once the
   * reader has panned or zoomed, the spot they left it on. The tour keeps it, to hand the map back.
   */
  camera(): CameraMove {
    if (!this.userMoved) return this.view;
    const { lng, lat } = this.map.getCenter();
    return { kind: "at", center: [lng, lat], zoom: this.map.getZoom() };
  }

  zoomBy(delta: 1 | -1): void {
    this.userMoved = true;
    const options = { duration: this.reduced() ? 0 : CAMERA_MS.zoom };
    if (delta > 0) this.map.zoomIn(options);
    else this.map.zoomOut(options);
  }

  destroy(): void {
    this.destroyed = true;
    this.ticker.stop();
    if (this.stall) clearTimeout(this.stall);
    document.removeEventListener("visibilitychange", this.updateTicker);
    this.map.remove();
  }

  /* ------------------------------- private ------------------------------- */

  private reduced(): boolean {
    return this.o.reducedMotion?.() ?? false;
  }

  private style(): StyleSpecification {
    this.styleVersion = this.version;
    return reachStyle({
      palette: this.theme.palette,
      family: this.theme.family,
      tiles: this.o.tiles,
      ramp: this.data.ramp,
      shapes: this.o.shapes.collection,
      marks: this.marks,
      signals: this.mode,
    });
  }

  private index(): void {
    this.markProps = new Map(this.marks.features.map((f) => [f.properties.cca2, f.properties]));
    this.signaling = this.marks.features.filter((f) => f.properties.up !== "").map((f) => f.properties.cca2);
    this.byCcn3 = new Map(this.data.marks.map((m) => [m.ccn3, m.cca2]));
    for (const m of this.data.marks) if (!this.places.has(m.cca2)) this.places.set(m.cca2, m);
  }

  private target(to: CameraMove): CameraTarget {
    if (to.kind === "at") return { center: to.center, zoom: to.zoom, padding: this.padding, bearing: 0 };
    const size = { width: this.container.clientWidth, height: this.container.clientHeight };
    if (to.kind === "world") return fitCamera(WORLD_BOUNDS, size, this.padding);
    // A region never comes closer than a country would, even when one country is all it has.
    if (to.kind === "bounds") return fitCamera(to.bounds, size, this.padding, { maxZoom: COUNTRY_ZOOM });
    const place = this.places.get(to.cca2);
    if (!place) return fitCamera(WORLD_BOUNDS, size, this.padding);
    const at: CameraTarget = { center: [place.lng, place.lat], zoom: to.kind === "tour" ? TOUR_VIEW.zoom : COUNTRY_ZOOM, padding: this.padding, bearing: 0 };
    if (to.kind === "tour") return at;
    // Frame the largest landmass, so an overseas territory never widens the view; a country too small for the atlas gets its center.
    const shape = this.o.shapes.bounds.get(place.ccn3);
    return shape ? fitCamera(shape, size, this.padding, { maxZoom: COUNTRY_ZOOM, margin: 60 }) : at;
  }

  private setCountry(cca2: string, state: MapState): void {
    const ccn3 = this.places.get(cca2)?.ccn3;
    if (ccn3) this.map.setFeatureState({ source: SOURCES.shapes, id: Number(ccn3) }, state);
    this.map.setFeatureState({ source: SOURCES.marks, id: cca2 }, state);
  }

  private pushData(): void {
    (this.map.getSource(SOURCES.marks) as GeoJSONSource | undefined)?.setData(this.marks);
    this.map.setPaintProperty(LAYERS.fill, "fill-color", fillColor(this.data.ramp, this.theme.palette.land));
    this.styleVersion = this.version;
    this.applyCounts();
    this.applyHover();
    this.applySelected();
    this.updateTicker();
  }

  private applyCounts(): void {
    const next = new Map(this.data.marks.map((m) => [m.ccn3, mixTotal(m.mix)]));
    for (const ccn3 of this.counted.keys()) if (!next.has(ccn3)) this.map.setFeatureState({ source: SOURCES.shapes, id: Number(ccn3) }, { count: 0 });
    for (const [ccn3, count] of next) if (this.counted.get(ccn3) !== count) this.map.setFeatureState({ source: SOURCES.shapes, id: Number(ccn3) }, { count });
    this.counted = next;
  }

  private applyHover(): void {
    const next = new Set([this.pointer, this.highlight].filter((c): c is string => c !== null));
    for (const cca2 of this.lit) if (!next.has(cca2)) this.setCountry(cca2, { hover: false });
    for (const cca2 of next) if (!this.lit.has(cca2)) this.setCountry(cca2, { hover: true });
    this.lit = next;
  }

  private applySelected(): void {
    if (this.shownSelected === this.selected) return;
    if (this.shownSelected) this.setCountry(this.shownSelected, { selected: false });
    if (this.selected) this.setCountry(this.selected, { selected: true });
    this.shownSelected = this.selected;
  }

  /** A new style starts with no feature state: give it everything again. */
  private onStyleLoad = (): void => {
    this.styleReady = true;
    this.counted = new Map();
    this.lit = new Set();
    this.shownSelected = null;
    if (this.styleVersion !== this.version) this.pushData();
    this.applyCounts();
    this.applyHover();
    this.applySelected();
    this.watchTiles();
    this.updateTicker();
    this.checkReady();
  };

  private watchTiles(): void {
    if (this.stall) clearTimeout(this.stall);
    this.stall = setTimeout(() => {
      this.stall = null;
      if (!this.basemap) return;
      this.basemap = false;
      this.o.onBasemap?.(false);
    }, TILE_PATIENCE_MS);
  }

  private onSourceData = (e: MapSourceDataEvent): void => {
    if (e.sourceId === SOURCES.basemap && e.tile) {
      if (this.stall) clearTimeout(this.stall);
      this.stall = null;
      if (!this.basemap) {
        this.basemap = true;
        this.o.onBasemap?.(true);
      }
    }
    this.checkReady();
  };

  private checkReady(): void {
    if (this.ready || !this.styleReady) return;
    if (!this.map.isSourceLoaded(SOURCES.shapes) || !this.map.isSourceLoaded(SOURCES.marks)) return;
    this.ready = true;
    this.o.onReady?.();
  }

  /** The country under a point: a mark first (with a little slop, marks are small), then a tinted country. */
  private hit(x: number, y: number): string | null {
    if (!this.styleReady) return null;
    for (const f of this.map.queryRenderedFeatures([[x - HIT_SLOP, y - HIT_SLOP], [x + HIT_SLOP, y + HIT_SLOP]], { layers: [LAYERS.glyph] })) {
      const cca2: unknown = f.properties?.cca2;
      if (typeof cca2 === "string" && this.markProps.has(cca2)) return cca2;
    }
    for (const f of this.map.queryRenderedFeatures([x, y], { layers: [LAYERS.fill] })) {
      const cca2 = this.byCcn3.get(String(f.properties?.ccn3 ?? ""));
      if (cca2) return cca2;
    }
    return null;
  }

  private hoverOn(cca2: string | null): void {
    if (cca2 === this.pointer) return;
    this.pointer = cca2;
    this.map.getCanvas().style.cursor = cca2 ? "pointer" : "";
    if (this.styleReady) this.applyHover();
    this.o.onHover?.(cca2 ? this.anchor(cca2) : null);
  }

  private anchor(cca2: string): MapHover | null {
    const place = this.places.get(cca2);
    if (!place) return null;
    const { x, y } = this.map.project([place.lng, place.lat]);
    return { cca2, x, y, r: (this.markProps.get(cca2)?.rr ?? 0) * markScaleAt(this.map.getZoom()) };
  }

  private onPointerMove = (e: MapMouseEvent): void => this.hoverOn(this.hit(e.point.x, e.point.y));
  private onPointerLeave = (): void => this.hoverOn(null);
  private onClick = (e: MapMouseEvent): void => this.o.onSelect?.(this.hit(e.point.x, e.point.y));

  private onMoveStart = (e: { originalEvent?: Event }): void => {
    if (e.originalEvent) this.userMoved = true;
    this.hoverOn(null);
  };

  /** The card's width changes with the window: keep the current view framed, unless the reader has moved the map. */
  private onResize = (): void => {
    if (this.userMoved || this.map.isMoving()) return;
    this.map.jumpTo({ ...this.target(this.view), pitch: this.view.kind === "tour" ? TOUR_VIEW.pitch : 0 });
  };

  private frame = (now: number): void => {
    const clock = signalClock(now);
    for (const cca2 of this.signaling) this.map.setFeatureState({ source: SOURCES.marks, id: cca2 }, clock);
  };

  private updateTicker = (): void => {
    const run =
      !this.destroyed &&
      this.styleReady &&
      shouldAnimate({ mode: this.mode, signaling: this.signaling.length > 0, onScreen: this.onScreen, tabVisible: document.visibilityState !== "hidden" });
    if (run) this.ticker.start();
    else this.ticker.stop();
  };

  private drawImage(id: string): void {
    const p = this.theme.palette;
    if (id === "capital" || id === "townspot") {
      this.map.addImage(id, cityIcon(id, p, IMAGE_RATIO), { pixelRatio: IMAGE_RATIO });
      return;
    }
    const glyph = parseGlyphKey(id);
    if (glyph) this.map.addImage(id, glyphImage(glyph.mix, glyph.scale, p, IMAGE_RATIO), { pixelRatio: IMAGE_RATIO });
  }
}
