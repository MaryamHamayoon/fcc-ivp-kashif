"use client";

import { fyLabel } from "@/lib/domain/glance";
import type { ReportTable as ReportTableData } from "@/lib/reports/tables";
import { ReportSection } from "./ReportSection";
import { ReportTable } from "./ReportTable";

/** The old spreadsheet, derived: every meeting in the filters, all statuses, one row each. */
export function TrackerReport({ tracker, ids, fy, csvHref }: { tracker: ReportTableData; ids: string[]; fy: number; csvHref: string }) {
  const current = fyLabel(fy);
  return (
    <ReportSection id="report-tracker" title="Tracker" description={`Every meeting in the filters for ${current}, all statuses — the one report that lists requested, developing and held meetings alongside the ones that count.`} csvHref={csvHref}>
      <ReportTable table={tracker} caption={`Tracker: every ${current} meeting in the filters`} scroll linkFor={(_, index) => (ids[index] ? `/meetings/${ids[index]}` : null)} />
    </ReportSection>
  );
}
