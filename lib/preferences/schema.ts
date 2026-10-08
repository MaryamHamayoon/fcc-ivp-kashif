/**
 * Display & accessibility preferences — the handful of choices a reader can make about how the
 * app looks and moves, independent of their account. They live in the browser (localStorage),
 * are applied as `data-*` attributes on <html> before first paint by the boot script, and every
 * visual consequence is expressed in CSS against those attributes, so the React tree never has
 * to know a preference exists.
 *
 * Light/dark ("appearance") is deliberately not here: next-themes already owns `data-theme`
 * and its own storage key, and the preferences panel simply drives it alongside these. The
 * "hybrid" appearance is the light theme plus `rail: "dark"`.
 *
 * The FIRST value of every option is the stylesheet's base: the look plain `:root` gives with
 * no attribute at all. A base value is never written to the DOM, so `:root` styles apply and
 * nothing is overridden. The base is not always the reader's default — a new reader gets the
 * hybrid appearance with a floating rail (`DEFAULT_PREFERENCES`), and both the boot script and
 * `applyPreferences` name those on <html> like any other departure from the base.
 */
export const PREFERENCE_OPTIONS = {
  /** Brand color: the forest green of direction v3, or the FCC's own navy. */
  accent: ["green", "navy"],
  /** The page behind the cards. */
  surface: ["soft", "white", "tinted"],
  /** Root font size; every rem-based dimension follows it, so controls grow with the text. */
  text: ["standard", "small", "large", "xl"],
  /** Section 508 / WCAG AAA: black-on-white text, stronger borders, no translucent washes. */
  contrast: ["standard", "high"],
  /** Whether motion follows the operating system, or is kept to a minimum regardless. */
  motion: ["system", "reduced"],
  /** The interface typeface: Public Sans, or Atkinson Hyperlegible for easier reading. */
  font: ["standard", "legible"],
  /** The navigation rail's style: flush against the page edge, or floating clear of it. */
  nav: ["standard", "floating"],
  /** Whether the rail is folded down to its icons. The rail's own foot button sets it, in either style. */
  collapsed: ["no", "yes"],
  /** Whether the rail follows the theme or wears the dark one over a light page ("hybrid"). */
  rail: ["match", "dark"],
} as const;

export type PreferenceKey = keyof typeof PREFERENCE_OPTIONS;
export type PreferenceValue<K extends PreferenceKey> = (typeof PREFERENCE_OPTIONS)[K][number];
export type Preferences = { [K in PreferenceKey]: PreferenceValue<K> };

export const PREFERENCE_KEYS = Object.keys(PREFERENCE_OPTIONS) as PreferenceKey[];

/** What a new reader gets: the hybrid appearance (light page, dark rail) with the rail floating. */
export const DEFAULT_PREFERENCES: Preferences = {
  accent: "green",
  surface: "soft",
  text: "standard",
  contrast: "standard",
  motion: "system",
  font: "standard",
  nav: "floating",
  collapsed: "no",
  rail: "dark",
};

/** The value the stylesheet assumes when a preference's attribute is absent: the first of its options. */
function baseValue<K extends PreferenceKey>(key: K): PreferenceValue<K> {
  return PREFERENCE_OPTIONS[key][0];
}

/** The rail's style. Whether it is collapsed is a separate choice, so folding a floating rail leaves it floating. */
export type NavMode = PreferenceValue<"nav">;

/**
 * Until collapse became a state of its own, "compact" was a third nav style ("Icons only"). A
 * reader who stored it keeps the narrow rail they chose: the standard style, collapsed. The boot
 * script (./boot.ts) applies the same rule before first paint.
 */
export const RETIRED_COMPACT_NAV = "compact";

/** The localStorage key; the boot script in the root layout reads the same one. */
export const PREFERENCES_STORAGE_KEY = "ivp.prefs";

function isValue<K extends PreferenceKey>(key: K, value: unknown): value is PreferenceValue<K> {
  return typeof value === "string" && (PREFERENCE_OPTIONS[key] as readonly string[]).includes(value);
}

