"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { applyPatch, type ParamPatch } from "@/lib/url-state";

/** URL readers and writers for a workspace; every write is a `replace`, so Back leaves the page. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const setParams = useCallback(
    (patch: ParamPatch) => {
      const next = applyPatch(params, patch);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /** Changing a filter always returns to the first page's worth of rows. */
  const setFilter = useCallback((patch: ParamPatch) => setParams({ ...patch, page: null, pageSize: null }), [setParams]);

  const hrefFor = useCallback(
    (patch: ParamPatch) => {
      const query = applyPatch(params, { ...patch, page: null, pageSize: null }).toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [params, pathname],
  );

  return { params, setParams, setFilter, hrefFor };
}

/**
 * The same readers and writers for a list read a page at a time. Here the page size is something
 * the reader chose, not a count of rows loaded so far, so a new filter or scope sends them back
 * to page one without forgetting how many rows they asked to see; the default size is never
 * written. Pages are links, so `hrefForPage` builds them.
 */
export function usePagedUrlState(defaultPageSize: number) {
  const { params, setParams } = useUrlState();
  const pathname = usePathname();

  const setFilter = useCallback((patch: ParamPatch) => setParams({ ...patch, page: null }), [setParams]);

  const hrefWith = useCallback(
    (patch: ParamPatch) => {
      const query = applyPatch(params, patch).toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [params, pathname],
  );
  const hrefFor = useCallback((patch: ParamPatch) => hrefWith({ ...patch, page: null }), [hrefWith]);
  const hrefForPage = useCallback((page: number) => hrefWith({ page: page > 1 ? String(page) : null }), [hrefWith]);
  const setPageSize = useCallback((size: number) => setParams({ pageSize: size === defaultPageSize ? null : String(size), page: null }), [defaultPageSize, setParams]);

  return { params, setParams, setFilter, hrefFor, hrefForPage, setPageSize };
}
