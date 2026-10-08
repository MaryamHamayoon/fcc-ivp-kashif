"use client";

import { browserPref } from "@/lib/browser-pref";

/** Whether the reader has paused the map's signals: one choice per browser, shared by the card and the full screen. */
export const SIGNALS_PREF = browserPref("ivp.map.signals", ["moving", "paused"] as const, "moving");

export function useSignalsPaused(): [paused: boolean, setPaused: (paused: boolean) => void] {
  return [SIGNALS_PREF.useValue() === "paused", setSignalsPaused];
}

function setSignalsPaused(paused: boolean) {
  SIGNALS_PREF.set(paused ? "paused" : "moving");
}
