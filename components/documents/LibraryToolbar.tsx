"use client";

import { FilterChips } from "@/components/common/FilterChips";
import { SearchField } from "@/components/common/SearchField";
import { type FilterOption, SelectFilter } from "@/components/common/SelectFilter";
import { activeChips, FilterMenu, type FilterGroup } from "@/components/common/toolbar/FilterMenu";
import { ResultCount } from "@/components/common/toolbar/ResultCount";
import { ScopeTabs, type ScopeTab } from "@/components/common/toolbar/ScopeTabs";
import { Toolbar, ToolbarDivider, ToolbarRow } from "@/components/common/toolbar/Toolbar";
import { fyLabel } from "@/lib/domain/glance";
import { MEETING_STATUSES, STATUS_LABELS } from "@/lib/domain/types";
import type { ParamPatch } from "@/lib/url-state";
import type { LibraryOptions } from "./options";

const SORT_OPTIONS: FilterOption[] = [
  { value: "title", label: "Title" },
  { value: "meeting", label: "Meeting date" },
];

const STATUS_OPTIONS: FilterOption[] = MEETING_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }));

function filterGroups(options: LibraryOptions): FilterGroup[] {
  return [
    { param: "kind", label: "Type", options: options.kinds },
    { param: "topicId", label: "Topic", options: options.topics },
    { param: "countryCode", label: "Country", options: options.countries },
    { param: "regionId", label: "Region", options: options.regions },
    { param: "orgId", label: "Organization", options: options.organizations },
    { param: "fy", label: "Fiscal year", options: options.fiscalYears.map((fy) => ({ value: String(fy), label: fyLabel(fy) })) },
    { param: "status", label: "Meeting status", options: STATUS_OPTIONS, multi: true },
  ];
}

/**
 * The shelf's toolbar, in the meetings page's shape: the whole shelf or only what is starred
 * for reuse, the sort at the row's end; then search, one Filter menu, the chips in force and
 * the count.
 */
export function LibraryToolbar({
  params,
  options,
  shown,
  total,
  isLoading,
  hrefFor,
  setFilter,
  onClearAll,
}: {
  params: URLSearchParams;
  options: LibraryOptions;
  shown: number;
  total: number;
  isLoading: boolean;
  hrefFor: (patch: ParamPatch) => string;
  setFilter: (patch: ParamPatch) => void;
  onClearAll: () => void;
}) {
  const groups = filterGroups(options);
  const reusable = params.get("reusable") === "true";
  const tabs: ScopeTab[] = [
    { id: "all", label: "All", href: hrefFor({ reusable: null }), active: !reusable, title: "Everything on file" },
    { id: "reusable", label: "Reuse-ready", href: hrefFor({ reusable: "true" }), active: reusable, title: "Starred for reuse on a later visit" },
  ];

  return (
    <Toolbar>
      <ToolbarRow className="pr-1">
        <ScopeTabs label="Shelf" tabs={tabs} className="min-w-0 flex-1" />
        <SelectFilter label="Sort" param="sort" allLabel="Newest" options={SORT_OPTIONS} params={params} setFilter={setFilter} />
      </ToolbarRow>
      <ToolbarRow>
        <SearchField bare label="Search documents" placeholder="Search documents" params={params} setFilter={setFilter} className="w-52 lg:w-64" />
        <ToolbarDivider />
        <FilterMenu groups={groups} params={params} onChange={setFilter} />
        <FilterChips chips={activeChips(params, groups)} onChange={setFilter} onClearAll={onClearAll} />
        <div className="ms-auto">
          <ResultCount shown={shown} total={total} noun="documents" isLoading={isLoading} />
        </div>
      </ToolbarRow>
    </Toolbar>
  );
}
