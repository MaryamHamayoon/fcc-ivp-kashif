"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useUrlState } from "@/components/common/useUrlState";
import { apiGet } from "@/lib/api/client";
import { DOCUMENT_SORTS, DocumentLibraryResponse, type DocumentSort } from "@/lib/api/schemas";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { type ParamPatch, pickParams } from "@/lib/url-state";

/**
 * The library's URL is its state, exactly as on Meetings: every filter, the sort, the page
 * size and the open drawer (`doc`) live in the query string, so a shelf can be linked and
 * mailed. This file knows which keys `/api/documents` reads; the generic pieces live in
 * `lib/url-state` and `components/common/useUrlState`.
 */

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type ParamPatch, readPageSize } from "@/lib/url-state";

/** Parameters `/api/documents` understands; `doc` stays client-side. */
export const LIBRARY_QUERY_KEYS = ["q", "kind", "topicId", "countryCode", "regionId", "orgId", "fy", "status", "reusable", "sort", "page", "pageSize"] as const;

/**
 * Filters the toolbar clears together; sort and the open drawer survive. `reusable` is not one
 * of them: it is the shelf's scope — the Reuse-ready tab — exactly as `view` is on Meetings, so
 * Reset must leave the reader where they are standing.
 */
export const LIBRARY_FILTER_KEYS = ["kind", "topicId", "countryCode", "regionId", "orgId", "fy", "status"] as const;

/** What Reset writes: every filter and the search dropped, the scope and the sort kept. */
export const CLEAR_EVERYTHING: ParamPatch = Object.fromEntries([...LIBRARY_FILTER_KEYS, "q"].map((key) => [key, null]));

export function libraryQueryString(params: URLSearchParams): string {
  return pickParams(params, LIBRARY_QUERY_KEYS);
}

export function readSort(params: URLSearchParams): DocumentSort {
  const raw = params.get("sort");
  return DOCUMENT_SORTS.find((sort) => sort === raw) ?? "newest";
}

export function hasActiveFilters(params: URLSearchParams): boolean {
  return LIBRARY_FILTER_KEYS.some((key) => params.get(key) !== null) || (params.get("q") ?? "") !== "";
}

/** URL readers and writers for the library, plus the drawer's `doc` parameter. */
export function useLibraryUrl() {
  const url = useUrlState();
  const { setParams } = url;
  const docId = url.params.get("doc");
  const openDoc = useCallback((id: string | null) => setParams({ doc: id }), [setParams]);
  return { ...url, docId, openDoc };
}

/** Fetches the shelf for whatever the URL currently says, keeping the previous rows on screen. */
export function useLibraryQuery(params: URLSearchParams) {
  const query = libraryQueryString(params);
  const result = useQuery({
    queryKey: ["documents", query],
    queryFn: () => apiGet(`/api/documents${query ? `?${query}` : ""}`, DocumentLibraryResponse),
    placeholderData: keepPreviousData,
  });
  // The response schema mirrors the repository row; this assignment is what keeps them in step.
  const items: DocumentLibraryItem[] = result.data?.items ?? [];
  return { ...result, items, total: result.data?.total ?? 0 };
}
