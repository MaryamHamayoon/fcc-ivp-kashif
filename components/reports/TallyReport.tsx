"use client";

import { fyLabel } from "@/lib/domain/glance";
import type { Tally } from "@/lib/domain/reports";
import { tallyTable } from "@/lib/reports/tables";
import { ReportSection } from "./ReportSection";
import { ReportTable } from "./ReportTable";

/** The Excel tally, derived: each fiscal month, then the same columns by region and by topic. */
export function TallyReport({ tally, fy, csvHref }: { tally: Tally; fy: number; csvHref: string }) {
  const current = fyLabel(fy);
  const prior = fyLabel(fy - 1);
  return (
    <ReportSection id="report-tally" title="Fiscal-year tally" description={`Confirmed, completed and closed meetings in ${current} by fiscal month, with ${prior} beside them; then the same counts by region and by topic.`} csvHref={csvHref}>
      <ReportTable table={tallyTable("By month", "Month", tally.months, tally.total, fy)} caption={`${current} tally by fiscal month, with a total`} totals />
      <div className="grid gap-5 xl:grid-cols-2">
        <ReportTable table={tallyTable("By region", "Region", tally.byRegion, null, fy)} caption={`${current} tally by region`} />
        <ReportTable table={tallyTable("By topic", "Topic", tally.byTopic, null, fy)} caption={`${current} tally by topic`} />
      </div>
    </ReportSection>
  );
}