/** Tolerant: unknown keys are ignored, unknown values fall back to the default, garbage yields the defaults. */
export function parsePreferences(raw: string | null | undefined): Preferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
  if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PREFERENCES };
  const source = parsed as Record<string, unknown>;
  const prefs = { ...DEFAULT_PREFERENCES };
  for (const key of PREFERENCE_KEYS) {
    const value = source[key];
    if (isValue(key, value)) (prefs as Record<PreferenceKey, string>)[key] = value;
  }
  if (source.nav === RETIRED_COMPACT_NAV) {
    prefs.nav = "standard";
    prefs.collapsed = "yes";
  }
  return prefs;
}

export function serializePreferences(prefs: Preferences): string {
  return JSON.stringify(prefs);
}

export function isDefaultPreferences(prefs: Preferences): boolean {
  return PREFERENCE_KEYS.every((key) => prefs[key] === DEFAULT_PREFERENCES[key]);
}

/** The <html> attribute a preference is expressed through: `data-accent`, `data-text`, … */
export function attributeFor(key: PreferenceKey): `data-${PreferenceKey}` {
  return `data-${key}`;
}

type AttributeTarget = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

/** Writes the preferences to the root element; the stylesheet's base value clears its attribute rather than naming it. */
export function applyPreferences(root: AttributeTarget, prefs: Preferences): void {
  for (const key of PREFERENCE_KEYS) {
    const attribute = attributeFor(key);
    if (prefs[key] === baseValue(key)) root.removeAttribute(attribute);
    else root.setAttribute(attribute, prefs[key]);
  }
}

/* --------------------------------- presets --------------------------------- */

export type Appearance = "light" | "dark" | "system";

/**
 * The rail's style, fold and tone are layout, not display: no quick setup names them, and applying
 * one leaves them exactly as the reader had them.
 */
export const LAYOUT_KEYS = ["nav", "collapsed", "rail"] as const satisfies readonly PreferenceKey[];
export type LayoutKey = (typeof LAYOUT_KEYS)[number];

export type Preset = {
  id: string;
  label: string;
  /** One plain sentence about who it is for. */
  description: string;
  prefs: Partial<Omit<Preferences, LayoutKey>>;
  /** Light/dark to set alongside; omitted presets leave the appearance alone. */
  appearance?: Appearance;
};

/** One-click starting points; each is just a bundle of the choices below it, never a hidden extra. */
export const PRESETS: readonly Preset[] = [
  {
    id: "standard",
    label: "Standard",
    description: "The default look: forest green, soft page, Public Sans, motion as your device allows.",
    prefs: {},
    appearance: "light",
  },
  {
    id: "easier-reading",
    label: "Easier reading",
    description: "Larger text in a typeface drawn for low vision, strong contrast, and no unnecessary motion.",
    prefs: { text: "large", font: "legible", contrast: "high", motion: "reduced" },
  },
  {
    id: "presentation",
    label: "Presentation",
    description: "For a projector or a shared screen: larger text and a plain white page so nothing washes out.",
    prefs: { text: "large", surface: "white" },
    appearance: "light",
  },
];

/**
 * A stored bundle is complete: a preset's partial choices are laid over the defaults, not over
 * the current state — except the layout keys, which come through from `current` untouched.
 */
export function applyPreset(preset: Preset, current: Preferences = DEFAULT_PREFERENCES): Preferences {
  return { ...DEFAULT_PREFERENCES, ...preset.prefs, nav: current.nav, collapsed: current.collapsed, rail: current.rail };
}

/**
 * Whether the reader is already looking at exactly this preset — the whole bundle, and the
 * appearance too where the preset names one. Anything less would leave a preset tile reading as
 * "current" while the screen plainly is not.
 */
export function presetMatches(preset: Preset, prefs: Preferences, appearance: Appearance | undefined): boolean {
  const bundle = applyPreset(preset, prefs);
  if (!PREFERENCE_KEYS.every((key) => prefs[key] === bundle[key])) return false;
  return preset.appearance === undefined || preset.appearance === appearance;
}
