import type { AddProtocolAction } from "maplibre-gl";
import { Protocol } from "pmtiles";

/**
 * The basemap is one file we serve ourselves (`public/map/world.pmtiles`, zooms 0–5), read by
 * byte range through the `pmtiles://` protocol: no map service, no key. An enterprise host can
 * point the map at its own copy with NEXT_PUBLIC_BASEMAP_URL and change nothing else.
 */

export const BASEMAP_PATH = "/map/world.pmtiles";

/** The deepest zoom the file holds. The map may zoom one level further; MapLibre stretches these tiles. */
export const BASEMAP_MAX_ZOOM = 5;

/** The file's absolute URL: the configured one, resolved against this origin, or our own copy. */
export function basemapUrl(origin: string, configured: string | undefined = process.env.NEXT_PUBLIC_BASEMAP_URL): string {
  return new URL(configured || BASEMAP_PATH, origin).href;
}

/** The tile template MapLibre asks for; the protocol turns each request into a byte-range read of the file. */
export const basemapTiles = (url: string): string => `pmtiles://${url}/{z}/{x}/{y}`;

/**
 * MapLibre's worker, served beside the basemap: `public/map/maplibre` holds it and the chunk it
 * imports, copied from the installed package. MapLibre looks for its worker next to its own
 * module file, and a bundled app serves no such file.
 */
export const MAP_WORKER_PATH = "/map/maplibre/maplibre-gl-worker.mjs";

let prepared = false;

/**
 * Readies MapLibre for every map on the page: it loads its worker from our own origin and reads
 * the basemap through the `pmtiles://` protocol. Safe to call from every map; only the first call
 * does anything.
 */
export function prepareMapLibre(maplibre: { setWorkerUrl: (url: string) => void; addProtocol: (name: string, load: AddProtocolAction) => void }): void {
  if (prepared) return;
  maplibre.setWorkerUrl(MAP_WORKER_PATH);
  maplibre.addProtocol("pmtiles", new Protocol().tile);
  prepared = true;
}
