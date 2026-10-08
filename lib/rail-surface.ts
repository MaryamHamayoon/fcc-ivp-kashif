"use client";

import { createContext, useContext } from "react";

/**
 * Whether this part of the page sits on surfaces that carry `data-rail-surface`, as every surface
 * on the full screen does, so that Hybrid dresses them in its dark chrome. A popup renders at the
 * end of the page, outside the surface that opened it, so it asks here and carries the attribute
 * itself: a menu opened from a dark panel is dark too.
 */
export const RailSurface = createContext(false);

/** The attribute a popup spreads to wear the colors of the surface that opened it. */
export function useRailSurface(): { "data-rail-surface"?: "" } {
  return useContext(RailSurface) ? { "data-rail-surface": "" } : {};
}
