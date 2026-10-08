"use client";

import { FileText, SearchX } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTitle } from "@/components/common/PageTitle";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ReportId } from "@/lib/api/schemas";
import { fyLabel } from "@/lib/domain/glance";
import { exportHref } from "@/lib/reports/href";
import type { ReportsPayload } from "@/lib/reports/serialize";
import type { ReportOptions } from "@/lib/services/reports";
import { CountriesReport } from "./CountriesReport";
import { CustomReport } from "./CustomReport";
import { ExpertsReport } from "./ExpertsReport";
import { ExportMenu } from "./ExportMenu";
import { ParticipantsReport } from "./ParticipantsReport";
import { ReportsFilterBar } from "./ReportsFilterBar";
import { ReportTabs } from "./ReportTabs";
import { SummaryReport } from "./SummaryReport";
import { TallyReport } from "./TallyReport";
import { TrackerReport } from "./TrackerReport";
import { CLEAR_FILTERS, hasActiveFilters, useReportsUrl } from "./useReportsUrl";

/**
 * The reports page. The server renders every report for the query in the URL and hands them
 * over as one payload; this component shows the active one, and turns each filter change
 * back into a URL for the server to render again.
 */
export function ReportsWorkspace({ payload, options, report }: { payload: ReportsPayload; options: ReportOptions; report: ReportId }) {
  const { params, hrefFor, setFilter, isPending } = useReportsUrl();
  const { fy } = payload;
  const csvHref = exportHref(params, "csv", report);
  const filtered = hasActiveFilters(params);
  const clearAll = useCallback(() => setFilter(CLEAR_FILTERS), [setFilter]);

  return (
    <div className="relative space-y-4" aria-busy={isPending || undefined}>
      <PageTitle>Reports</PageTitle>

      <ReportsFilterBar
        params={params}
        fy={fy}
        meetingCount={payload.meetingCount}
        options={options}
        hrefFor={hrefFor}
        setFilter={setFilter}
        onClearAll={clearAll}
        actions={
          <>
            <Link href={`/reports/brief?fy=${fy}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <FileText aria-hidden />
              Open the brief
            </Link>
            <ExportMenu params={params} report={report} fy={fy} />
          </>
        }
      />

      <ReportTabs params={params} active={report} />

      {/* Keeps its height either way, so the report below never jumps when a filter is applied. */}
      <div className="relative h-0.5 overflow-hidden rounded-full" role="status" aria-live="polite">
        {isPending ? (
          <>
            <span className="sr-only">Updating the report…</span>
            <span aria-hidden className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary animate-indeterminate" />
          </>
        ) : null}
      </div>

      {payload.meetingCount === 0 ? (
        <EmptyState
          icon={SearchX}
          title={filtered ? "No meetings match these filters." : `No meetings on file for ${fyLabel(fy)}.`}
          description={filtered ? "Widen the filters, or pick another year, and every report will follow." : "Pick another year above, or wait for the first request to arrive."}
          action={
            filtered ? (
              <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ActiveReport payload={payload} report={report} params={params} setFilter={setFilter} csvHref={csvHref} />
      )}
    </div>
  );
}

function ActiveReport({ payload, report, params, setFilter, csvHref }: { payload: ReportsPayload; report: ReportId; params: URLSearchParams; setFilter: ReturnType<typeof useReportsUrl>["setFilter"]; csvHref: string }) {
  const { fy } = payload;
  switch (report) {
    case "summary":
      return <SummaryReport summary={payload.summary} fy={fy} csvHref={csvHref} />;
    case "tally":
      return <TallyReport tally={payload.tally} fy={fy} csvHref={csvHref} />;
    case "participants":
      return <ParticipantsReport participants={payload.participants} fy={fy} csvHref={csvHref} />;
    case "experts":
      return <ExpertsReport experts={payload.experts} fy={fy} csvHref={csvHref} />;
    case "countries":
      return <CountriesReport countries={payload.countries} fy={fy} csvHref={csvHref} />;
    case "tracker":
      return <TrackerReport tracker={payload.tracker} ids={payload.trackerIds} fy={fy} csvHref={csvHref} />;
    case "custom":
      return <CustomReport custom={payload.custom} fy={fy} params={params} setFilter={setFilter} csvHref={csvHref} />;
  }
}
