"use client";

import { ChartFigure } from "@/components/charts/ChartFigure";
import { PairedBars } from "@/components/charts/PairedBars";
import { fyLabel } from "@/lib/domain/glance";
import { STATUS_LABELS } from "@/lib/domain/types";
import type { ParticipantsPayload } from "@/lib/reports/serialize";
import { isoDate, type ReportTable as ReportTableData } from "@/lib/reports/tables";
import { ReportSection } from "./ReportSection";
import { ReportTable } from "./ReportTable";

/** Who came: category totals beside every counted meeting's planned and actual headcount. */
export function ParticipantsReport({ participants, fy, csvHref }: { participants: ParticipantsPayload; fy: number; csvHref: string }) {
  const current = fyLabel(fy);
  const { rows, totals, plannedTotal, actualTotal } = participants;
  const categories = totals.filter((c) => c.planned > 0 || c.actual > 0);

  const table: ReportTableData = {
    name: "Participants by meeting",
    columns: ["IVP code", "Date", "Country", "Organization", "Status", "Planned", "Actual"],
    rows: [...rows.map((r) => [r.code, isoDate(r.date), r.countryName, r.orgName, STATUS_LABELS[r.status], r.planned, r.actual]), ["Total", null, null, null, null, plannedTotal, actualTotal]],
  };

  return (
    <ReportSection id="report-participants" title="Participants" description={`Headcounts for meetings counted in ${current}: what was planned, and what was recorded afterwards. The CSV carries every category.`} csvHref={csvHref}>
      <div className="grid gap-5 xl:grid-cols-12">
        <ChartFigure
          title="By category"
          description={`Participants planned and actually attending in ${current}, by category.`}
          table={{ columns: ["Category", "Planned", "Actual"], rows: totals.map((c) => [c.label, c.planned, c.actual]) }}
          className="xl:col-span-5 self-start"
        >
          {categories.length === 0 ? (
            <p className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">No participants recorded yet for {current}.</p>
          ) : (
            <PairedBars data={categories.map((c) => ({ key: c.category, label: c.label, planned: c.planned, actual: c.actual }))} label={`Participants by category in ${current}`} />
          )}
        </ChartFigure>
        <ReportTable table={table} caption={`Participants by meeting in ${current}, with a total`} totals scroll linkFor={(_, index) => `/meetings/${rows[index]!.meetingId}`} className="xl:col-span-7" />
      </div>
    </ReportSection>
  );
}
