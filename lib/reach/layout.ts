import type { Padding } from "@/lib/geo/camera";

/**
 * The full screen's floating layout, in CSS pixels. Every surface sits 12 px from the
 * window's edges with 12 px between surfaces. The map runs under all of them, and the camera
 * frames into what they leave free, so "the whole world" and "fly to Japan" land where the reader
 * can see them.
 */
export const EDGE = 12;
export const GUTTER = 12;
export const STRIP_HEIGHT = 52;
export const FILTERS_WIDTH = 296;
export const DETAILS_WIDTH = 368;
export const TIMELINE_HEIGHT = 172;
/** The timeline tucked away: a strip of marks that grows back while the pointer or focus is on it. */
export const TUCKED_TIMELINE_HEIGHT = 64;
/** The tabs at mid-height that stand for tucked panels. */
export const EDGE_TAB_WIDTH = 28;
/** Below this width the page opens tucked. */
export const TUCK_BELOW = 1280;
/** Below this width the strip folds Tour, Panels and Display into a menu, and drawers take the full width. */
export const COMPACT_BELOW = 768;

/** The tour's pill at the top, and its caption card, which rides 28 px above the window's foot. */
export const TOUR_PILL_HEIGHT = 44;
export const TOUR_CARD_HEIGHT = 150;
export const TOUR_CARD_BOTTOM = 28;
/** While the tour runs the chrome is away, and the camera frames between the tour's pill and its caption card. */
export const TOUR_PADDING: Padding = { top: EDGE + TOUR_PILL_HEIGHT + GUTTER, right: EDGE, bottom: TOUR_CARD_BOTTOM + TOUR_CARD_HEIGHT + GUTTER, left: EDGE };

export type ReachLayout = {
  /** The panels are away (asked for, or no room for them). */
  tucked: boolean;
  compact: boolean;
  timelineHeight: number;
  /** The part of the map the chrome covers. */
  padding: Padding;
};

export function reachLayout({ width, tucked }: { width: number; tucked: boolean }): ReachLayout {
  const compact = width < COMPACT_BELOW;
  const away = tucked || compact;
  const timelineHeight = away ? TUCKED_TIMELINE_HEIGHT : TIMELINE_HEIGHT;
  const side = (panel: number) => EDGE + (away ? EDGE_TAB_WIDTH : panel) + GUTTER;
  return {
    tucked: away,
    compact,
    timelineHeight,
    padding: { top: EDGE + STRIP_HEIGHT + GUTTER, right: side(DETAILS_WIDTH), bottom: EDGE + timelineHeight + GUTTER, left: side(FILTERS_WIDTH) },
  };
}

export const opensTucked = (width: number): boolean => width < TUCK_BELOW;

/** The reader's choice for the panels, kept per browser. "auto" is no choice yet: the width decides. */
export const PANELS_CHOICES = ["auto", "open", "tucked"] as const;
export type PanelsChoice = (typeof PANELS_CHOICES)[number];

/** Whether the panels are tucked away: as the reader chose, or, until they choose, whenever the window is under 1280 px. */
export function panelsTucked(choice: PanelsChoice, width: number): boolean {
  return choice === "auto" ? opensTucked(width) : choice === "tucked";
}
