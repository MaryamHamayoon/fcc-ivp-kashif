// @vitest-environment node
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { glyphKey, glyphRadius } from "@/lib/geo/glyphs";
import { MAP_PALETTES, ramp } from "@/lib/geo/map-palette";
import { DIMMED, FILL_OPACITY, FOCUS_SCALE, fillColor, LAYERS, type MapMark, markFeatures, phaseOf, reachStyle, SOURCES } from "@/lib/geo/reach-style";
import type { ShapeProps } from "@/lib/geo/shapes";
import type { SignalMode } from "@/lib/geo/signals";
import { basemapTiles } from "@/lib/geo/tiles";
import { evaluate, rgba } from "@/tests/fixtures/style";

const p = MAP_PALETTES["light-green-standard"];
const JAPAN: MapMark = { cca2: "JP", ccn3: "392", lng: 139.7, lat: 35.7, mix: { in_person: 2, hybrid: 1, virtual: 0 }, signal: "hybrid" };
const KENYA: MapMark = { cca2: "KE", ccn3: "404", lng: 36.8, lat: -1.3, mix: { in_person: 0, hybrid: 0, virtual: 1 }, signal: null };
const SHAPES: FeatureCollection<Polygon | MultiPolygon, ShapeProps> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: 392,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [130, 31],
            [142, 31],
            [142, 45],
            [130, 45],
            [130, 31],
          ],
        ],
      },
      properties: { id: 392, ccn3: "392" },
    },
  ],
};

const styleWith = (signals: SignalMode = "moving") =>
  reachStyle({ palette: p, family: "Public Sans", tiles: basemapTiles("https://ivp.example.gov/map/world.pmtiles"), ramp: ramp(p, 3), shapes: SHAPES, marks: markFeatures([JAPAN, KENYA]), signals });

describe("the marks", () => {
  it("carry each country's count, size, glyph and signal", () => {
    const [jp, ke] = markFeatures([JAPAN, KENYA]).features;
    expect(jp?.geometry.coordinates).toEqual([139.7, 35.7]);
    expect(jp?.properties).toEqual({ cca2: "JP", n: 3, s: 1, rr: glyphRadius(3), img: "g:2:1:0:1", up: "hybrid", ph: phaseOf("JP"), o: 1, k: -3 });
    expect(ke?.properties).toMatchObject({ n: 1, up: "", o: 1, k: -1 });
  });

  it("draw a smaller mark above a larger one, so a busy neighbor never buries it", () => {
    const [jp, ke] = markFeatures([JAPAN, KENYA]).features;
    expect(ke?.properties.k).toBeGreaterThan(jp?.properties.k ?? 0);
    const glyphs = styleWith().layers.find((l) => l.id === LAYERS.glyph);
    expect(glyphs?.layout).toMatchObject({ "icon-allow-overlap": true, "symbol-sort-key": ["get", "k"] });
  });

  it("start each country's signal at its own phase", () => {
    expect(phaseOf("JP")).toBe(phaseOf("JP"));
    expect(new Set(["JP", "KE", "BR", "DE", "GB", "FJ"].map(phaseOf)).size).toBe(6);
    for (const cc of ["JP", "KE", "BR", "DE", "GB", "FJ"]) {
      expect(phaseOf(cc)).toBeGreaterThanOrEqual(0);
      expect(phaseOf(cc)).toBeLessThan(1);
    }
  });

  it("on the tour, show the focus country's told visit alone and larger, and dim the rest", () => {
    const [jp, ke] = markFeatures([JAPAN, KENYA], { cca2: "KE", format: "virtual" }).features;
    expect(ke?.properties).toMatchObject({ n: 1, s: FOCUS_SCALE, rr: glyphRadius(1) * FOCUS_SCALE, img: glyphKey({ in_person: 0, hybrid: 0, virtual: 1 }, FOCUS_SCALE), up: "virtual", o: 1, k: 1000 });
    expect(jp?.properties).toMatchObject({ s: 1, up: "", o: DIMMED });
  });
});

describe("the choropleth", () => {
  const r = ramp(p, 9);
  const fill = (count: number, zoom = 1) => ({
    color: evaluate("fill", "paint", "fill-color", fillColor(r, p.land), { zoom, state: { count } }),
    opacity: evaluate("fill", "paint", "fill-opacity", FILL_OPACITY, { zoom, state: { count } }),
  });

  it("steps a country's fill by its meeting count, up to the window's maximum", () => {
    expect(r.thresholds).toEqual([1, 4, 6, 8]);
    expect([1, 3, 4, 5, 6, 7, 8, 9].map((n) => fill(n).color)).toEqual([0, 0, 1, 1, 2, 2, 3, 3].map((i) => rgba(r.colors[i] ?? "")));
  });

  it("leaves a country without meetings untinted", () => {
    expect(fill(0).opacity).toBe(0);
    expect(fill(0, 5).opacity).toBe(0);
  });

  it("is solid at world zoom and thins as the reader zooms in", () => {
    expect([1, 2.5, 4, 5.5, 6].map((z) => fill(3, z).opacity)).toEqual([1, 1, 0.5, 0.32, 0.32]);
  });
});

