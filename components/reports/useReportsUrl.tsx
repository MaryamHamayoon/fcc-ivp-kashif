"use client";

import { useCallback, useTransition } from "react";
import { useUrlState } from "@/components/common/useUrlState";
import type { ParamPatch } from "@/lib/url-state";

/**
 * The URL is the report: the year, every filter, the tab and the custom choice live in the
 * query string, so a report is a link someone can send. Each write is a replace inside a
 * transition, so the page can say it is updating while the server renders the next one.
 */

/** Filters the bar clears together; the year, the tab and the custom choice survive. */
export const REPORT_FILTER_KEYS = ["regionId", "countryCode", "topicId", "format", "bureauCode", "status", "leadUserId"] as const;

export const CLEAR_FILTERS: ParamPatch = Object.fromEntries(REPORT_FILTER_KEYS.map((key) => [key, null]));

export function hasActiveFilters(params: URLSearchParams): boolean {
  return REPORT_FILTER_KEYS.some((key) => params.get(key) !== null);
}

export function useReportsUrl() {
  const { params, hrefFor, setFilter: write } = useUrlState();
  const [isPending, startTransition] = useTransition();
  const setFilter = useCallback((patch: ParamPatch) => startTransition(() => write(patch)), [write]);
  return { params, hrefFor, setFilter, isPending };
}
