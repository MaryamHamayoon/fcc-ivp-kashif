import type { Appearance, NavMode, PreferenceValue } from "@/lib/preferences/schema";

/**
 * Every word the Display & accessibility panel says, in one file.
 *
 * The panel is read by people who have never opened it before and may be opening it *because*
 * the screen is hard for them to read — so each group gets a plain title and one short sentence,
 * and every option is named for what it does, never for the token behind it.
 */

export type SectionId = "presets" | "appearance" | "nav" | "accent" | "surface" | "text" | "font" | "contrast" | "motion";

export type Section = { title: string; description: string };

export const SECTIONS: Record<SectionId, Section> = {
  presets: {
    title: "Quick setups",
    description: "Three ready-made combinations. Pick one, then change anything below.",
  },
  appearance: {
    title: "Appearance",
    description: "Light, dark, a dark rail beside a light page, or whatever your device is set to.",
  },
  nav: {
    title: "Navigation",
    description: "The rail on the left: against the edge, or floating clear of it. Either one collapses to icons with the button at its foot.",
  },
  accent: {
    title: "Color",
    description: "Buttons, links and the summary band.",
  },
  surface: {
    title: "Page background",
    description: "Plain is white by day and black by night.",
  },
  text: {
    title: "Text size",
    description: "Everything on the page grows with the text, buttons and tables included.",
  },
  font: {
    title: "Typeface",
    description: "Atkinson Hyperlegible is drawn by the Braille Institute so I, l and 1 stay distinct.",
  },
  contrast: {
    title: "Contrast",
    description: "High meets WCAG AAA (7:1) for text and Section 508.",
  },
  motion: {
    title: "Motion",
    description: "Follows your device setting unless you turn this on.",
  },
};

export type Choice<V extends string> = { value: V; label: string };

/** What the appearance tiles offer: the three themes next-themes knows, plus the light theme with a dark rail. */
export type AppearanceChoice = Appearance | "hybrid";

export const APPEARANCE_CHOICES: Choice<AppearanceChoice>[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "hybrid", label: "Hybrid" },
  { value: "system", label: "Match device" },
];

/** Two styles only. Collapsing to icons is not a third: it is the rail's own foot button, and works in both. */
export const NAV_CHOICES: Choice<NavMode>[] = [
  { value: "standard", label: "Standard" },
  { value: "floating", label: "Floating" },
];

export const ACCENT_CHOICES: Choice<PreferenceValue<"accent">>[] = [
  { value: "green", label: "Forest green" },
  { value: "navy", label: "FCC blue" },
];

export const SURFACE_CHOICES: Choice<PreferenceValue<"surface">>[] = [
  { value: "soft", label: "Soft" },
  { value: "white", label: "Plain" },
  { value: "tinted", label: "Tinted" },
];

/** Smallest to largest, which is not the order the schema stores them in (default first). */
export const TEXT_CHOICES: Choice<PreferenceValue<"text">>[] = [
  { value: "small", label: "Small" },
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
  { value: "xl", label: "Extra large" },
];

export const FONT_CHOICES: Choice<PreferenceValue<"font">>[] = [
  { value: "standard", label: "Public Sans" },
  { value: "legible", label: "Atkinson Hyperlegible" },
];

export const CONTRAST_CHOICES: Choice<PreferenceValue<"contrast">>[] = [
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
];

export const MOTION_LABEL = "Reduce motion";

/** A real sentence from the product, so the size on offer is judged on the words it will carry. */
export const TEXT_SAMPLE = "Delegation from Kenya, 14 participants, briefed by the Wireline Competition Bureau.";

/** The letters that separate a hyperlegible face from a merely tidy one. */
export const TYPEFACE_SAMPLE = "Il1 O0 — Ministry of ICT";

export const SHEET_COPY = {
  title: "Display & accessibility",
  description: "Set how the app looks and moves for you. Saved on this device.",
  reset: "Reset to defaults",
  done: "Done",
  resetAnnouncement: "Everything is back to the standard look.",
} as const;

/** "Text size: Large" — what the live region says the moment a choice lands. */
export function announce(section: SectionId, label: string): string {
  return `${SECTIONS[section].title}: ${label}`;
}

export function labelOf<V extends string>(choices: Choice<V>[], value: V): string {
  return choices.find((choice) => choice.value === value)?.label ?? value;
}
