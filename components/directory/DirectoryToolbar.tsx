"use client";

import { SearchField } from "@/components/common/SearchField";
import { type FilterOption, SelectFilter } from "@/components/common/SelectFilter";
import { ResultCount } from "@/components/common/toolbar/ResultCount";
import { ScopeTabs, type ScopeTab } from "@/components/common/toolbar/ScopeTabs";
import { Toolbar, ToolbarDivider, ToolbarRow } from "@/components/common/toolbar/Toolbar";
import type { DirectoryTab } from "@/lib/domain/directory-query";
import type { ParamPatch } from "@/lib/url-state";

export type BureauCount = { code: string; name: string; staff: number };

const SORT_OPTIONS: FilterOption[] = [{ value: "name", label: "Name, A to Z" }];

/**
 * Two lines in one box, as on every list page. The first cuts the directory into its two lists,
 * each counted; a tab is a plain link that starts its list fresh. The second is the command
 * row: a search, and for the experts one Bureau dropdown and the sort, then the count.
 */
export function DirectoryToolbar({
  tab,
  params,
  setFilter,
  counts,
  bureaus = [],
  shown,
  total,
  isLoading = false,
}: {
  tab: DirectoryTab;
  params: URLSearchParams;
  setFilter: (patch: ParamPatch) => void;
  /** Everyone and everything on file; a search does not move these. */
  counts: { experts: number; organizations: number };
  bureaus?: BureauCount[];
  /** Rows on screen, against `total` matched. */
  shown: number;
  total: number;
  isLoading?: boolean;
}) {
  const tabs: ScopeTab[] = [
    { id: "experts", label: "FCC experts & POCs", title: "FCC staff who brief visiting delegations", href: "/directory", active: tab === "experts", count: counts.experts },
    { id: "organizations", label: "Organizations & contacts", title: "Visiting organizations and the people there", href: "/directory?tab=organizations", active: tab === "organizations", count: counts.organizations },
  ];
  // A bureau with nobody on the roster could only ever open an empty list.
  const bureauOptions: FilterOption[] = bureaus.filter((bureau) => bureau.staff > 0).map((bureau) => ({ value: bureau.code, label: bureau.name, short: bureau.code, hint: String(bureau.staff) }));

  return (
    <Toolbar>
      <ToolbarRow>
        <ScopeTabs label="Directory" tabs={tabs} className="min-w-0 flex-1" />
      </ToolbarRow>
      <ToolbarRow>
        {tab === "experts" ? (
          <>
            <SearchField bare label="Search experts" placeholder="Search by name, title or email" params={params} setFilter={setFilter} className="w-60 lg:w-72" />
            <ToolbarDivider />
            <SelectFilter searchable label="Bureau" param="bureauCode" allLabel="All bureaus" options={bureauOptions} params={params} setFilter={setFilter} />
            <SelectFilter label="Sort" param="sort" allLabel="Most engaged" options={SORT_OPTIONS} params={params} setFilter={setFilter} />
          </>
        ) : (
          <SearchField bare label="Search organizations" placeholder="Search by organization or country" params={params} setFilter={setFilter} className="w-60 lg:w-72" />
        )}
        <ResultCount shown={shown} total={total} noun={tab === "experts" ? "experts" : "organizations"} isLoading={isLoading} className="ms-auto pr-1.5" />
      </ToolbarRow>
    </Toolbar>
  );
}
