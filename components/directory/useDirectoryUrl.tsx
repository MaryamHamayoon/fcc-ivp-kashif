"use client";

import { usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { useUrlState } from "@/components/common/useUrlState";
import { DIRECTORY_PAGE_SIZE } from "@/lib/domain/directory-query";
import { applyPatch, type ParamPatch } from "@/lib/url-state";

/** What the toolbar's "clear" lets go of; the tab stays. */
export const CLEAR_DIRECTORY: ParamPatch = { q: null, bureauCode: null, sort: null };

export function hasDirectoryFilters(params: URLSearchParams): boolean {
  return (params.get("q") ?? "") !== "" || params.get("bureauCode") !== null;
}

/**
 * The directory is rendered on the server from its URL: the tab, the search, the bureau, the
 * sort, the page. Every write is a replace inside a transition, so the list can dim while the
 * next one is on its way. A new filter goes back to page one and keeps the page size.
 */
export function useDirectoryUrl() {
  const { params, setParams } = useUrlState();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const write = useCallback((patch: ParamPatch) => startTransition(() => setParams(patch)), [setParams]);
  const setFilter = useCallback((patch: ParamPatch) => write({ ...patch, page: null }), [write]);
  const setPageSize = useCallback((size: number) => write({ pageSize: size === DIRECTORY_PAGE_SIZE ? null : String(size), page: null }), [write]);
  const hrefForPage = useCallback(
    (page: number) => {
      const query = applyPatch(params, { page: page > 1 ? String(page) : null }).toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [params, pathname],
  );

  return { params, setFilter, setPageSize, hrefForPage, isPending };
}
