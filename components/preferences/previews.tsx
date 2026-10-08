import type { CSSProperties } from "react";
import type { NavMode, PreferenceValue } from "@/lib/preferences/schema";
import { cn } from "@/lib/utils";
import { type AppearanceChoice, TYPEFACE_SAMPLE } from "./sections";

/**
 * The tiny abstract mocks on the preference tiles — a rail, a band, two lines of text, drawn with
 * divs. A tile has to show a theme or an accent the page is *not* currently wearing, which is the
 * one thing the live tokens cannot do, so this file is the single place in the app that names a
 * color by hex. Every value below is copied verbatim from its block in `app/globals.css`
 * ("Design tokens", "Accent FCC navy", "Page surface"); change one there and change it here.
 *
 * Nothing here carries meaning on its own — each preview sits beside its own text label and is
 * hidden from assistive technology.
 */

type Ink = { page: string; card: string; border: string; band: string; bandDeep: string; tint: string; muted: string; brand: string };

const PALETTE: Record<"light" | "dark", Record<PreferenceValue<"accent">, Ink>> = {
  light: {
    green: { page: "#f4f5f1", card: "#ffffff", border: "#e2e6e1", band: "#2f5f4d", bandDeep: "#244c3d", tint: "#e6f1ea", muted: "#5c6a63", brand: "#2e5c4b" },
    navy: { page: "#f3f4f7", card: "#ffffff", border: "#dfe3ea", band: "#24447c", bandDeep: "#182f58", tint: "#e7edf7", muted: "#5b6474", brand: "#1f3f78" },
  },
  dark: {
    green: { page: "#0f1613", card: "#161f1b", border: "#26332c", band: "#1e3d32", bandDeep: "#163027", tint: "#1a2d25", muted: "#a3b1a9", brand: "#5fae8c" },
    navy: { page: "#0e1220", card: "#161b2b", border: "#28304a", band: "#1d3560", bandDeep: "#152747", tint: "#1c2a45", muted: "#a5aec2", brand: "#7fa7ea" },
  },
};

/** What each page-background choice actually produces, per theme and accent. */
const SURFACES: Record<"light" | "dark", Record<PreferenceValue<"accent">, Record<PreferenceValue<"surface">, { page: string; card: string }>>> = {
  light: {
    green: { soft: { page: "#f4f5f1", card: "#ffffff" }, white: { page: "#ffffff", card: "#ffffff" }, tinted: { page: "#eaf0ec", card: "#ffffff" } },
    navy: { soft: { page: "#f3f4f7", card: "#ffffff" }, white: { page: "#ffffff", card: "#ffffff" }, tinted: { page: "#e9edf5", card: "#ffffff" } },
  },
  dark: {
    green: { soft: { page: "#0f1613", card: "#161f1b" }, white: { page: "#000000", card: "#0d1411" }, tinted: { page: "#101a15", card: "#161f1b" } },
    navy: { soft: { page: "#0e1220", card: "#161b2b" }, white: { page: "#000000", card: "#0f131f" }, tinted: { page: "#0f1526", card: "#161b2b" } },
  },
};

export type Mode = "light" | "dark";

const FRAME = "relative block h-9 w-full overflow-hidden rounded-sm border border-border";

/**
 * The app in miniature: rail, program band, two lines of copy. The rail can be drawn in another
 * ink than the page (the hybrid appearance), in either style — against the edge, or floating a
 * hair inside it with a shadow of its own — and, in either, folded down to its icons.
 */
function Miniature({ ink, rail = ink, nav = "standard", collapsed = false, style }: { ink: Ink; rail?: Ink; nav?: NavMode; collapsed?: boolean; style?: CSSProperties }) {
  const floating = nav === "floating";
  return (
    <span className="absolute inset-0 flex" style={{ backgroundColor: ink.page, ...style }}>
      <span
        className={cn(
          "shrink-0",
          collapsed ? "w-[14%]" : "w-1/4",
          floating ? "my-[3px] ml-[3px] rounded-[2px] border shadow-[0_1px_3px_rgba(0,0,0,0.22)]" : "h-full border-r",
        )}
        style={{ backgroundColor: rail.card, borderColor: rail.border }}
      >
        {collapsed ? (
          <>
            <span className="mx-auto mt-1 block size-1 rounded-[1px]" style={{ backgroundColor: rail.brand }} />
            <span className="mx-auto mt-1 block size-1 rounded-[1px]" style={{ backgroundColor: rail.muted, opacity: 0.5 }} />
            <span className="mx-auto mt-1 block size-1 rounded-[1px]" style={{ backgroundColor: rail.muted, opacity: 0.5 }} />
          </>
        ) : (
          <>
            <span className="mx-1 mt-1 block h-1 rounded-[1px]" style={{ backgroundColor: rail.brand }} />
            <span className="mx-1 mt-1 block h-0.5 rounded-[1px]" style={{ backgroundColor: rail.muted, opacity: 0.5 }} />
          </>
        )}
      </span>
      <span className="flex-1 p-1">
        <span className="block h-2.5 w-full rounded-[1px]" style={{ backgroundColor: ink.band }} />
        <span className="mt-1 block h-0.5 w-3/5 rounded-[1px]" style={{ backgroundColor: ink.muted, opacity: 0.55 }} />
        <span className="mt-0.5 block h-0.5 w-2/5 rounded-[1px]" style={{ backgroundColor: ink.muted, opacity: 0.35 }} />
      </span>
    </span>
  );
}

