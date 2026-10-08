import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ReportsWorkspace } from "@/components/reports/ReportsWorkspace";
import { Skeleton } from "@/components/ui/skeleton";
import { parseReportQuery } from "@/lib/api/schemas";
import { requireCan, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { serializeReports } from "@/lib/reports/serialize";
import { buildReports, loadReportDataset, reportOptions } from "@/lib/services/reports";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/** Next hands the query as a record; the parser reads the same URLSearchParams the client writes. */
function toParams(sp: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) for (const v of value) params.append(key, v);
    else if (value !== undefined) params.append(key, value);
  }
  return params;
}

function WorkspaceFallback() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <span className="sr-only">Loading reports…</span>
      <Skeleton className="h-16 w-96" />
      <Skeleton className="h-14 w-full rounded-2xl" />
      <Skeleton className="h-9 w-full max-w-3xl" />
      <Skeleton className="h-[28rem] rounded-2xl" />
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, user] = await Promise.all([searchParams, requireCan("reports.read", { kind: "system" }, "/reports")]);
  const parsed = parseReportQuery(toParams(sp));
  if (!parsed.success) redirect("/reports");
  const query = parsed.data;

  const actor = toPolicyUser(user);
  const now = new Date();
  const db = await getDb();
  const [ds, options] = await Promise.all([loadReportDataset(db, query, actor, now), reportOptions(db, actor, now)]);
  const payload = serializeReports(buildReports(ds, query.rows, query.measure), ds);

  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <ReportsWorkspace payload={payload} options={options} report={query.report} />
    </Suspense>
  );
}
