"use client";

import { useSyncExternalStore } from "react";

/**
 * Row height for the meetings table, remembered per browser and shared across tabs. The
 * table reads it; the toolbar's Display menu writes it.
 */

export type Density = "compact" | "comfortable";

const DENSITY_KEY = "ivp.meetings.density";
const listeners = new Set<() => void>();
let value: Density = "comfortable";
let loaded = false;

function read(): Density {
  try {
    const raw = window.localStorage.getItem(DENSITY_KEY);
    return raw === "compact" || raw === "comfortable" ? raw : "comfortable";
  } catch {
    return "comfortable"; // private mode, or storage blocked by policy
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== DENSITY_KEY) return;
  loaded = false;
  notify();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function snapshot(): Density {
  if (!loaded) {
    value = read();
    loaded = true;
  }
  return value;
}

export function setDensity(next: Density) {
  value = next;
  loaded = true;
  try {
    window.localStorage.setItem(DENSITY_KEY, next);
  } catch {
    // the preference simply will not survive the session
  }
  notify();
}

export function useDensity(): Density {
  return useSyncExternalStore(subscribe, snapshot, () => "comfortable" as Density);
}