/**
 * Light, dark, hybrid or both — "Match device" is drawn as one screen cut across the diagonal,
 * because that is exactly what it means: whichever one the device is in. Hybrid is the light
 * screen with the rail alone in the dark ink.
 */
export function AppearancePreview({ appearance, accent }: { appearance: AppearanceChoice; accent: PreferenceValue<"accent"> }) {
  const base: Mode = appearance === "dark" ? "dark" : "light";
  return (
    <span className={FRAME} aria-hidden>
      <Miniature ink={PALETTE[base][accent]} rail={appearance === "hybrid" ? PALETTE.dark[accent] : undefined} />
      {appearance === "system" && <Miniature ink={PALETTE.dark[accent]} style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />}
    </span>
  );
}

/** The rail in each of its two styles, in the theme and tone the reader is looking at — and folded, if theirs is. */
export function NavPreview({ nav, collapsed, accent, mode, rail }: { nav: NavMode; collapsed: boolean; accent: PreferenceValue<"accent">; mode: Mode; rail: Mode }) {
  return (
    <span className={FRAME} aria-hidden>
      <Miniature ink={PALETTE[mode][accent]} rail={PALETTE[rail][accent]} nav={nav} collapsed={collapsed} />
    </span>
  );
}

/** The family in three steps: the pale tint behind a selected row, the working color, the band. */
export function AccentPreview({ accent, mode }: { accent: PreferenceValue<"accent">; mode: Mode }) {
  const ink = PALETTE[mode][accent];
  return (
    <span className={`${FRAME} flex`} aria-hidden>
      <span className="h-full w-1/4" style={{ backgroundColor: ink.tint }} />
      <span className="h-full flex-1" style={{ backgroundColor: ink.brand }} />
      <span className="h-full w-1/4" style={{ backgroundColor: ink.bandDeep }} />
    </span>
  );
}

/** A card on the page, so the difference between the three page tones is visible at all. */
export function SurfacePreview({ surface, accent, mode }: { surface: PreferenceValue<"surface">; accent: PreferenceValue<"accent">; mode: Mode }) {
  const tone = SURFACES[mode][accent][surface];
  const ink = PALETTE[mode][accent];
  return (
    <span className={FRAME} aria-hidden>
      <span className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: tone.page }}>
        <span className="h-4 w-3/5 rounded-[2px] border" style={{ backgroundColor: tone.card, borderColor: ink.border }}>
          <span className="mx-1 mt-1 block h-0.5 w-3/5 rounded-[1px]" style={{ backgroundColor: ink.muted, opacity: 0.55 }} />
          <span className="mx-1 mt-1 block h-0.5 w-2/5 rounded-[1px]" style={{ backgroundColor: ink.muted, opacity: 0.35 }} />
        </span>
      </span>
    </span>
  );
}

/**
 * Standard against high, drawn in the reader's own ink so it stays honest in either theme: the
 * high tile shows text at full strength inside a border you can actually see.
 */
export function ContrastPreview({ level }: { level: PreferenceValue<"contrast"> }) {
  const high = level === "high";
  return (
    <span className={`${FRAME} bg-card`} aria-hidden>
      <span className={`absolute inset-1 rounded-[2px] border ${high ? "border-foreground/70" : "border-border"}`}>
        <span className={`mx-1.5 mt-1.5 block h-1 w-4/5 rounded-[1px] ${high ? "bg-foreground" : "bg-foreground/45"}`} />
        <span className={`mx-1.5 mt-1 block h-1 w-3/5 rounded-[1px] ${high ? "bg-foreground/80" : "bg-foreground/25"}`} />
      </span>
    </span>
  );
}

/** The face itself, set in the letters that tell the two apart. */
export function TypefacePreview({ font }: { font: PreferenceValue<"font"> }) {
  return (
    <span
      className="block truncate text-[0.9375rem] leading-6 text-foreground"
      style={{ fontFamily: font === "legible" ? "var(--font-legible)" : "var(--font-public-sans)" }}
      aria-hidden
    >
      {TYPEFACE_SAMPLE}
    </span>
  );
}

const GLYPH_SIZE: Record<PreferenceValue<"text">, string> = {
  small: "0.6875rem",
  standard: "0.8125rem",
  large: "1rem",
  xl: "1.25rem",
};

/** One "A" per step, drawn at the step's own weight of the scale. */
export function TextSizeGlyph({ size }: { size: PreferenceValue<"text"> }) {
  return (
    <span className="block leading-none font-semibold" style={{ fontSize: GLYPH_SIZE[size] }} aria-hidden>
      A
    </span>
  );
}
