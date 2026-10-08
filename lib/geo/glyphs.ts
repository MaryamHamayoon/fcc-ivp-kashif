import { FORMAT_ORDER, type FormatMix, mixTotal } from "@/lib/domain/reach";
import type { MeetingFormat } from "@/lib/domain/types";
import type { MapPalette } from "./map-palette";

/**
 * The format mark: one small pie per country, a slice per meeting, clockwise from twelve o'clock,
 * in-person slices first. In person fills its slice, hybrid fills a core inside the rim, virtual
 * is the rim alone, so the fuller the disc, the more of a country's visits happen in the room.
 * The geometry is pure; `glyphImage` paints it to a canvas for MapLibre, once per mix, size and
 * palette.
 */

/** Past this many meetings, a mark shows one sector per format, sized by share, instead of hairline slices. */
export const GLYPH_SECTOR_LIMIT = 12;

/** How far the card-colored base disc reaches past the pie, so the mark reads over any land or water. */
export const GLYPH_BASE = 1.6;

/** The mark's radius in CSS pixels: 6.5 for one meeting, growing with the square root of the count. */
export const glyphRadius = (n: number): number => 6.5 + 2.4 * Math.sqrt(Math.max(0, n - 1));

/** The image id MapLibre asks for: `g:<in person>:<hybrid>:<virtual>:<scale>`. */
export const glyphKey = (mix: FormatMix, scale: number): string => `g:${mix.in_person}:${mix.hybrid}:${mix.virtual}:${scale}`;

export function parseGlyphKey(key: string): { mix: FormatMix; scale: number } | null {
  const match = /^g:(\d+):(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(key);
  if (!match) return null;
  return { mix: { in_person: Number(match[1]), hybrid: Number(match[2]), virtual: Number(match[3]) }, scale: Number(match[4]) };
}

export type GlyphSlice = { format: MeetingFormat; start: number; end: number };

const TOP = -Math.PI / 2;
const TURN = 2 * Math.PI;

/** The slices, in canvas radians (clockwise, starting at twelve o'clock). */
export function glyphSlices(mix: FormatMix): GlyphSlice[] {
  const n = mixTotal(mix);
  if (n === 0) return [];
  const out: GlyphSlice[] = [];
  let at = TOP;
  if (n > GLYPH_SECTOR_LIMIT) {
    for (const format of FORMAT_ORDER) {
      if (mix[format] === 0) continue;
      const sweep = (TURN * mix[format]) / n;
      out.push({ format, start: at, end: at + sweep });
      at += sweep;
    }
    return out;
  }
  const step = TURN / n;
  for (const format of FORMAT_ORDER) {
    for (let i = 0; i < mix[format]; i++) {
      out.push({ format, start: at, end: at + step });
      at += step;
    }
  }
  return out;
}

export type GlyphGeometry = {
  /** The square image's side, in CSS pixels. */
  size: number;
  center: number;
  radius: number;
  rim: number;
  /** Hybrid slices fill to here. */
  core: number;
  slices: GlyphSlice[];
  /** Where card-colored separators run from the center outward; empty for a single slice. */
  separators: number[];
};

export function glyphGeometry(mix: FormatMix, scale: number): GlyphGeometry {
  const radius = glyphRadius(mixTotal(mix)) * scale;
  const size = Math.ceil(2 * (radius + 4));
  const slices = glyphSlices(mix);
  return { size, center: size / 2, radius, rim: Math.max(2, radius * 0.2), core: radius * 0.46, slices, separators: slices.length > 1 ? slices.map((s) => s.start) : [] };
}

/** The canvas calls the painter makes; a subset of `CanvasRenderingContext2D`, so tests can record them. */
export type GlyphContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "scale" | "beginPath" | "arc" | "moveTo" | "lineTo" | "closePath" | "fill" | "stroke" | "fillStyle" | "strokeStyle" | "lineWidth" | "shadowColor" | "shadowBlur" | "shadowOffsetY"
>;

export type GlyphColors = { card: string; shadow: string } & Record<MeetingFormat, string>;

export function glyphColors(p: MapPalette): GlyphColors {
  return { card: p.card, shadow: p.dark ? "rgba(0,0,0,0.6)" : "rgba(20,34,28,0.3)", in_person: p.inPerson, hybrid: p.hybrid, virtual: p.virtual };
}

/** Paints a mark at `ratio` device pixels per CSS pixel: the shadowed base disc, the slices, their rims and separators. */
export function paintGlyph(ctx: GlyphContext, g: GlyphGeometry, colors: GlyphColors, ratio: number): void {
  const { center: m, radius: r } = g;
  ctx.scale(ratio, ratio);
  ctx.save();
  ctx.shadowColor = colors.shadow;
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 0.8;
  ctx.beginPath();
  ctx.arc(m, m, r + GLYPH_BASE, 0, TURN);
  ctx.fillStyle = colors.card;
  ctx.fill();
  ctx.restore();
  for (const slice of g.slices) {
    const c = colors[slice.format];
    ctx.fillStyle = c;
    ctx.strokeStyle = c;
    if (slice.format !== "virtual") {
      ctx.beginPath();
      ctx.moveTo(m, m);
      ctx.arc(m, m, slice.format === "in_person" ? r : g.core, slice.start, slice.end);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(m, m, r - g.rim / 2, slice.start, slice.end);
    ctx.lineWidth = g.rim;
    ctx.stroke();
  }
  if (g.separators.length === 0) return;
  ctx.strokeStyle = colors.card;
  ctx.lineWidth = Math.max(1, r * 0.1);
  for (const a of g.separators) {
    ctx.beginPath();
    ctx.moveTo(m, m);
    ctx.lineTo(m + Math.cos(a) * (r + 1), m + Math.sin(a) * (r + 1));
    ctx.stroke();
  }
}

export type GlyphImage = { width: number; height: number; data: Uint8Array };

function paint(size: number, ratio: number, draw: (ctx: CanvasRenderingContext2D) => void): GlyphImage {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.ceil(size * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: canvas.width, height: canvas.height, data: new Uint8Array(canvas.width * canvas.height * 4) };
  draw(ctx);
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer) };
}

/** A mark as MapLibre takes it (add it with `pixelRatio: ratio`). Browser only. */
export function glyphImage(mix: FormatMix, scale: number, p: MapPalette, ratio = 2): GlyphImage {
  const g = glyphGeometry(mix, scale);
  return paint(g.size, ratio, (ctx) => paintGlyph(ctx, g, glyphColors(p), ratio));
}

/** The basemap's place icons: a ringed dot for capitals, a small dot for other cities. Browser only. */
export function cityIcon(kind: "capital" | "townspot", p: MapPalette, ratio = 2): GlyphImage {
  const size = kind === "capital" ? 10 : 6;
  return paint(size, ratio, (ctx) => {
    const m = size / 2;
    ctx.scale(ratio, ratio);
    if (kind === "capital") {
      ctx.beginPath();
      ctx.arc(m, m, m - 1, 0, TURN);
      ctx.fillStyle = p.halo;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = p.labelCity;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(m, m, kind === "capital" ? m - 3.2 : m - 1.5, 0, TURN);
    ctx.fillStyle = p.labelCity;
    ctx.fill();
  });
}
