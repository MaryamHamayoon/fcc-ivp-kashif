import type { StyleSpecification } from "maplibre-gl";
import type { MapLibre } from "@/lib/geo/reach-engine";

/**
 * A stand-in for `maplibre-gl` (jsdom has no WebGL): it records what the engine asks of the map
 * — style, sources, feature state, paint and layout, camera, images — and lets a test fire the
 * map's own events. It keeps the few behaviors the engine relies on: a new style discards all
 * feature state, `once` listeners run once, and the canvas carries MapLibre's name and role.
 */

type Listener = (event: never) => void;
type Hit = { properties: Record<string, unknown> };

export class FakeMap {
  /** The most recently created map. */
  static last: FakeMap | null = null;

  readonly options: Record<string, unknown>;
  style: StyleSpecification;
  readonly styleCalls: { style: StyleSpecification; options: unknown }[] = [];
  readonly paint: [layer: string, name: string, value: unknown][] = [];
  readonly layout: [layer: string, name: string, value: unknown][] = [];
  readonly camera: [method: string, options: Record<string, unknown>][] = [];
  readonly images = new Map<string, { image: unknown; options: unknown }>();
  readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  /** What `queryRenderedFeatures` finds, by layer id. */
  hits: Record<string, Hit[]> = {};
  /** Which sources report themselves loaded. */
  readonly loadedSources = new Set<string>();
  zoom = 2;
  center = { lng: 0, lat: 20 };
  moving = false;
  removed = false;
  resolver: ((id: string) => void | Promise<void>) | null = null;
  readonly keyboard = { disableRotation: vi.fn() };
  readonly touchZoomRotate = { disableRotation: vi.fn() };
  private readonly state = new Map<string, Record<string, unknown>>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly canvas = document.createElement("canvas");

  constructor(options: Record<string, unknown>) {
    this.options = options;
    this.style = options.style as StyleSpecification;
    const locale = options.locale as Record<string, string> | undefined;
    this.canvas.setAttribute("aria-label", locale?.["Map.Title"] ?? "Map");
    this.canvas.setAttribute("role", "region");
    this.canvas.setAttribute("tabindex", options.interactive ? "0" : "-1");
    (options.container as HTMLElement).append(this.canvas);
    FakeMap.last = this;
  }

  on(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
    return this;
  }
  once(type: string, listener: Listener) {
    const wrapped: Listener = (event) => {
      this.off(type, wrapped);
      listener(event);
    };
    return this.on(type, wrapped);
  }
  off(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
    return this;
  }
  /** Fires one of the map's events at its listeners. */
  fire(type: string, event: Record<string, unknown> = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event as never);
  }
  /** What MapLibre does once a style is in: its sources exist, and `style.load` fires. */
  loadStyle() {
    for (const id of Object.keys(this.style.sources)) if (!this.sources.has(id)) this.sources.set(id, { setData: vi.fn() });
    this.fire("style.load");
  }
  /** Our own sources have drawn: the engine may call itself ready. */
  drawOwnSources() {
    this.loadedSources.add("shapes");
    this.loadedSources.add("marks");
    this.fire("sourcedata", { sourceId: "shapes" });
  }

  setStyle(style: StyleSpecification, options?: unknown) {
    this.style = style;
    this.styleCalls.push({ style, options });
    this.state.clear();
    this.sources.clear();
    return this;
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  isSourceLoaded(id: string) {
    return this.loadedSources.has(id);
  }
  setFeatureState(target: { source: string; id?: string | number }, state: Record<string, unknown>) {
    const key = `${target.source}:${String(target.id)}`;
    this.state.set(key, { ...this.state.get(key), ...state });
    return this;
  }
  /** The feature state a source holds for one id. */
  stateOf(source: string, id: string | number): Record<string, unknown> {
    return this.state.get(`${source}:${String(id)}`) ?? {};
  }
  setPaintProperty(layer: string, name: string, value: unknown) {
    this.paint.push([layer, name, value]);
    return this;
  }
  setLayoutProperty(layer: string, name: string, value: unknown) {
    this.layout.push([layer, name, value]);
    return this;
  }
  queryRenderedFeatures(_geometry: unknown, options: { layers: string[] }) {
    return options.layers.flatMap((id) => (this.hits[id] ?? []).map((hit) => ({ ...hit, layer: { id } })));
  }
  /** Degrees become pixels one to one, so a test can read a projected point at a glance. */
  project([lng, lat]: [number, number]) {
    return { x: lng, y: lat };
  }
  getZoom() {
    return this.zoom;
  }
  getCenter() {
    return { ...this.center };
  }
  getCanvas() {
    return this.canvas;
  }
  getContainer() {
    return this.options.container as HTMLElement;
  }
  isMoving() {
    return this.moving;
  }
  jumpTo(options: Record<string, unknown>) {
    this.camera.push(["jumpTo", options]);
    return this;
  }
  flyTo(options: Record<string, unknown>) {
    this.camera.push(["flyTo", options]);
    return this;
  }
  easeTo(options: Record<string, unknown>) {
    this.camera.push(["easeTo", options]);
    return this;
  }
  zoomIn(options: Record<string, unknown>) {
    this.camera.push(["zoomIn", options]);
    return this;
  }
  zoomOut(options: Record<string, unknown>) {
    this.camera.push(["zoomOut", options]);
    return this;
  }
  stop() {
    return this;
  }
  setMissingStyleImageResolver(resolver: (id: string) => void | Promise<void>) {
    this.resolver = resolver;
    return this;
  }
  addImage(id: string, image: unknown, options?: unknown) {
    this.images.set(id, { image, options });
    return this;
  }
  remove() {
    this.removed = true;
    this.canvas.remove();
  }
}

export class FakeLngLat {
  constructor(
    readonly lng: number,
    readonly lat: number,
  ) {}
}

/** The module as `import("maplibre-gl")` would give it. */
export const fakeMapLibre = { Map: FakeMap, LngLat: FakeLngLat, addProtocol: vi.fn(), setWorkerUrl: vi.fn() };

export const asMapLibre = (): MapLibre => fakeMapLibre as unknown as MapLibre;
