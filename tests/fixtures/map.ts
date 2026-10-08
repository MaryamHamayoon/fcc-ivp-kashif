import { DEFAULT_FAMILY, MAP_PALETTES, ramp } from "@/lib/geo/map-palette";
import type { MapMark } from "@/lib/geo/reach-style";
import type { Shapes } from "@/lib/geo/shapes";

/** Three countries on the map: Japan's soonest visit is hybrid and on its way, Kenya has nothing coming, Brazil's is virtual. */
export const JAPAN: MapMark = { cca2: "JP", ccn3: "392", lng: 139.7, lat: 35.7, mix: { in_person: 2, hybrid: 1, virtual: 0 }, signal: "hybrid" };
export const KENYA: MapMark = { cca2: "KE", ccn3: "404", lng: 36.8, lat: -1.3, mix: { in_person: 0, hybrid: 0, virtual: 1 }, signal: null };
export const BRAZIL: MapMark = { cca2: "BR", ccn3: "076", lng: -47.9, lat: -15.8, mix: { in_person: 1, hybrid: 0, virtual: 1 }, signal: "virtual" };
export const MAP_MARKS: MapMark[] = [JAPAN, KENYA, BRAZIL];

/** Japan's main islands and Brazil have shapes; Kenya is left without one, like a state too small for the atlas. */
export const MAP_SHAPES: Shapes = {
  collection: {
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
  },
  bounds: new Map([
    [
      "392",
      [
        [130, 31],
        [142, 45],
      ],
    ],
    [
      "076",
      [
        [-74, -34],
        [-35, 5],
      ],
    ],
  ]),
};

export const MAP_THEME = { palette: MAP_PALETTES["light-green-standard"], family: DEFAULT_FAMILY };
export const MAP_RAMP = ramp(MAP_THEME.palette, 3);
