"use client";

import { useSyncExternalStore } from "react";
import { applyPreferences, DEFAULT_PREFERENCES, parsePreferences, type Preferences, PREFERENCES_STORAGE_KEY, serializePreferences } from "./schema";

/*
 * The same shape as the nav tree's open state and the program band: a module-level cache that
 * notifies every subscriber synchronously on write, so a change in the preferences panel reaches
 * the shell in the same tick (native "storage" events only fire in *other* tabs), without any
 * component calling setState from an effect. The server snapshot is always the defaults, which
 * is also what the boot script leaves the DOM in when nothing is stored — so hydration matches.
 */

const listeners = new Set<() => void>();
let cache: Preferences | null = null;

function read(): Preferences {
  try {
    return parsePreferences(window.localStorage.getItem(PREFERENCES_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_PREFERENCES }; // private mode, or storage blocked by policy
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== PREFERENCES_STORAGE_KEY) return;
  cache = null;
  applyPreferences(document.documentElement, snapshot());
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

function snapshot(): Preferences {
  cache ??= read();
  return cache;
}

const serverSnapshot = () => DEFAULT_PREFERENCES;

/** The current preferences; re-renders the caller whenever they change, in this tab or another. */
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Read outside React (event handlers, tests). */
export function getPreferences(): Preferences {
  return snapshot();
}

/** Merge a change in, persist it, stamp it on <html>, and tell every subscriber. */
export function setPreferences(patch: Partial<Preferences>): Preferences {
  const next: Preferences = { ...snapshot(), ...patch };
  cache = next;
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, serializePreferences(next));
  } catch {
    // the choice simply will not survive the session
  }
  applyPreferences(document.documentElement, next);
  notify();
  return next;
}

/** Back to the defaults, and nothing left in storage. */
export function resetPreferences(): Preferences {
  cache = { ...DEFAULT_PREFERENCES };
  try {
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // nothing to clear
  }
  applyPreferences(document.documentElement, cache);
  notify();
  return cache;
}

/** Test seam: forget the cached value so the next read comes from storage. */
export function __resetPreferencesCache(): void {
  cache = null;
}
