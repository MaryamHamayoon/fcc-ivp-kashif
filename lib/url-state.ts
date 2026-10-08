/**
 * The URL is the state. Every workspace keeps its filters, sort and page size in the query
 * string, so a view can be linked, bookmarked, mailed to a colleague and reloaded without loss.
 * These helpers are the pure half; `components/common/useUrlState.tsx` is the hook.
 */

export type ParamPatch = Record<string, string | string[] | null | undefined>;

export const DEFAULT_PAGE_SIZE = 50;
/** Meetings page at 25, the first size the pager offers; the meetings API defaults to it too. */
export const MEETINGS_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export function applyPatch(params: URLSearchParams, patch: ParamPatch): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(patch)) {
    next.delete(key);
    if (value == null) continue;
    for (const entry of Array.isArray(value) ? value : [value]) if (entry !== "") next.append(key, entry);
  }
  return next;
}

/** Only the keys an API reads, in a stable order, so a query key built from it is stable too. */
export function pickParams(params: URLSearchParams, keys: readonly string[]): string {
  const out = new URLSearchParams();
  for (const key of keys) {
    for (const value of params.getAll(key)) {
      const trimmed = value.trim();
      if (trimmed) out.append(key, trimmed);
    }
  }
  return out.toString();
}

/** A page from the URL: a whole number from 1, else the first page. */
export function readPage(params: URLSearchParams): number {
  const raw = Number(params.get("page"));
  return Number.isInteger(raw) && raw >= 1 ? raw : 1;
}

/** Clamped to the bounds the list schemas enforce, so the UI never disagrees with the server. */
export function readPageSize(params: URLSearchParams, fallback: number = DEFAULT_PAGE_SIZE): number {
  const raw = Number(params.get("pageSize"));
  if (!params.get("pageSize") || !Number.isFinite(raw)) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(10, Math.trunc(raw)));
}
