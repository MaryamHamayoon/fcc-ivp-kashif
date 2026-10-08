"use client";

import type { ReactNode } from "react";
import { FilterChips } from "@/components/common/FilterChips";
import type { FilterOption } from "@/components/common/SelectFilter";
import { activeChips, FilterMenu, type FilterGroup } from "@/components/common/toolbar/FilterMenu";
import { ResultCount } from "@/components/common/toolbar/ResultCount";
import { ScopeTabs, type ScopeTab } from "@/components/common/toolbar/ScopeTabs";
import { Toolbar, ToolbarDivider, ToolbarRow } from "@/components/common/toolbar/Toolbar";
import { fyLabel } from "@/lib/domain/glance";
import { FORMAT_LABELS, MEETING_FORMATS, MEETING_STATUSES, STATUS_LABELS } from "@/lib/domain/types";
import type { ReportOptions } from "@/lib/services/reports";
import type { ParamPatch } from "@/lib/url-state";

const FORMAT_OPTIONS: FilterOption[] = MEETING_FORMATS.map((format) => ({ value: format, label: FORMAT_LABELS[format] }));
const STATUS_OPTIONS: FilterOption[] = MEETING_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }));

function filterGroups(options: ReportOptions): FilterGroup[] {
  return [
    { param: "regionId", label: "Region", options: options.regions },
    { param: "countryCode", label: "Country", options: options.countries },
    { param: "topicId", label: "Topic", options: options.topics },
    { param: "format", label: "Format", options: FORMAT_OPTIONS },
    { param: "bureauCode", label: "Bureau", options: options.bureaus },
    { param: "status", label: "Status", options: STATUS_OPTIONS, multi: true },
    { param: "leadUserId", label: "Lead", options: options.leads },
  ];
}

/**
 * One line, directly under the top bar: the year as scope tabs, then the meetings list's own
 * filters, how many meetings they leave, and the ways a report leaves the app. Every report and
 * export follows what is set here.
 */
export function ReportsFilterBar({
  params,
  fy,
  meetingCount,
  options,
  hrefFor,
  setFilter,
  onClearAll,
  actions,
}: {
  params: URLSearchParams;
  fy: number;
  meetingCount: number;
  options: ReportOptions;
  hrefFor: (patch: ParamPatch) => string;
  setFilter: (patch: ParamPatch) => void;
  onClearAll: () => void;
  /** The brief and the exports; they follow the filters, so they sit at the end of the same row. */
  actions?: ReactNode;
}) {
  const groups = filterGroups(options);
  const years = options.fiscalYears;
  const tabs: ScopeTab[] = years.map((year) => ({
    id: String(year),
    label: fyLabel(year),
    title: `Fiscal year ${year}`,
    // The current year is the default, so its link carries no `fy` at all.
    href: hrefFor({ fy: year === years[0] ? null : String(year) }),
    active: year === fy,
  }));

  return (
    <Toolbar>
      <ToolbarRow>
        <ScopeTabs label="Fiscal year" tabs={tabs} />
        <ToolbarDivider />
        <FilterMenu groups={groups} params={params} onChange={setFilter} />
        <FilterChips chips={activeChips(params, groups)} onChange={setFilter} onClearAll={onClearAll} />
        <div className="ms-auto flex items-center gap-1.5">
          <ResultCount total={meetingCount} noun={meetingCount === 1 ? "meeting" : "meetings"} />
          {actions ? (
            <>
              <ToolbarDivider />
              {actions}
            </>
          ) : null}
        </div>
      </ToolbarRow>
    </Toolbar>
  );
}
