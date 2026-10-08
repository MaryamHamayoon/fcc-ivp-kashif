import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import { emptyMix, type FormatMix, mixTotal } from "@/lib/domain/reach";
import type { MeetingFormat } from "@/lib/domain/types";
import { basemapLayers } from "./basemap";
import { glyphKey, glyphRadius } from "./glyphs";
import type { MapPalette, Ramp } from "./map-palette";
import type { ShapeProps } from "./shapes";
import { byMarkZoom, markRadius, SIGNALING, type SignalMode, STILL_GAP, signalLayers, stillLayers } from "./signals";
import { BASEMAP_MAX_ZOOM } from "./tiles";

/**
 * The whole map style, bottom to top: the basemap's ground, our own land shapes (so the map has
 * land before the first tile arrives, and still reads if none ever do), the choropleth and its
 * hover wash, the basemap's borders and labels, the country outline, the signals, the hover ring
 * and the format marks. Pure: the engine builds it once per palette and typeface, then changes
 * only data, feature state, the fill's steps and which rings show.
 */

export const SOURCES = { basemap: "basemap", shapes: "shapes", marks: "marks" } as const;
export const LAYERS = { land: "ivp-land", fill: "ivp-fill", wash: "ivp-wash", outline: "ivp-outline", ring: "ivp-ring", glyph: "ivp-glyph" } as const;

export const ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a>';

/** What the map needs about one country: where its mark sits, its format mix, and the format of its soonest visit on the way. A `CardCountry` is one. */
export type MapMark = { cca2: string; ccn3: string; lng: number; lat: number; mix: FormatMix; signal: MeetingFormat | null };

/** On the tour, the country in focus shows only the visit being told, larger, and every other mark steps back. */
export type TourFocus = { cca2: string; format: MeetingFormat };
export const FOCUS_SCALE = 1.7;
export const DIMMED = 0.4;

export type MarkProps = {
  cca2: string;
  /** Meetings in the mark. */
  n: number;
  /** 1, or FOCUS_SCALE for the tour's focus. */
  s: number;
  /** The mark's full-size radius in px. */
  rr: number;
  /** The glyph image's key. */
  img: string;
  /** The signal's format, or "" when the country does not signal. */
  up: MeetingFormat | "";
  /** The signal's own phase, 0–1. */
  ph: number;
  o: number;
  /** Draw order: a higher key draws on top. */
  k: number;
};

/** The feature state the engine sets: a country's count on its shape, hover and selection on shape and mark. */
export type MapState = { count?: number; hover?: boolean; selected?: boolean };

/** A country's own signal phase, fixed by its code, so the map breathes rather than pulsing in unison. */
export function phaseOf(cca2: string): number {
  let h = 2166136261;
  for (let i = 0; i < cca2.length; i++) {
    h ^= cca2.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 997) / 997;
}

/** The marks as map features. A smaller mark draws above a larger one, so a busy neighbor never buries it; the tour's focus draws above all. */
export function markFeatures(marks: readonly MapMark[], focus: TourFocus | null = null): FeatureCollection<Point, MarkProps> {
  return {
    type: "FeatureCollection",
    features: marks.map((m) => {
      const inFocus = focus !== null && focus.cca2 === m.cca2;
      const s = inFocus ? FOCUS_SCALE : 1;
      const mix: FormatMix = inFocus ? { ...emptyMix(), [focus.format]: 1 } : m.mix;
      const n = mixTotal(mix);
      const up = focus ? (inFocus ? focus.format : "") : (m.signal ?? "");
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [m.lng, m.lat] },
        properties: { cca2: m.cca2, n, s, rr: glyphRadius(n) * s, img: glyphKey(mix, s), up, ph: phaseOf(m.cca2), o: focus && !inFocus ? DIMMED : 1, k: inFocus ? 1000 : -n },
      };
    }),
  };
}

export const COUNT: ExpressionSpecification = ["coalesce", ["feature-state", "count"], 0];
const HOVER: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
const SELECTED: ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
const NONE: ExpressionSpecification = ["==", COUNT, 0];

/** A country's fill: the ramp's step for its count; plain land (and no fill at all) without meetings. */
export function fillColor(r: Ramp, land: string): ExpressionSpecification {
  return ["step", COUNT, land, ...r.colors.flatMap((color, i) => [r.thresholds[i] ?? 1, color])];
}

/** Solid at world zoom, thinning as the reader zooms in (50% at 4, 32% at 5.5) so the basemap's detail shows through. */
export const FILL_OPACITY: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 2.5, ["case", NONE, 0, 1], 4, ["case", NONE, 0, 0.5], 5.5, ["case", NONE, 0, 0.32]];

export type StyleInput = {
  palette: MapPalette;
  /** The interface typeface. */
  family: string;
  /** The basemap tile template (`basemapTiles`). */
  tiles: string;
  ramp: Ramp;
  shapes: FeatureCollection<Polygon | MultiPolygon, ShapeProps>;
  marks: FeatureCollection<Point, MarkProps>;
  signals: SignalMode;
};

export function reachStyle({ palette: p, family, tiles, ramp, shapes, marks, signals }: StyleInput): StyleSpecification {
  const base = basemapLayers(p, family, SOURCES.basemap);
  const borders = base.findIndex((l) => l.id === "boundaries_country");
  const layers: LayerSpecification[] = [
    ...base.slice(0, 1),
    { id: LAYERS.land, type: "fill", source: SOURCES.shapes, paint: { "fill-color": p.land } },
    ...base.slice(1, borders),
    { id: LAYERS.fill, type: "fill", source: SOURCES.shapes, paint: { "fill-color": fillColor(ramp, p.land), "fill-opacity": FILL_OPACITY } },
    { id: LAYERS.wash, type: "fill", source: SOURCES.shapes, paint: { "fill-color": p.brand, "fill-opacity": ["case", SELECTED, 0.14, HOVER, 0.08, 0] } },
    ...base.slice(borders),
    { id: LAYERS.outline, type: "line", source: SOURCES.shapes, paint: { "line-color": p.brand, "line-width": ["case", SELECTED, 2, 1.3], "line-opacity": ["case", ["any", HOVER, SELECTED], 0.9, 0] } },
    ...signalLayers(p, signals, SOURCES.marks),
    ...stillLayers(p, signals, SOURCES.marks),
    {
      id: LAYERS.ring,
      type: "circle",
      source: SOURCES.marks,
      paint: {
        // A signaling country's still ring sits at the mark's edge; the hover ring goes outside it, never over it.
        "circle-radius": byMarkZoom((z) => ["+", markRadius(z), ["case", SIGNALING, STILL_GAP + 3 + 0.5 * z, 3 + 0.5 * z]]),
        "circle-opacity": 0,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": p.labelCity,
        "circle-stroke-opacity": ["case", SELECTED, 0.9, HOVER, 0.55, 0],
      },
    },
    {
      id: LAYERS.glyph,
      type: "symbol",
      source: SOURCES.marks,
      layout: { "icon-image": ["get", "img"], "icon-size": byMarkZoom((z) => z), "icon-allow-overlap": true, "icon-padding": 0, "symbol-sort-key": ["get", "k"] },
      paint: { "icon-opacity": ["get", "o"] },
    },
  ];
  return {
    version: 8,
    sources: {
      [SOURCES.basemap]: { type: "vector", tiles: [tiles], maxzoom: BASEMAP_MAX_ZOOM, attribution: ATTRIBUTION },
      [SOURCES.shapes]: { type: "geojson", data: shapes, promoteId: "id" },
      [SOURCES.marks]: { type: "geojson", data: marks, promoteId: "cca2" },
    },
    layers,
  };
}