describe("the style", () => {
  it("stacks the layers from the ground up to the marks", () => {
    expect(styleWith().layers.map((l) => l.id)).toEqual([
      "background",
      LAYERS.land,
      "earth",
      "landcover",
      "water",
      "roads_highway",
      LAYERS.fill,
      LAYERS.wash,
      "boundaries_country",
      "boundaries_disputed",
      "boundaries",
      "water_label_ocean",
      "earth_label_islands",
      "water_label_lakes",
      "cities_capital",
      "cities_other",
      "places_country",
      LAYERS.outline,
      "ivp-arrive-a",
      "ivp-arrive-b",
      "ivp-ripple-a",
      "ivp-ripple-b",
      "ivp-still-halo",
      "ivp-still",
      LAYERS.ring,
      LAYERS.glyph,
    ]);
  });

  it("reads the basemap from our file and keys shapes and marks for feature state", () => {
    const { sources } = styleWith();
    expect(sources[SOURCES.basemap]).toMatchObject({ type: "vector", tiles: ["pmtiles://https://ivp.example.gov/map/world.pmtiles/{z}/{x}/{y}"], maxzoom: 5 });
    expect(JSON.stringify(sources[SOURCES.basemap])).toMatch(/OpenStreetMap.*Natural Earth/);
    expect(sources[SOURCES.shapes]).toMatchObject({ type: "geojson", promoteId: "id" });
    expect(sources[SOURCES.marks]).toMatchObject({ type: "geojson", promoteId: "cca2" });
  });

  it.each(["moving", "still"] as const)("passes MapLibre's own validation (%s signals)", (signals) => {
    expect(validateStyleMin(styleWith(signals)).map((e) => e.message)).toEqual([]);
  });

  it("paints land under the basemap, so the map reads before the tiles arrive or if they never do", () => {
    const land = styleWith().layers.find((l) => l.id === LAYERS.land);
    expect(land).toMatchObject({ type: "fill", source: SOURCES.shapes, paint: { "fill-color": p.land } });
  });

  it("names each country in English, or by its own name where the tiles' English one is a one-letter slip", () => {
    const names = styleWith().layers.find((l) => l.id === "places_country");
    const field = names?.type === "symbol" ? names.layout?.["text-field"] : undefined;
    const say = (properties: Record<string, unknown>) => String(evaluate("symbol", "layout", "text-field", field, { zoom: 3, properties }));
    expect(say({ "name:en": "Egypt", name: "مصر" })).toBe("Egypt");
    // Türkiye's English name in the tiles is "T".
    expect(say({ "name:en": "T", name: "Türkiye" })).toBe("Türkiye");
    expect(say({ name: "Maroc" })).toBe("Maroc");
  });

  it("washes and outlines a hovered or selected country in the brand color", () => {
    const layer = (id: string) => styleWith().layers.find((l) => l.id === id);
    const wash = layer(LAYERS.wash)?.paint as Record<string, unknown>;
    const outline = layer(LAYERS.outline)?.paint as Record<string, unknown>;
    const washAt = (state: Record<string, boolean>) => evaluate("fill", "paint", "fill-opacity", wash["fill-opacity"], { zoom: 3, state });
    expect([washAt({}), washAt({ hover: true }), washAt({ selected: true })]).toEqual([0, 0.08, 0.14]);
    expect(evaluate("line", "paint", "line-width", outline["line-width"], { zoom: 3, state: { selected: true } })).toBe(2);
    expect(evaluate("line", "paint", "line-width", outline["line-width"], { zoom: 3, state: { hover: true } })).toBe(1.3);
    expect(evaluate("line", "paint", "line-opacity", outline["line-opacity"], { zoom: 3, state: { hover: true } })).toBe(0.9);
    expect(evaluate("line", "paint", "line-opacity", outline["line-opacity"], { zoom: 3, state: {} })).toBe(0);
    expect(wash["fill-color"]).toBe(p.brand);
  });

  it("rings a hovered mark outside its still ring, never over it", () => {
    const ring = styleWith().layers.find((l) => l.id === LAYERS.ring)?.paint as Record<string, unknown>;
    const radius = (up: string) => evaluate("circle", "paint", "circle-radius", ring["circle-radius"], { zoom: 5, properties: { rr: 10, up } });
    expect(radius("")).toBe(13.5); // 10 + 3 + 0.5 × 1
    expect(radius("virtual")).toBe(17.5); // outside the still ring at 14, whose halo reaches 16
    expect(evaluate("circle", "paint", "circle-stroke-opacity", ring["circle-stroke-opacity"], { zoom: 5, state: { selected: true } })).toBe(0.9);
    expect(evaluate("circle", "paint", "circle-stroke-opacity", ring["circle-stroke-opacity"], { zoom: 5, state: { hover: true } })).toBe(0.55);
  });

  it("builds the signals in the mode it is given", () => {
    const visibility = (signals: SignalMode) => Object.fromEntries(styleWith(signals).layers.filter((l) => l.id.startsWith("ivp-arrive") || l.id.startsWith("ivp-still")).map((l) => [l.id, l.layout?.visibility]));
    expect(visibility("moving")).toEqual({ "ivp-arrive-a": "visible", "ivp-arrive-b": "visible", "ivp-still-halo": "none", "ivp-still": "none" });
    expect(visibility("still")).toEqual({ "ivp-arrive-a": "none", "ivp-arrive-b": "none", "ivp-still-halo": "visible", "ivp-still": "visible" });
  });
});
