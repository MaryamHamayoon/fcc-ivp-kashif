import { color as parseColor, lab } from "d3-color";
import { interpolateLab } from "d3-interpolate";
import type { MeetingFormat } from "@/lib/domain/types";

/**
 * The map's colors are the app's own tokens (`--map-*` in `app/globals.css`, plus the brand, the
 * card and the dashboard's format colors), read off `<html>` at runtime. WebGL cannot resolve
 * `var(--map-land)`, and the tokens move with the theme, the accent and the contrast preference,
 * so the values are read and re-read. Hybrid shares the light map: only the chrome turns dark.
 * Everything here is pure; the fallbacks mirror the CSS and a test holds them to it.
 */

export type PaletteKey = `${"light" | "dark"}-${"green" | "navy"}-${"standard" | "high"}`;

export type MapPalette = {
  key: PaletteKey;
  dark: boolean;
  highContrast: boolean;
  water: string;
  land: string;
  land2: string;
  forest: string;
  urban: string;
  glacier: string;
  border: string;
  /** Country labels, and other cities. */
  label: string;
  /** Capitals. */
  labelCity: string;
  halo: string;
  oceanLabel: string;
  road: string;
  /** The choropleth's far end. */
  rampTo: string;
  brand: string;
  card: string;
  inPerson: string;
  hybrid: string;
  virtual: string;
};

export type PaletteColor = Exclude<keyof MapPalette, "key" | "dark" | "highContrast">;

/** Where each color lives in `app/globals.css`. The format colors are the dashboard's own (`FORMAT_COLORS`). */
export const MAP_TOKENS: Record<PaletteColor, string> = {
  water: "--map-water",
  land: "--map-land",
  land2: "--map-land-2",
  forest: "--map-forest",
  urban: "--map-urban",
  glacier: "--map-glacier",
  border: "--map-border",
  label: "--map-label",
  labelCity: "--map-label-city",
  halo: "--map-halo",
  oceanLabel: "--map-ocean-label",
  road: "--map-road",
  rampTo: "--map-ramp-to",
  brand: "--brand",
  card: "--card",
  inPerson: "--chart-2",
  hybrid: "--chart-3",
  virtual: "--chart-1",
};

const palette = (key: PaletteKey, colors: string, brand: string, card: string, formats: string): MapPalette => {
  const [water, land, land2, forest, urban, glacier, border, label, labelCity, halo, oceanLabel, road, rampTo] = colors.split(" ") as [string, string, string, string, string, string, string, string, string, string, string, string, string];
  const [inPerson, hybrid, virtual] = formats.split(" ") as [string, string, string];
  return { key, dark: key.startsWith("dark"), highContrast: key.endsWith("high"), water, land, land2, forest, urban, glacier, border, label, labelCity, halo, oceanLabel, road, rampTo, brand, card, inPerson, hybrid, virtual };
};

const GREEN_LIGHT_FORMATS = "#c48a1c #3b6fd8 #2e8557";
const GREEN_DARK_FORMATS = "#c88214 #4a7ed9 #33926a";
const NAVY_LIGHT_FORMATS = "#d0506d #875bd8 #3466c4";
const NAVY_DARK_FORMATS = "#d15a7c #8e70df #4a7ed9";

/** The CSS values, for the server, for tests, and for any token the browser does not answer. */
export const MAP_PALETTES: Record<PaletteKey, MapPalette> = {
  "light-green-standard": palette("light-green-standard", "#dde5e2 #fbfbf8 #f5f6f1 #f0f3ec #f1f2ee #ffffff #b3beb8 #4f5d56 #2f3b35 #fbfbf8 #536862 #e9ece6 #3f7a61", "#2e5c4b", "#ffffff", GREEN_LIGHT_FORMATS),
  "dark-green-standard": palette("dark-green-standard", "#09100c #172019 #18211b #16201a #1b231e #1e2823 #34463c #9aaba1 #c7d3cc #0f1613 #678477 #1f2b25 #7cc8a3", "#5fae8c", "#161f1b", GREEN_DARK_FORMATS),
  "light-navy-standard": palette("light-navy-standard", "#dbe2ec #fbfbfd #f4f5f8 #eff2f6 #f0f1f4 #ffffff #b5bfd0 #4d586d #2c354a #fbfbfd #526280 #e8ebf1 #2f5596", "#1f3f78", "#ffffff", NAVY_LIGHT_FORMATS),
  "dark-navy-standard": palette("dark-navy-standard", "#060914 #131a2b #141b2d #131a2a #171e30 #1b2336 #303c58 #9eabc6 #c9d2e5 #0e1220 #6b7ba0 #1c2437 #8db3f2", "#7fa7ea", "#161b2b", NAVY_DARK_FORMATS),
  "light-green-high": palette("light-green-high", "#c3d3cc #ffffff #f6f7f3 #f1f5ef #f2f3ef #ffffff #58665f #1f2b25 #000000 #ffffff #2c4a41 #d9ded7 #1f4a3b", "#1f4a3b", "#ffffff", GREEN_LIGHT_FORMATS),
  "dark-green-high": palette("dark-green-high", "#000000 #1c2b23 #1d2c24 #1b2a22 #213028 #26352d #8a9c92 #dce6e0 #ffffff #000000 #9dbdb0 #2e3e36 #a8e6c6", "#8fd4b3", "#0b0f0d", GREEN_DARK_FORMATS),
  "light-navy-high": palette("light-navy-high", "#c2cedf #ffffff #f5f6f9 #f0f3f7 #f1f2f5 #ffffff #5a6680 #1d2638 #000000 #ffffff #2d4470 #d8dde6 #173265", "#173265", "#ffffff", NAVY_LIGHT_FORMATS),
  "dark-navy-high": palette("dark-navy-high", "#000000 #18223a #19243c #17213a #1d2740 #222c45 #8b99b8 #dde4f2 #ffffff #000000 #9fb2d9 #2a3550 #c9dbfa", "#a9c6f5", "#0b0f0d", NAVY_DARK_FORMATS),
};

