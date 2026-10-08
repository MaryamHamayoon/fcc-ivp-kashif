import { geoArea } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Bounds } from "./camera";

/**
 * Country shapes for the map's fill (Natural Earth 1:50m via world-atlas). They also paint the
 * land beneath the basemap, so the map has land before the first tile arrives and still reads
 * if the tiles never come. Keyed by the numeric ISO code, which MapLibre's feature-state uses.
 */

export type ShapeProps = { id: number; ccn3: string };
export type CountryShape = Feature<Polygon | MultiPolygon, ShapeProps>;
export type Shapes = {
  collection: FeatureCollection<Polygon | MultiPolygon, ShapeProps>;
  /** The box around each country's largest landmass, by numeric ISO code. */
  bounds: Map<string, Bounds>;
};

type CountriesTopology = Topology<{ countries: GeometryCollection<{ name?: string }> }>;

/** Antarctica is never drawn and never framed. */
const ANTARCTICA = "010";

/** A ring that jumps more than half the world between two points crosses the antimeridian: its western points move east of 180°. */
export function unwrapRing(ring: Position[]): Position[] {
  const crosses = ring.some((p, i) => i > 0 && Math.abs((p[0] ?? 0) - (ring[i - 1]?.[0] ?? 0)) > 180);
  return crosses ? ring.map(([x = 0, y = 0]) => [x < 0 ? x + 360 : x, y]) : ring;
}

export function unwrapGeometry<G extends Polygon | MultiPolygon>(g: G): G {
  if (g.type === "Polygon") return { ...g, coordinates: g.coordinates.map(unwrapRing) };
  return { ...g, coordinates: (g as MultiPolygon).coordinates.map((p) => p.map(unwrapRing)) };
}

/** The box around a country's largest polygon, so an overseas territory never widens the frame. */
export function largestPolygonBounds(geometry: Polygon | MultiPolygon): Bounds {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let main: Position[][] = [];
  let largest = -1;
  for (const coordinates of polygons) {
    const area = geoArea({ type: "Polygon", coordinates });
    if (area > largest) {
      largest = area;
      main = coordinates;
    }
  }
  const outer = main[0] ?? [];
  const xs = outer.map((p) => p[0] ?? 0);
  const ys = outer.map((p) => p[1] ?? 0);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

export function shapesFromTopology(topo: CountriesTopology): Shapes {
  const collection = feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon | null>;
  const features: CountryShape[] = [];
  const bounds = new Map<string, Bounds>();
  for (const f of collection.features) {
    if (f.id === undefined || f.id === null || !f.geometry) continue; // a few disputed territories carry no ISO code
    const ccn3 = String(f.id).padStart(3, "0");
    if (ccn3 === ANTARCTICA || !/^\d{3}$/.test(ccn3)) continue;
    const geometry = unwrapGeometry(f.geometry);
    features.push({ type: "Feature", id: Number(ccn3), geometry, properties: { id: Number(ccn3), ccn3 } });
    if (!bounds.has(ccn3)) bounds.set(ccn3, largestPolygonBounds(geometry));
  }
  return { collection: { type: "FeatureCollection", features }, bounds };
}

let pending: Promise<Shapes> | null = null;

/** The atlas, loaded once (code-split) and shared by the card and the full screen; a failed load may be tried again. */
export function loadShapes(): Promise<Shapes> {
  pending ??= import("world-atlas/countries-50m.json")
    .then((mod) => shapesFromTopology(((mod as { default?: unknown }).default ?? mod) as CountriesTopology))
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
