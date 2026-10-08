"use client";

import { Download } from "lucide-react";
import { FilterChips } from "@/components/common/FilterChips";
import { SearchField } from "@/components/common/SearchField";
import type { FilterOption } from "@/components/common/SelectFilter";
import { activeChips, FilterMenu, type FilterGroup, type FilterToggle, readValues } from "@/components/common/toolbar/FilterMenu";
import { ResultCount } from "@/components/common/toolbar/ResultCount";
import { ScopeTabs, type ScopeTab } from "@/components/common/toolbar/ScopeTabs";
import { Toolbar, ToolbarDivider, ToolbarRow } from "@/components/common/toolbar/Toolbar";
import { Button } from "@/components/ui/button";
import type { MeetingCounts } from "@/lib/api/schemas";
import { fyLabel } from "@/lib/domain/glance";
import { type MeetingView, VIEW_STATUSES } from "@/lib/domain/status-machine";
import { FORMAT_LABELS, MEETING_FORMATS, MEETING_STATUSES, type MeetingStatus, STATUS_LABELS, WAITING_ON, type WaitingOn } from "@/lib/domain/types";
import type { ParamPatch } from "@/lib/url-state";
import type { MeetingColumnId } from "./MeetingsTable";
import type { MeetingsFilterOptions } from "./options";
import { TableTools } from "./TableTools";
import { MEETING_FILTER_KEYS, type MeetingLayout, readView } from "./useMeetingsQuery";
import { ViewsMenu } from "./ViewsMenu";
import { ViewSwitch } from "./ViewSwitch";

/* --------------------------------- scopes --------------------------------- */

/** The coarse cuts of the list, in the order the office thinks about the year. */
const SCOPES: { id: MeetingView; label: string; title: string }[] = [
  { id: "active", label: "Active", title: "Everything still in play" },
  { id: "upcoming", label: "Upcoming", title: "Accepted dates still ahead" },
  { id: "developing", label: "Developing", title: "Requested, developing or in clearance" },
  { id: "on_hold", label: "On hold", title: "Paused, with a follow-up date" },
  { id: "completed", label: "Completed", title: "Held or closed" },
  { id: "all", label: "All", title: "Every meeting on file" },
];

/* --------------------------------- filters -------------------------------- */

const FORMAT_OPTIONS: FilterOption[] = MEETING_FORMATS.map((format) => ({ value: format, label: FORMAT_LABELS[format] }));
const STATUS_OPTIONS: FilterOption[] = MEETING_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }));

/** Plainer than the sentence fragments used in prose, because a filter list is scanned, not read. */
const WAITING_FILTER_LABELS = {
  none: "Nobody — not blocked",
  visitor: "Visiting delegation",
  expert: "FCC expert",
  internal: "OIA front office",
  och: "Office of the Chairman",
} satisfies Record<WaitingOn, string>;

const WAITING_OPTIONS: FilterOption[] = WAITING_ON.map((who) => ({ value: who, label: WAITING_FILTER_LABELS[who] }));

const TOGGLES: FilterToggle[] = [{ param: "och", label: "OCH attending", hint: "Chairman's office joining" }];

function filterGroups(options: MeetingsFilterOptions): FilterGroup[] {
  return [
    { param: "status", label: "Status", options: STATUS_OPTIONS, multi: true },
    { param: "regionId", label: "Region", options: options.regions },
    { param: "countryCode", label: "Country", options: options.countries },
    { param: "fy", label: "Fiscal year", options: options.fiscalYears.map((fy) => ({ value: String(fy), label: fyLabel(fy) })) },
    { param: "format", label: "Format", options: FORMAT_OPTIONS },
    { param: "leadUserId", label: "Lead", options: options.leads },
    { param: "bureauCode", label: "Bureau", options: options.bureaus },
    { param: "topicId", label: "Topic", options: options.topics },
    { param: "waiting", label: "Waiting on", options: WAITING_OPTIONS },
  ];
}

export function hasActiveFilters(params: URLSearchParams): boolean {
  return MEETING_FILTER_KEYS.some((key) => params.get(key) !== null) || (params.get("q") ?? "") !== "";
}

