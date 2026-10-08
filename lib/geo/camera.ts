/**
 * Framing the map's camera. MapLibre draws Web Mercator on 512 px tiles; these helpers speak its
 * terms (degrees in, a center and a zoom out) and always frame into the part of the map no panel
 * covers. The padding travels with the camera, so MapLibre centers the frame in the free space
 * and "whole world" or "fly to Japan" lands where the reader can see it. Pure; no MapLibre here.
 */

export type LngLatPair = [number, number];
/** [[west, south], [east, north]] in degrees; east may pass 180 for a frame across the antimeridian. */
export type Bounds = [LngLatPair, LngLatPair];
export type Padding = { top: number; right: number; bottom: number; left: number };
export type CameraTarget = { center: LngLatPair; zoom: number; padding: Padding; bearing: 0 };

export const NO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

/** The inhabited world the map opens on, Alaska to New Zealand: no Antarctica, no polar stretch. */
export const WORLD_BOUNDS: Bounds = [
  [-122, -44],
  [148, 64],
];
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 6;
export const LAT_MIN = -62;
export const LAT_MAX = 76;
/** How close a country with no shape to frame is shown: its center, at this zoom. */
export const COUNTRY_ZOOM = 4;
/** Degrees added around a region's country centers, so its frame holds the countries and not only their centers. */
export const REGION_PAD = 4;

const TILE = 512;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mercX = (lng: number) => (lng + 180) / 360;
function mercY(lat: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** The camera that frames `bounds` inside the part of a `size` map that `padding` leaves free, `margin` in from its edges. */
export function fitCamera(bounds: Bounds, size: { width: number; height: number }, padding: Padding = NO_PADDING, { maxZoom = 5, margin = 16 } = {}): CameraTarget {
  const [[w, s], [e, n]] = bounds;
  const dx = Math.max(mercX(e) - mercX(w), 1e-4);
  const dy = Math.max(mercY(s) - mercY(n), 1e-4);
  const width = size.width - padding.left - padding.right - 2 * margin;
  const height = size.height - padding.top - padding.bottom - 2 * margin;
  const zoom = Math.log2(Math.min(width / (dx * TILE), height / (dy * TILE)));
  let lng = ((mercX(w) + mercX(e)) / 2) * 360 - 180;
  if (lng > 180) lng -= 360;
  return { center: [lng, latOf((mercY(n) + mercY(s)) / 2)], zoom: Number.isFinite(zoom) ? clamp(zoom, ZOOM_MIN, maxZoom) : ZOOM_MIN, padding, bearing: 0 };
}

/** Where the reader may take the camera: one world, never repeated, and no polar stretch. */
export function constrainCamera(lng: number, lat: number, zoom: number): { lng: number; lat: number; zoom: number } {
  return { lng: clamp(lng, -180, 180), lat: clamp(lat, LAT_MIN, LAT_MAX), zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX) };
}

/**
 * The box around some places, `pad` degrees wider on every side. When the places sit on both sides
 * of the antimeridian (Fiji and Samoa, say), the box runs east past 180° instead of around the world.
 */
export function boundsOf(points: readonly { lng: number; lat: number }[], pad = 0): Bounds | null {
  if (points.length === 0) return null;
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const shifted = lngs.map((x) => (x < 0 ? x + 360 : x));
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  const xs = spread(shifted) < spread(lngs) ? shifted : lngs;
  return [
    [Math.min(...xs) - pad, Math.max(Math.min(...lats) - pad, -85)],
    [Math.max(...xs) + pad, Math.min(Math.max(...lats) + pad, 85)],
  ];
}
