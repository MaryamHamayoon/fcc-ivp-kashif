import { type Flavor, layers, namedFlavor } from "@protomaps/basemaps";
import type { ExpressionSpecification, LayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import type { MapPalette } from "./map-palette";

/**
 * The Protomaps basemap, trimmed and restyled for this map: only what a reader of the program's
 * meetings needs, every label in English and in the interface typeface, every color from the
 * map tokens. MapLibre draws the glyphs itself from the family named here, so no glyph server
 * is needed; it reads the weight and slant from "Medium", "SemiBold" and "Italic" in the first
 * name of each font stack.
 */

/**
 * The basemap layers the map keeps; every other one is dropped. The zoom 0–5 extract carries no
 * rivers and no roads below highways, so those layers would draw nothing.
 */
export const KEPT_LAYERS = ["background", "earth", "landcover", "water", "roads_highway", "boundaries_country", "boundaries", "water_label_ocean", "earth_label_islands", "water_label_lakes", "places_locality", "places_country"] as const;

export type FontStacks = Record<"regular" | "medium" | "semibold" | "italic", string[]>;

/** The label fonts for a family. A styled stack names the face first and the family second, so a family without that face still draws, at the named weight. */
export function fontStacks(family: string): FontStacks {
  return { regular: [family], medium: [`${family} Medium`, family], semibold: [`${family} SemiBold`, family], italic: [`${family} Italic`, family] };
}

/**
 * Every label reads in English, falling back to the local name where OpenStreetMap has no English
 * one, or where its English one is a one-letter slip (Türkiye's reads "T").
 */
export const ENGLISH_NAME: ExpressionSpecification = ["case", [">", ["length", ["to-string", ["get", "name:en"]]], 1], ["get", "name:en"], ["get", "name"]];

/** Country-level lines the tiles mark disputed. */
export const DISPUTED: ExpressionSpecification = ["==", ["get", "disputed"], true];
const COUNTRY_LINE: ExpressionSpecification = ["<=", ["get", "kind_detail"], 2];

const byZoom = (...stops: number[]): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], ...stops];

/** The basemap's own colors, every one replaced from the palette. */
function flavorFor(p: MapPalette): Flavor {
  return {
    ...namedFlavor(p.dark ? "dark" : "light"),
    background: p.water,
    earth: p.land,
    water: p.water,
    glacier: p.glacier,
    sand: p.land2,
    beach: p.land2,
    wood_a: p.forest,
    wood_b: p.forest,
    scrub_a: p.land2,
    scrub_b: p.land2,
    park_a: p.forest,
    park_b: p.forest,
    boundaries: p.border,
    highway: p.road,
    highway_casing_early: p.road,
    highway_casing_late: p.road,
    country_label: p.label,
    city_label: p.labelCity,
    city_label_halo: p.halo,
    subplace_label: p.label,
    subplace_label_halo: p.halo,
    ocean_label: p.oceanLabel,
    landcover: { grassland: p.land2, barren: p.land2, urban_area: p.urban, farmland: p.land2, glacier: p.glacier, scrub: p.land2, forest: p.forest },
  };
}

/** Capitals from zoom 2.6 with a ringed dot, other cities from 4.2 with a small one; the larger place wins a collision. */
function cityLayer(id: "cities_capital" | "cities_other", p: MapPalette, fonts: FontStacks, source: string): SymbolLayerSpecification {
  const capital = id === "cities_capital";
  const isCapital: ExpressionSpecification = ["==", ["get", "capital"], "yes"];
  return {
    id,
    type: "symbol",
    source,
    "source-layer": "places",
    minzoom: capital ? 2.6 : 4.2,
    filter: ["all", ["==", ["get", "kind"], "locality"], capital ? isCapital : ["!", isCapital]],
    layout: {
      "icon-image": capital ? "capital" : "townspot",
      "text-field": ENGLISH_NAME,
      "text-font": capital ? fonts.medium : fonts.regular,
      "text-size": capital ? byZoom(2.6, 10, 6, 12.5) : byZoom(4.2, 9.5, 6, 11.5),
      "text-variable-anchor": ["left", "right", "top", "bottom"],
      "text-radial-offset": 0.6,
      "text-justify": "auto",
      "symbol-sort-key": ["-", 20, ["coalesce", ["get", "population_rank"], 0]],
      "text-optional": true,
    },
    paint: { "text-color": capital ? p.labelCity : p.label, "text-halo-color": p.halo, "text-halo-width": 1.4, "text-halo-blur": 0.4 },
  };
}

/** Countries in spaced capitals; oceans, lakes and islands in italic. */
function restyleLabel(layer: SymbolLayerSpecification, p: MapPalette, fonts: FontStacks): SymbolLayerSpecification {
  if (layer.id === "places_country") {
    // The program's mark is placed first and keeps its spot, so a country it covers is named just below it, or above.
    return {
      ...layer,
      layout: {
        ...layer.layout,
        "text-field": ENGLISH_NAME,
        "text-font": fonts.semibold,
        "text-letter-spacing": 0.1,
        "text-transform": "uppercase",
        "text-size": byZoom(1, 8.5, 3, 10.5, 5, 13, 6, 14),
        "text-max-width": 7,
        "text-variable-anchor-offset": ["center", [0, 0], "top", [0, 1.5], "bottom", [0, -1.5]],
      },
      paint: { ...layer.paint, "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": 1.4, "text-halo-blur": 0.5 },
    };
  }
  if (layer.id === "earth_label_islands") return { ...layer, layout: { ...layer.layout, "text-field": ENGLISH_NAME, "text-font": fonts.italic } };
  return {
    ...layer,
    layout: { ...layer.layout, "text-field": ENGLISH_NAME, "text-font": fonts.italic, "text-letter-spacing": 0.14 },
    paint: { ...layer.paint, "text-color": p.oceanLabel },
  };
}

/** The basemap's layers for one palette and typeface, reading tiles from `source`. */
export function basemapLayers(p: MapPalette, family: string, source = "basemap"): LayerSpecification[] {
  const fonts = fontStacks(family);
  const kept = new Set<string>(KEPT_LAYERS);
  const out: LayerSpecification[] = [];
  for (const layer of layers(source, flavorFor(p), { lang: "en" })) {
    if (!kept.has(layer.id)) continue;
    if (layer.id === "places_locality") {
      out.push(cityLayer("cities_capital", p, fonts, source), cityLayer("cities_other", p, fonts, source));
    } else if (layer.type === "symbol") {
      out.push(restyleLabel(layer, p, fonts));
    } else if (layer.type === "line" && layer.id === "boundaries_country") {
      // Solid at every zoom (the basemap dashes them from zoom 4); disputed lines get their own dashed, lighter layer.
      const border = { "line-color": p.border, "line-width": byZoom(0, 0.5, 4, 0.9, 6, 1.2) };
      out.push({ ...layer, filter: ["all", COUNTRY_LINE, ["!", DISPUTED]], paint: border });
      out.push({ ...layer, id: "boundaries_disputed", filter: ["all", COUNTRY_LINE, DISPUTED], paint: { ...border, "line-dasharray": [2, 2], "line-opacity": 0.7 } });
    } else if (layer.type === "line" && layer.id === "boundaries") {
      out.push({ ...layer, paint: { ...layer.paint, "line-opacity": 0.6 } });
    } else if (layer.id === "roads_highway") {
      out.push({ ...layer, minzoom: 4.5 });
    } else {
      out.push(layer);
    }
  }
  return out;
}
