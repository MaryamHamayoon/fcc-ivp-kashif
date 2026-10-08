"use client";

import { type ActiveChip, FilterChips } from "@/components/common/FilterChips";
import { SearchField } from "@/components/common/SearchField";
import { type FilterOption, SelectFilter } from "@/components/common/SelectFilter";
import { activeChips, FilterMenu, type FilterGroup } from "@/components/common/toolbar/FilterMenu";
import { ResultCount } from "@/components/common/toolbar/ResultCount";
import { ScopeTabs, type ScopeTab } from "@/components/common/toolbar/ScopeTabs";
import { Toolbar, ToolbarDivider, ToolbarRow } from "@/components/common/toolbar/Toolbar";
import { weekLabel } from "@/lib/domain/activity-feed";
import type { ParamPatch } from "@/lib/url-state";
import type { ActivityOptions } from "./options";

const SORT_OPTIONS: FilterOption[] = [{ value: "oldest", label: "Oldest" }];

const WHEN_OPTIONS: FilterOption[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function filterGroups(options: ActivityOptions): FilterGroup[] {
  return [
    { param: "kind", label: "Kind", options: options.kinds, multi: true },
    { param: "when", label: "When", options: WHEN_OPTIONS },
    { param: "waitingOn", label: "Waiting on", options: options.parties },
    { param: "authorId", label: "Logged by", options: options.authors },
    { param: "regionId", label: "Region", options: options.regions },
    { param: "fy", label: "Fiscal year", options: options.fiscalYears },
    { param: "status", label: "Meeting status", options: options.statuses, multi: true },
  ];
}

const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The log's toolbar, in the shape of every other list's: the coarse cut as tabs with what each
 * would show, the sort at the row's end; then search, one Filter menu, the chips in force and
 * the count. A week picked on the pulse is a filter like any other, so it shows up as a chip.
 */
export function ActivityToolbar({
  params,
  options,
  counts,
  total,
  isLoading,
  hrefFor,
  setFilter,
  onClearAll,
}: {
  params: URLSearchParams;
  options: ActivityOptions;
  /** What each tab would show under the filters in force; null until the first answer. */
  counts: { all: number; open: number; mine: number } | null;
  total: number;
  isLoading: boolean;
  hrefFor: (patch: ParamPatch) => string;
  setFilter: (patch: ParamPatch) => void;
  onClearAll: () => void;
}) {
  const groups = filterGroups(options);
  const scope = params.get("scope");
  const tabs: ScopeTab[] = [
    { id: "all", label: "All", href: hrefFor({ scope: null }), active: scope !== "open" && scope !== "mine", count: counts?.all ?? null, title: "Every entry on every meeting you can see" },
    { id: "open", label: "Open follow-ups", href: hrefFor({ scope: "open" }), active: scope === "open", count: counts?.open ?? null, title: "Entries still waiting on someone" },
    { id: "mine", label: "Mine", href: hrefFor({ scope: "mine" }), active: scope === "mine", count: counts?.mine ?? null, title: "Entries you logged" },
  ];

  const week = params.get("week");
  const chips: ActiveChip[] = activeChips(params, groups);
  if (week && WEEK_KEY.test(week)) chips.push({ id: "week", label: "Week", value: weekLabel(week), patch: { week: null } });

  // A week and a "last n days" are two answers to one question, and the week wins on the server.
  // Picking a span lets the week go, so the chips never show a filter that is not being applied.
  const change = (patch: ParamPatch) => setFilter(patch.when ? { ...patch, week: null } : patch);

  return (
    <Toolbar>
      <ToolbarRow className="pr-1">
        <ScopeTabs label="Scope" tabs={tabs} loading={isLoading} className="min-w-0 flex-1" />
        <SelectFilter label="Sort" param="sort" allLabel="Newest" options={SORT_OPTIONS} params={params} setFilter={setFilter} />
      </ToolbarRow>
      <ToolbarRow>
        <SearchField bare label="Search the log" placeholder="Search the log" params={params} setFilter={setFilter} className="w-52 lg:w-64" />
        <ToolbarDivider />
        <FilterMenu groups={groups} params={params} onChange={change} />
        <FilterChips chips={chips} onChange={change} onClearAll={onClearAll} />
        <div className="ms-auto">
          <ResultCount total={total} noun={total === 1 ? "entry" : "entries"} isLoading={isLoading} />
        </div>
      </ToolbarRow>
    </Toolbar>
  );
}
