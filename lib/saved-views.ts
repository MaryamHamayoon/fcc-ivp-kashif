import { useSyncExternalStore } from "react";

/**
 * Saved views: a name over a query string. The built-in views are code; these are the reader's
 * own, kept per browser under one storage key per workspace ("ivp.views.meetings"). The
 * pure half (parse, serialize, add, remove, match) is tested on its own; the store is the same
 * module-cache-plus-useSyncExternalStore shape as the preferences store.
 */

export type SavedView = { id: string; name: string; query: string; savedAt: string };

export const MAX_VIEW_NAME = 60;
const MAX_VIEWS = 30;

/** Whatever is in storage, made safe: anything that is not a well-formed view is dropped. */
export function parseSavedViews(raw: string | null | undefined): SavedView[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const views: SavedView[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const { id, name, query, savedAt } = entry as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || typeof query !== "string" || !id || !name.trim()) continue;
    views.push({ id, name: name.trim().slice(0, MAX_VIEW_NAME), query, savedAt: typeof savedAt === "string" ? savedAt : "" });
  }
  return views.slice(0, MAX_VIEWS);
}

export function serializeSavedViews(views: readonly SavedView[]): string {
  return JSON.stringify(views);
}

/**
 * What a view remembers: only the keys the workspace owns, in a stable order, so two views of
 * the same filters compare equal as strings. Values repeated under one key are sorted too —
 * picking Clearance then Confirmed is the same view as picking them the other way round, and
 * `pickParams` keeps the URL's order because the API and the query cache rely on it.
 */
export function viewQuery(params: URLSearchParams, keys: readonly string[]): string {
  const out = new URLSearchParams();
  for (const key of keys) {
    const values = params
      .getAll(key)
      .map((value) => value.trim())
      .filter(Boolean)
      .sort();
    for (const value of values) out.append(key, value);
  }
  return out.toString();
}

export function isViewActive(view: Pick<SavedView, "query">, params: URLSearchParams, keys: readonly string[]): boolean {
  return view.query === viewQuery(params, keys);
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "view";

/** Adds a view at the top; a view of the same name (case-insensitively) is replaced rather than doubled. */
export function addSavedView(views: readonly SavedView[], name: string, query: string, now = new Date()): SavedView[] {
  const trimmed = name.trim().slice(0, MAX_VIEW_NAME);
  if (!trimmed) return [...views];
  const rest = views.filter((view) => view.name.toLowerCase() !== trimmed.toLowerCase());
  const view: SavedView = { id: `${slug(trimmed)}-${now.getTime().toString(36)}`, name: trimmed, query, savedAt: now.toISOString() };
  return [view, ...rest].slice(0, MAX_VIEWS);
}

export function removeSavedView(views: readonly SavedView[], id: string): SavedView[] {
  return views.filter((view) => view.id !== id);
}

/* ---------------------------------- store --------------------------------- */

const NONE: SavedView[] = [];

/** One per workspace, module-level, so every component reading the same key sees the same list. */
export function makeSavedViewsStore(storageKey: string) {
  const listeners = new Set<() => void>();
  let cache: SavedView[] | null = null;

  function read(): SavedView[] {
    try {
      return parseSavedViews(window.localStorage.getItem(storageKey));
    } catch {
      return []; // private mode, or storage blocked by policy
    }
  }

  function write(views: SavedView[]) {
    try {
      if (views.length) window.localStorage.setItem(storageKey, serializeSavedViews(views));
      else window.localStorage.removeItem(storageKey);
    } catch {
      // the list simply will not survive the session
    }
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== storageKey) return;
    cache = null;
    notify();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  }

  function snapshot(): SavedView[] {
    if (cache === null) cache = read();
    return cache;
  }

  function commit(next: SavedView[]) {
    cache = next;
    write(next);
    notify();
    return next;
  }

  return {
    subscribe,
    snapshot,
    serverSnapshot: () => NONE,
    save: (name: string, query: string) => commit(addSavedView(snapshot(), name, query)),
    remove: (id: string) => commit(removeSavedView(snapshot(), id)),
    /** Test seam: forget everything, in memory and in storage. */
    reset: () => commit([]),
  };
}

export type SavedViewsStore = ReturnType<typeof makeSavedViewsStore>;

export function useSavedViews(store: SavedViewsStore): SavedView[] {
  return useSyncExternalStore(store.subscribe, store.snapshot, store.serverSnapshot);
}
