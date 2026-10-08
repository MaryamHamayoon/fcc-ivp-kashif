"use client";

import { useSyncExternalStore } from "react";

/**
 * A small choice kept per browser and shared across tabs, like the meetings table's density:
 * the map's paused signals, the full screen's tucked panels. Until hydration it reads as the
 * fallback, so the server's markup and the client's first render agree; the stored value
 * arrives one render later.
 */
export type BrowserPref<T extends string> = {
  /** The current value, as a hook. */
  useValue: () => T;
  set: (next: T) => void;
  /** The current value, outside React. */
  get: () => T;
};

export function browserPref<T extends string>(key: string, values: readonly T[], fallback: T): BrowserPref<T> {
  const listeners = new Set<() => void>();
  let value = fallback;
  let loaded = false;

  const read = (): T => {
    try {
      const raw = window.localStorage.getItem(key);
      return values.find((v) => v === raw) ?? fallback;
    } catch {
      return fallback; // private mode, or storage blocked by policy
    }
  };
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    loaded = false;
    notify();
  };
  const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    if (listeners.size === 1) window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onChange);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  };
  const get = (): T => {
    if (!loaded) {
      value = read();
      loaded = true;
    }
    return value;
  };
  const set = (next: T) => {
    value = next;
    loaded = true;
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // the choice simply will not outlive the session
    }
    notify();
  };
  return { useValue: () => useSyncExternalStore(subscribe, get, () => fallback), set, get };
}
