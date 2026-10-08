"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePagedUrlState } from "@/components/common/useUrlState";
import { apiGet } from "@/lib/api/client";
import { ActivityFeedResponse } from "@/lib/api/schemas";
import type { ActivityFeedItem } from "@/lib/db/repos/activities";
import { DEFAULT_PAGE_SIZE, type ParamPatch, pickParams, readPage, readPageSize } from "@/lib/url-state";

/**
 * The log's URL is its state, as on every other list: the scope, the search, every filter, the
 * picked week, the sort, the page and how many rows a page holds all live in the query string,
 * so a cut of the log can be linked and mailed.
 */

export { DEFAULT_PAGE_SIZE, type ParamPatch, readPage, readPageSize };

/** Parameters `/api/activity` understands. */
export const ACTIVITY_QUERY_KEYS = ["scope", "q", "kind", "waitingOn", "authorId", "regionId", "fy", "status", "when", "week", "sort", "page", "pageSize"] as const;

/** Filters the toolbar clears together; the scope, the sort and the page size survive. */
export const ACTIVITY_FILTER_KEYS = ["kind", "waitingOn", "authorId", "regionId", "fy", "status", "when", "week"] as const;

/** What Reset writes: every filter and the search dropped, the reader left on the tab they chose. */
export const CLEAR_EVERYTHING: ParamPatch = Object.fromEntries([...ACTIVITY_FILTER_KEYS, "q"].map((key) => [key, null]));

export function activityQueryString(params: URLSearchParams): string {
  return pickParams(params, ACTIVITY_QUERY_KEYS);
}

export function hasActiveFilters(params: URLSearchParams): boolean {
  return ACTIVITY_FILTER_KEYS.some((key) => params.get(key) !== null) || (params.get("q") ?? "") !== "";
}

/** URL readers and writers for the log: a paged list, so a new filter goes back to page one and keeps the page size. */
export function useActivityUrl() {
  return usePagedUrlState(DEFAULT_PAGE_SIZE);
}

/** Fetches the log for whatever the URL currently says, keeping the previous rows on screen. */
export function useActivityQuery(params: URLSearchParams) {
  const query = activityQueryString(params);
  const result = useQuery({
    queryKey: ["activity", query],
    queryFn: () => apiGet(`/api/activity${query ? `?${query}` : ""}`, ActivityFeedResponse),
    placeholderData: keepPreviousData,
  });
  // The response schema mirrors the repository row; this assignment is what keeps them in step.
  const items: ActivityFeedItem[] = result.data?.items ?? [];
  return { ...result, query, items, total: result.data?.total ?? 0, counts: result.data?.counts ?? null, pulse: result.data?.pulse ?? [] };
}