/* --------------------------------- toolbar -------------------------------- */

/**
 * Two lines in one box, directly under the top bar. The first cuts the list by scope, each tab
 * counted, with the CSV export and the Views menu at its end. The second is the command row:
 * search, one Filter menu, the chips in force, the count, and how the list is drawn.
 */
export function MeetingsToolbar({
  params,
  options,
  counts,
  layout,
  shown,
  total,
  isLoading,
  hrefFor,
  setFilter,
  onReset,
  columns,
  onColumnsChange,
  onExport,
}: {
  params: URLSearchParams;
  options: MeetingsFilterOptions;
  /** Per-scope totals under the current filters; undefined until the first count arrives. */
  counts: MeetingCounts | undefined;
  layout: MeetingLayout;
  /** Rows on screen, against `total` matched. */
  shown: number;
  total: number;
  isLoading: boolean;
  hrefFor: (patch: ParamPatch) => string;
  setFilter: (patch: ParamPatch) => void;
  /** Drops every filter and the search; the scope stays. */
  onReset: () => void;
  columns: MeetingColumnId[];
  onColumnsChange: (columns: MeetingColumnId[]) => void;
  /** Writes the rows on screen to a CSV; absent where the page has no export to offer. */
  onExport?: () => void;
}) {
  const view = readView(params);
  const groups = filterGroups(options);
  const chips = activeChips(params, groups, TOGGLES);
  const statuses = readValues(params, "status");
  const tabs: ScopeTab[] = SCOPES.map((scope) => {
    const admitted = VIEW_STATUSES[scope.id];
    const kept = admitted == null ? statuses : statuses.filter((status) => admitted.includes(status as MeetingStatus));
    const patch: ParamPatch = { view: scope.id === "active" ? null : scope.id };
    // Carrying a status the scope cannot show would make the tab a guaranteed empty list.
    if (kept.length !== statuses.length) patch.status = kept.length ? kept : null;
    return { id: scope.id, label: scope.label, title: scope.title, href: hrefFor(patch), active: view === scope.id, count: counts?.[scope.id] ?? null };
  });

  // A status outside the scope would match nothing, so choosing one widens the scope to All.
  const change = (patch: ParamPatch) => {
    const admitted = VIEW_STATUSES[view];
    const chosen = patch.status;
    const outside = admitted != null && chosen != null && (Array.isArray(chosen) ? chosen : [chosen]).some((status) => !admitted.includes(status as MeetingStatus));
    setFilter(outside ? { ...patch, view: "all" } : patch);
  };

  return (
    <Toolbar>
      <ToolbarRow className="pr-1">
        <ScopeTabs label="Scope" tabs={tabs} loading={!counts} className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-0.5">
          {onExport ? (
            <Button type="button" variant="ghost" size="sm" onClick={onExport} disabled={shown === 0} title="Download the rows on screen as a CSV">
              <Download aria-hidden />
              {/* One name at every width; on a phone the arrow alone leaves the scope tabs their room. */}
              <span className="max-sm:sr-only">Export CSV</span>
            </Button>
          ) : null}
          <ViewsMenu params={params} options={options} hrefFor={hrefFor} />
        </div>
      </ToolbarRow>
      <ToolbarRow>
        <SearchField bare label="Search meetings" placeholder="Search meetings" params={params} setFilter={setFilter} className="w-52 lg:w-64" />
        <ToolbarDivider />
        <FilterMenu groups={groups} toggles={TOGGLES} params={params} onChange={change} />
        <FilterChips chips={chips} onChange={setFilter} onClearAll={onReset} />
        <div className="ms-auto flex items-center gap-1.5">
          <ResultCount shown={shown} total={total} noun="meetings" isLoading={isLoading} />
          <ToolbarDivider />
          <ViewSwitch layout={layout} hrefFor={hrefFor} />
          {layout === "table" ? <TableTools columns={columns} onColumnsChange={onColumnsChange} /> : null}
        </div>
      </ToolbarRow>
    </Toolbar>
  );
}
