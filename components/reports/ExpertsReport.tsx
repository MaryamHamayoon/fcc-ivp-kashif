"use client";

import Link from "next/link";
import { UserAvatar } from "@/components/common/Avatar";
import { fyLabel } from "@/lib/domain/glance";
import type { BrieferRow, BureauRow } from "@/lib/domain/reports";
import { formatNumber } from "@/lib/format";
import { bureausTable } from "@/lib/reports/tables";
import { ReportSection } from "./ReportSection";
import { ReportTable } from "./ReportTable";

const TOP_BRIEFERS = 8;

/** Which bureaus lent their people, how readily, and who briefed most. */
export function ExpertsReport({ experts, fy, csvHref }: { experts: { bureaus: BureauRow[]; briefers: BrieferRow[] }; fy: number; csvHref: string }) {
  const current = fyLabel(fy);
  const briefers = experts.briefers.slice(0, TOP_BRIEFERS);

  return (
    <ReportSection id="report-experts" title="Experts & bureaus" description={`Requests put to FCC experts for meetings counted in ${current}: by bureau, how many were asked, how many said yes, and how long an answer took in business days.`} csvHref={csvHref}>
      <div className="grid gap-5 xl:grid-cols-12">
        <ReportTable table={bureausTable(experts.bureaus)} caption={`Expert requests by bureau in ${current}`} className="xl:col-span-8" />

        <section aria-labelledby="report-briefers" className="rounded-2xl border bg-card p-5 shadow-soft xl:col-span-4">
          <p className="eyebrow" id="report-briefers">
            Top briefers
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Asked most often in {current}.</p>
          {briefers.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nobody has been asked yet.</p>
          ) : (
            <ol className="mt-4 divide-y">
              {briefers.map((b) => (
                <li key={b.staffId} className="flex items-center gap-3 py-2.5">
                  <UserAvatar name={b.name} size="sm" decorative />
                  <span className="min-w-0 flex-1">
                    <Link href={`/directory/staff/${b.staffId}`} className="block truncate text-sm font-medium text-foreground underline-offset-2 hover:underline">
                      {b.name}
                    </Link>
                    <span className="block text-[0.6875rem] text-muted-foreground">{b.bureauCode ?? "Bureau not recorded"}</span>
                  </span>
                  <span className="text-right">
                    <span className="numeric block text-sm font-semibold text-foreground">{formatNumber(b.engagements)}</span>
                    <span className="block text-[0.6875rem] text-muted-foreground">{formatNumber(b.confirmed)} confirmed</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </ReportSection>
  );
}
