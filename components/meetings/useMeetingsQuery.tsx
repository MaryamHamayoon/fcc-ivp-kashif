"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePagedUrlState } from "@/components/common/useUrlState";
import { apiGet } from "@/lib/api/client";
import { MeetingCountsResponse, MeetingListResponse, type MeetingSort } from "@/lib/api/schemas";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { MEETING_VIEWS, type MeetingView } from "@/lib/domain/status-machine";
import { MEETINGS_PAGE_SIZE, pickParams, readPageSize as readSharedPageSize } from "@/lib/url-state";

/**
 * The URL is the state. Every filter, sort, layout and page size lives in the query string,
 * so a view can be linked, bookmarked, mailed to a colleague and reloaded without loss.
 * The generic pieces live in `lib/url-state` and `components/common/useUrlState`; this file
 * knows which keys the meetings API reads.
 */

export { applyPatch, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MEETINGS_PAGE_SIZE, type ParamPatch, readPage } from "@/lib/url-state";

/** Parameters `/api/meetings` understands; anything else in the URL (layout) stays client-side. */
export const MEETING_QUERY_KEYS = ["q", "status", "regionId", "countryCode", "fy", "format", "leadUserId", "bureauCode", "topicId", "och", "waiting", "view", "sort", "dir", "page", "pageSize"] as const;

/** Filters the toolbar and the views clear together; scope, sort, layout and search survive. */
export const MEETING_FILTER_KEYS = ["status", "regionId", "countryCode", "fy", "format", "leadUserId", "bureauCode", "topicId", "och", "waiting"] as const;

/** What the scope counts are computed under: the filters and the search, never the scope itself. */
export const MEETING_COUNT_KEYS = ["q", ...MEETING_FILTER_KEYS] as const;

export const MEETING_LAYOUTS = ["table", "board", "calendar"] as const;
export type MeetingLayout = (typeof MEETING_LAYOUTS)[number];

/** The direction each column is most useful in the first time you click it. */
export const DEFAULT_SORT_DIRECTION: Record<MeetingSort, "asc" | "desc"> = {
  date: "asc",
  updated: "desc",
  country: "asc",
  status: "asc",
  readiness: "desc",
};

/** Only the keys the API reads, in a stable order, so the query key is stable too. */
export function meetingsQueryString(params: URLSearchParams): string {
  return pickParams(params, MEETING_QUERY_KEYS);
}

export function readLayout(params: URLSearchParams): MeetingLayout {
  const raw = params.get("layout");
  return MEETING_LAYOUTS.find((layout) => layout === raw) ?? "table";
}

/** The scope in the URL; absent means Active, exactly as the API defaults it. */
export function readView(params: URLSearchParams): MeetingView {
  const raw = params.get("view");
  return MEETING_VIEWS.find((view) => view === raw) ?? "active";
}

/** How many rows a page holds: what the URL says, else the meetings default the API shares. */
export function readPageSize(params: URLSearchParams): number {
  return readSharedPageSize(params, MEETINGS_PAGE_SIZE);
}

/**
 * URL readers and writers for the workspace; every write is a `replace` so Back leaves the page.
 * The table is read a page at a time, so a new filter, scope or sort goes back to page one and
 * keeps the reader's page size.
 */
export function useMeetingsUrl() {
  return usePagedUrlState(MEETINGS_PAGE_SIZE);
}

/** Fetches the list for whatever the URL currently says, keeping the previous page on screen. */
export function useMeetingsQuery(params: URLSearchParams) {
  const query = meetingsQueryString(params);
  const result = useQuery({
    queryKey: ["meetings", query],
    queryFn: () => apiGet(`/api/meetings${query ? `?${query}` : ""}`, MeetingListResponse),
    placeholderData: keepPreviousData,
  });
  // The response schema mirrors the repository row; this assignment is what keeps them in step.
  const items: MeetingListItem[] = result.data?.items ?? [];
  return { ...result, items, total: result.data?.total ?? 0 };
}

/** How many meetings each scope holds under the current filters — the figures on the scope tabs. */
export function useMeetingsCounts(params: URLSearchParams) {
  const query = pickParams(params, MEETING_COUNT_KEYS);
  return useQuery({
    queryKey: ["meetings", "counts", query],
    queryFn: () => apiGet(`/api/meetings/counts${query ? `?${query}` : ""}`, MeetingCountsResponse),
    placeholderData: keepPreviousData,
    select: (data) => data.counts,
  });
}
