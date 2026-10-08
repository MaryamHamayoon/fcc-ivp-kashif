"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { PageTitle } from "@/components/common/PageTitle";
import { Pagination } from "@/components/common/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityList } from "./ActivityList";
import { ActivityPulse } from "./ActivityPulse";
import { ActivityToolbar } from "./ActivityToolbar";
import type { ActivityOptions } from "./options";
import { CLEAR_EVERYTHING, hasActiveFilters, readPage, readPageSize, useActivityQuery, useActivityUrl } from "./useActivityQuery";

/**
 * The program-wide log. The URL holds the scope, every filter, the picked week, the sort and the
 * page; this component turns that into one request and back into a screen: the toolbar, the
 * weekly pulse, the list and the pages.
 */
export function ActivityWorkspace({ options, nowMs }: { options: ActivityOptions; nowMs: number }) {
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const { params, setFilter, hrefFor, hrefForPage, setPageSize } = useActivityUrl();
  const { query, items, total, counts, pulse, isPending, isFetching, isError, refetch } = useActivityQuery(params);
  const scroller = useRef<HTMLDivElement>(null);

  const loading = isPending || (isFetching && items.length === 0);
  const clearAll = useCallback(() => setFilter(CLEAR_EVERYTHING), [setFilter]);
  // A week is the narrower answer to "when", so picking one lets a "last n days" go.
  const pickWeek = useCallback((week: string | null) => setFilter(week ? { week, when: null } : { week: null }), [setFilter]);

  // A new page or a new filter starts at its top; the rows that were on screen stay until it lands.
  // On a phone the page is the scroller, so the list's head is brought back under the top bar.
  useEffect(() => {
    const list = scroller.current;
    if (!list) return;
    list.scrollTo({ top: 0 });
    if (list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: "start" });
  }, [query]);

  return (
    <div className="relative space-y-4">
      <PageTitle>Activity</PageTitle>

      <ActivityToolbar params={params} options={options} counts={counts} total={total} isLoading={isPending} hrefFor={hrefFor} setFilter={setFilter} onClearAll={clearAll} />

      <section aria-label="Activity log" aria-busy={loading || undefined} className="relative overflow-hidden rounded-xl border bg-card shadow-soft">
        {pulse.length > 0 ? (
          <ActivityPulse pulse={pulse} selected={params.get("week")} onSelect={pickWeek} />
        ) : isError ? null : (
          // The pulse's own box — words, bars, axis — so the list does not jump when it arrives.
          <div aria-hidden className="flex flex-col gap-2 border-b px-3 pt-3 pb-1.5 sm:flex-row sm:items-start sm:gap-4">
            <Skeleton className="h-4 w-40 shrink-0 sm:mt-4 sm:h-8" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-12 w-full" />
              <div className="mt-1 h-3.5" />
            </div>
          </div>
        )}

        {/* `relative`: the rows hold visually hidden text, and an unpositioned scroller would let it stretch the page.
            From a tablet up the list scrolls on its own, so the toolbar, the pulse and the pages stay in view. */}
        <div ref={scroller} className="relative min-h-72 scroll-mt-24 md:max-h-[calc(100vh-26rem)] md:overflow-auto">
          <ActivityList items={items} now={now} isLoading={loading} isError={isError} hasFilters={hasActiveFilters(params)} onClearFilters={clearAll} onRetry={() => void refetch()} />
        </div>

        {isError ? null : <Pagination page={readPage(params)} pageSize={readPageSize(params)} total={total} noun="entries" hrefForPage={hrefForPage} onPageSizeChange={setPageSize} />}
      </section>
    </div>
  );
}
