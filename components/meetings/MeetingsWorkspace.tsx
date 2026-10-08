"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { resumeAction, transitionAction } from "@/app/(app)/meetings/actions";
import { PageTitle } from "@/components/common/PageTitle";
import { Pagination } from "@/components/common/Pagination";
import { MEETING_SORTS, type MeetingSort } from "@/lib/api/schemas";
import { toCsv } from "@/lib/csv";
import { nyParts } from "@/lib/domain/fiscal-year";
import { formatNumber } from "@/lib/format";
import { MeetingsBoard } from "./MeetingsBoard";
import { MeetingsCalendar } from "./MeetingsCalendar";
import { DEFAULT_MEETING_COLUMNS, type MeetingColumnId, MeetingsTable, meetingCsvColumns, type SortDirection } from "./MeetingsTable";
import { hasActiveFilters, MeetingsToolbar } from "./MeetingsToolbar";
import type { MeetingsFilterOptions } from "./options";
import { applyPatch, DEFAULT_SORT_DIRECTION, MAX_PAGE_SIZE, MEETING_FILTER_KEYS, meetingsQueryString, type ParamPatch, readLayout, readPage, readPageSize, useMeetingsCounts, useMeetingsQuery, useMeetingsUrl } from "./useMeetingsQuery";

const CLEAR_EVERYTHING: ParamPatch = Object.fromEntries([...MEETING_FILTER_KEYS, "q"].map((key) => [key, null]));

const BOM = "﻿";

const pad = (value: number) => String(value).padStart(2, "0");

function readSort(params: URLSearchParams): MeetingSort {
  const raw = params.get("sort");
  return MEETING_SORTS.find((sort) => sort === raw) ?? "date";
}

/** Absent `dir` means the server's default (ascending); the UI must not disagree with it. */
function readDirection(params: URLSearchParams): SortDirection {
  return params.get("dir") === "desc" ? "desc" : "asc";
}

/**
 * The meetings workspace. The URL holds every filter, the scope, the sort, the layout, the page
 * and how many rows a page holds; this component only turns that into requests and back into a screen.
 */
export function MeetingsWorkspace({ options, nowMs }: { options: MeetingsFilterOptions; nowMs: number }) {
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const { params, setParams, setFilter, hrefFor, hrefForPage, setPageSize } = useMeetingsUrl();
  const [columns, setColumns] = useState<MeetingColumnId[]>(DEFAULT_MEETING_COLUMNS);

  const queryClient = useQueryClient();

  const layout = readLayout(params);
  const sort = readSort(params);
  const dir = readDirection(params);

  // The board and the calendar have to show the whole filtered set, not one page of it:
  // a column tally or a month grid that stops at row 50 is worse than no tally at all.
  const queryParams = useMemo(() => (layout === "table" ? params : applyPatch(params, { page: null, pageSize: String(MAX_PAGE_SIZE) })), [layout, params]);
  const { items, total, isPending, isFetching, isPlaceholderData, isError, refetch } = useMeetingsQuery(queryParams);
  const tableTop = useRef<HTMLDivElement>(null);
  const { data: counts } = useMeetingsCounts(params);
  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: ["meetings"] }), [queryClient]);

  const onSortChange = useCallback(
    (next: MeetingSort) => setParams({ sort: next, dir: next === sort ? (dir === "asc" ? "desc" : "asc") : DEFAULT_SORT_DIRECTION[next], page: null }),
    [dir, setParams, sort],
  );

  const clearAll = useCallback(() => setFilter(CLEAR_EVERYTHING), [setFilter]);

  // A new page or a new filter starts at the table's top; the rows that were on screen stay until it lands.
  // The page is the scroller, so a table whose head has slipped above the fold is brought back under the top bar.
  const listQuery = meetingsQueryString(params);
  useEffect(() => {
    const table = tableTop.current;
    if (table && table.getBoundingClientRect().top < 0) table.scrollIntoView({ block: "start" });
  }, [listQuery]);

  const exportCsv = useCallback(() => {
    if (items.length === 0) {
      toast.error("There is nothing to export yet.");
      return;
    }
    const { year, month, day } = nyParts(now);
    const filename = `ivp-meetings-${year}-${pad(month)}-${pad(day)}.csv`;
    // The BOM is what makes Excel read "Côte d'Ivoire" as UTF-8 instead of mojibake.
    const blob = new Blob([BOM, toCsv(items, meetingCsvColumns(columns, now))], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} ${items.length === 1 ? "meeting" : "meetings"}`, { description: filename });
  }, [columns, items, now]);

  const loading = isPending || (isFetching && items.length === 0);
  const filtered = hasActiveFilters(params);
  // Neither the board nor the calendar pages, so the cap is the one thing they cannot show; say it.
  const capped = layout !== "table" && items.length < total;

  return (
    // The top bar names the page, so the toolbar is the first thing under it. `relative` holds the sr-only title.
    <div className="relative space-y-4">
      <PageTitle>{layout === "board" ? "Meetings, as a board" : layout === "calendar" ? "Meetings, as a calendar" : "Meetings"}</PageTitle>

      <MeetingsToolbar
        params={params}
        options={options}
        counts={counts}
        layout={layout}
        shown={items.length}
        total={total}
        isLoading={isPending}
        hrefFor={hrefFor}
        setFilter={setFilter}
        onReset={clearAll}
        columns={columns}
        onColumnsChange={setColumns}
        onExport={exportCsv}
      />

      {layout === "board" ? (
        <MeetingsBoard items={items} now={now} transition={transitionAction} resume={resumeAction} onChanged={refresh} isLoading={loading} isError={isError} hasFilters={filtered} onClearFilters={clearAll} onRetry={() => void refetch()} />
      ) : layout === "calendar" ? (
        <MeetingsCalendar items={items} now={now} isLoading={loading} isError={isError} hasFilters={filtered} onClearFilters={clearAll} onRetry={() => void refetch()} />
      ) : (
        <div ref={tableTop} className="scroll-mt-24">
          <MeetingsTable
            items={items}
            now={now}
            sort={sort}
            dir={dir}
            onSortChange={onSortChange}
            columns={columns}
            isLoading={loading}
            isError={isError}
            hasFilters={filtered}
            onClearFilters={clearAll}
            onRetry={() => void refetch()}
            isPlaceholder={isPlaceholderData}
            pagination={isError || total === 0 ? null : <Pagination page={readPage(params)} pageSize={readPageSize(params)} total={total} noun="meetings" hrefForPage={hrefForPage} onPageSizeChange={setPageSize} className="border-t-0" />}
          />
        </div>
      )}

      {capped ? (
        <p className="text-xs text-muted-foreground">
          First {formatNumber(items.length)} of {formatNumber(total)} shown. Narrow the scope or add a filter to see the rest.
        </p>
      ) : null}
    </div>
  );
}
