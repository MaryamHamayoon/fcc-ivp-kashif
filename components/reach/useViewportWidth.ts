"use client";

import { useSyncExternalStore } from "react";

/** The width the server lays the page out for, a desktop window, until the browser says otherwise. */
export const SERVER_WIDTH = 1440;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** The window's width in CSS pixels, kept current as it resizes. */
export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, () => window.innerWidth, () => SERVER_WIDTH);
}
