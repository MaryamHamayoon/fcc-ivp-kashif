"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FAMILY, MAP_PALETTES, type MapPalette, readFontFamily, readMapPalette, samePalette } from "@/lib/geo/map-palette";

/** The preferences that move the map's colors or its typeface. */
const WATCHED = ["data-theme", "data-accent", "data-contrast", "data-surface", "data-font"];

export type MapTheme = { palette: MapPalette; family: string };

/**
 * The map's live palette and label typeface, read off `<html>` and read again whenever a
 * preference moves them. The same object comes back while nothing changed, so a switch that
 * leaves the map alone (Light to Hybrid) rebuilds nothing.
 */
export function useMapTheme(): MapTheme {
  const [theme, setTheme] = useState<MapTheme>({ palette: MAP_PALETTES["light-green-standard"], family: DEFAULT_FAMILY });

  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setTheme((prev) => {
        const palette = readMapPalette(root);
        const family = readFontFamily(root);
        return samePalette(prev.palette, palette) && prev.family === family ? prev : { palette, family };
      });
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: WATCHED });
    return () => observer.disconnect();
  }, []);

  return theme;
}
