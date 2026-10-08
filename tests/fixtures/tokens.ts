import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PaletteKey } from "@/lib/geo/map-palette";

/**
 * The design tokens as `app/globals.css` declares them, resolved the way the cascade would for
 * each theme × accent × contrast, plus the WCAG contrast arithmetic. Lets a test prove a color
 * pair by computation instead of by eye.
 */

const ROOT = ":root";
const DARK = '[data-theme="dark"], :root[data-rail="dark"]:not([data-theme="dark"]) [data-rail-surface]';
const NAVY_LIGHT = ':root[data-accent="navy"]:not([data-theme="dark"])';
const NAVY_DARK = ':root[data-accent="navy"][data-theme="dark"], :root[data-accent="navy"][data-rail="dark"]:not([data-theme="dark"]) [data-rail-surface]';
const HC_LIGHT = ':root[data-contrast="high"]:not([data-theme="dark"])';
const HC_NAVY_LIGHT = ':root[data-accent="navy"][data-contrast="high"]:not([data-theme="dark"])';
const HC_DARK = ':root[data-contrast="high"][data-theme="dark"], :root[data-contrast="high"][data-rail="dark"]:not([data-theme="dark"]) [data-rail-surface]';
const HC_NAVY_DARK = ':root[data-accent="navy"][data-contrast="high"][data-theme="dark"], :root[data-accent="navy"][data-contrast="high"][data-rail="dark"]:not([data-theme="dark"]) [data-rail-surface]';

/** The rule blocks each palette's tokens come from, in cascade order: a later block wins. */
export const CASCADES: Record<PaletteKey, string[]> = {
  "light-green-standard": [ROOT],
  "dark-green-standard": [ROOT, DARK],
  "light-navy-standard": [ROOT, NAVY_LIGHT],
  "dark-navy-standard": [ROOT, DARK, NAVY_DARK],
  "light-green-high": [ROOT, HC_LIGHT],
  "dark-green-high": [ROOT, DARK, HC_DARK],
  "light-navy-high": [ROOT, NAVY_LIGHT, HC_LIGHT, HC_NAVY_LIGHT],
  "dark-navy-high": [ROOT, DARK, NAVY_DARK, HC_DARK, HC_NAVY_DARK],
};

export const GLOBALS_CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** Every flat rule block, by its selector with comments stripped and whitespace collapsed; repeated selectors merge in order. */
function ruleBlocks(css: string): Map<string, [string, string][]> {
  const out = new Map<string, [string, string][]>();
  for (const [, selector = "", body = ""] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // The prelude may carry at-rule statements that end in ";" (the file opens with @import): keep only the selector.
    const name = (selector.replace(/\/\*[\s\S]*?\*\//g, "").split(";").at(-1) ?? "").replace(/\s+/g, " ").trim();
    const decls = [...body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, prop = "", value = ""]) => [prop, value.trim()] as [string, string]);
    out.set(name, [...(out.get(name) ?? []), ...decls]);
  }
  return out;
}

const BLOCKS = ruleBlocks(GLOBALS_CSS);

/** The custom properties one palette resolves to, `var()` references followed. */
export function cssTokens(key: PaletteKey): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const selector of CASCADES[key]) {
    const decls = BLOCKS.get(selector);
    if (!decls) throw new Error(`No rule block for ${selector}`);
    for (const [prop, value] of decls) raw[prop] = value;
  }
  const resolve = (value: string, depth = 0): string => (depth > 8 ? value : value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => resolve(raw[name] ?? "", depth + 1)));
  return Object.fromEntries(Object.entries(raw).map(([prop, value]) => [prop, resolve(value)]));
}

const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2.1 contrast ratio of two opaque colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` at `alpha` over `bottom`, mixed in sRGB as the browser composites it. */
export function over(top: string, alpha: number, bottom: string): string {
  const b = channels(bottom);
  return `#${channels(top)
    .map((v, i) => Math.round(v * alpha + (b[i] ?? 0) * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("")}`;
}