/** How opaque the full screen's glass is: the card color at 90% over a light map, 88% under dark chrome. */
export const GLASS_OPACITY = { light: 0.9, dark: 0.88 } as const;

/** Just enough of `CSSStyleDeclaration` to read a custom property; keeps this testable without a DOM. */
export type StyleReader = { getPropertyValue: (name: string) => string };
type ReadStyle = (el: Element) => StyleReader;

const browserStyle: ReadStyle | null = typeof getComputedStyle === "function" ? (el) => getComputedStyle(el) : null;

/** Which palette the document's preferences select. Hybrid reads as light: the map under dark chrome stays light. */
export function paletteKey(root: Element): PaletteKey {
  const tone = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const accent = root.getAttribute("data-accent") === "navy" ? "navy" : "green";
  const contrast = root.getAttribute("data-contrast") === "high" ? "high" : "standard";
  return `${tone}-${accent}-${contrast}`;
}

/** The live token values on `root` (normally `document.documentElement`); a token the document does not answer keeps its fallback. */
export function readMapPalette(root: Element | null | undefined, read: ReadStyle | null = browserStyle): MapPalette {
  if (!root || !read) return MAP_PALETTES["light-green-standard"];
  const out: MapPalette = { ...MAP_PALETTES[paletteKey(root)] };
  const style = read(root);
  for (const field of Object.keys(MAP_TOKENS) as PaletteColor[]) {
    const value = style.getPropertyValue(MAP_TOKENS[field]).trim();
    if (value) out[field] = value;
  }
  return out;
}

export function samePalette(a: MapPalette, b: MapPalette): boolean {
  return (Object.keys(a) as (keyof MapPalette)[]).every((k) => a[k] === b[k]);
}

export const DEFAULT_FAMILY = "Public Sans";

/** The interface typeface the map sets its labels in: the first family `--font-ui` names. */
export function readFontFamily(root: Element | null | undefined, read: ReadStyle | null = browserStyle): string {
  if (!root || !read) return DEFAULT_FAMILY;
  const first = read(root).getPropertyValue("--font-ui").split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return first || DEFAULT_FAMILY;
}

export type Ramp = {
  /** Up to four fills, lightest first. */
  colors: string[];
  /** The meeting count where each fill starts. */
  thresholds: number[];
  /** The legend's two ends: the window's own minimum and maximum. */
  min: number;
  max: number;
};

/** How far past the water's lightness (CIELAB L) a light map's first step starts. */
export const CLEAR_OF_WATER = 10;

/**
 * The choropleth: up to four steps from land toward the ramp's far end in Lab, stepped by meeting
 * count up to the window's maximum. They end 78% of the way in and start 16% in, except on a light
 * map, whose ramp darkens through the water's lightness: there they start once it is 10 past the
 * water, so a country with a single meeting never reads as sea. A single step sits midway.
 */
export function ramp(p: MapPalette, max: number): Ramp {
  const n = Math.min(4, Math.max(1, max));
  const mix = interpolateLab(p.land, p.rampTo);
  const [land, water, far] = [p.land, p.water, p.rampTo].map((c) => lab(c).l) as [number, number, number];
  const from = Math.max(0.16, (land - water + CLEAR_OF_WATER) / (land - far));
  const at = (k: number) => (n === 1 ? (from + 0.78) / 2 : from + ((0.78 - from) * k) / (n - 1));
  const colors = Array.from({ length: n }, (_, k) => parseColor(mix(at(k)))?.formatHex() ?? p.rampTo);
  const thresholds = colors.map((_, k) => Math.max(1, Math.ceil(1 + (k * max) / n)));
  return { colors, thresholds, min: max > 0 ? 1 : 0, max };
}

export function formatColor(p: MapPalette, format: MeetingFormat): string {
  return format === "in_person" ? p.inPerson : format === "hybrid" ? p.hybrid : p.virtual;
}
