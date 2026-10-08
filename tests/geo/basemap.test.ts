// @vitest-environment node
import type { LayerSpecification } from "maplibre-gl";
import { basemapLayers, DISPUTED, ENGLISH_NAME, fontStacks, KEPT_LAYERS } from "@/lib/geo/basemap";
import { MAP_PALETTES, type MapPalette, type PaletteColor, type PaletteKey } from "@/lib/geo/map-palette";

const p = MAP_PALETTES["light-green-standard"];
const layers = basemapLayers(p, "Public Sans");

function layer<T extends LayerSpecification["type"]>(id: string, type: T): Extract<LayerSpecification, { type: T }> {
  const found = layers.find((l) => l.id === id);
  if (!found || found.type !== type) throw new Error(`no ${type} layer ${id}`);
  return found as Extract<LayerSpecification, { type: T }>;
}

describe("the basemap's layers", () => {
  it("keeps only what the map needs, in the basemap's order, with cities split and disputed lines apart", () => {
    expect(layers.map((l) => l.id)).toEqual([
      "background",
      "earth",
      "landcover",
      "water",
      "roads_highway",
      "boundaries_country",
      "boundaries_disputed",
      "boundaries",
      "water_label_ocean",
      "earth_label_islands",
      "water_label_lakes",
      "cities_capital",
      "cities_other",
      "places_country",
    ]);
    expect(KEPT_LAYERS).not.toContain("water_river");
  });

  it("labels everything in English, in the interface typeface, with no glyph server's fonts", () => {
    const labels = layers.filter((l) => l.type === "symbol");
    expect(labels).toHaveLength(6);
    for (const l of labels) expect([l.id, l.layout?.["text-field"]]).toEqual([l.id, ENGLISH_NAME]);
    expect(JSON.stringify(layers)).not.toMatch(/Noto/);
    expect(layer("places_country", "symbol").layout?.["text-font"]).toEqual(["Public Sans SemiBold", "Public Sans"]);
    expect(layer("cities_capital", "symbol").layout?.["text-font"]).toEqual(["Public Sans Medium", "Public Sans"]);
    expect(layer("cities_other", "symbol").layout?.["text-font"]).toEqual(["Public Sans"]);
    expect(layer("water_label_ocean", "symbol").layout?.["text-font"]).toEqual(["Public Sans Italic", "Public Sans"]);
    expect(layer("earth_label_islands", "symbol").layout?.["text-font"]).toEqual(["Public Sans Italic", "Public Sans"]);
  });

  it("follows the reader's typeface", () => {
    expect(fontStacks("Atkinson Hyperlegible Next").medium).toEqual(["Atkinson Hyperlegible Next Medium", "Atkinson Hyperlegible Next"]);
    const legible = basemapLayers(p, "Atkinson Hyperlegible Next");
    expect(JSON.stringify(legible)).not.toContain("Public Sans");
  });

  it("draws country borders solid at every zoom, and disputed lines dashed and lighter", () => {
    const borders = layer("boundaries_country", "line");
    expect(borders.paint?.["line-dasharray"]).toBeUndefined();
    expect(borders.filter).toEqual(["all", ["<=", ["get", "kind_detail"], 2], ["!", DISPUTED]]);
    const disputed = layer("boundaries_disputed", "line");
    expect(disputed.filter).toEqual(["all", ["<=", ["get", "kind_detail"], 2], DISPUTED]);
    expect(disputed.paint).toMatchObject({ "line-color": p.border, "line-dasharray": [2, 2], "line-opacity": 0.7 });
    expect(layer("boundaries", "line").paint?.["line-opacity"]).toBe(0.6);
  });

  it("brings in highways from zoom 4.5, capitals from 2.6 and other cities from 4.2, the larger place first", () => {
    expect(layer("roads_highway", "line").minzoom).toBe(4.5);
    const capitals = layer("cities_capital", "symbol");
    expect(capitals.minzoom).toBe(2.6);
    expect(capitals.layout).toMatchObject({ "icon-image": "capital", "symbol-sort-key": ["-", 20, ["coalesce", ["get", "population_rank"], 0]] });
    expect(capitals.filter).toEqual(["all", ["==", ["get", "kind"], "locality"], ["==", ["get", "capital"], "yes"]]);
    const others = layer("cities_other", "symbol");
    expect(others.minzoom).toBe(4.2);
    expect(others.layout?.["icon-image"]).toBe("townspot");
    expect(others.filter).toEqual(["all", ["==", ["get", "kind"], "locality"], ["!", ["==", ["get", "capital"], "yes"]]]);
  });

  it("sets countries in spaced capitals and oceans in spaced italic", () => {
    expect(layer("places_country", "symbol").layout).toMatchObject({ "text-transform": "uppercase", "text-letter-spacing": 0.1, "text-max-width": 7 });
    expect(layer("water_label_ocean", "symbol").layout?.["text-letter-spacing"]).toBe(0.14);
    expect(layer("water_label_ocean", "symbol").paint?.["text-color"]).toBe(p.oceanLabel);
    expect(layer("cities_capital", "symbol").paint?.["text-color"]).toBe(p.labelCity);
    expect(layer("cities_other", "symbol").paint?.["text-color"]).toBe(p.label);
  });

  it("names a country just below a mark that covers its spot, or above it, rather than drop the name", () => {
    expect(layer("places_country", "symbol").layout?.["text-variable-anchor-offset"]).toEqual(["center", [0, 0], "top", [0, 1.5], "bottom", [0, -1.5]]);
  });
});

describe.each(Object.keys(MAP_PALETTES) as PaletteKey[])("the %s basemap", (key) => {
  it("paints only the palette's own colors", () => {
    const palette: MapPalette = MAP_PALETTES[key];
    const allowed = new Set((Object.keys(palette) as (keyof MapPalette)[]).filter((k): k is PaletteColor => typeof palette[k] === "string" && k !== "key").map((k) => palette[k]));
    const colors = JSON.stringify(basemapLayers(palette, "Public Sans")).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? [];
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.filter((c) => !allowed.has(c))).toEqual([]);
  });
});
