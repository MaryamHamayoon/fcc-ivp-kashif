import type { Metadata } from "next";
import { Analytics } from "@/components/dashboard/Analytics";
import { WorldMap } from "@/components/dashboard/map/WorldMap";
import { ProgramBand } from "@/components/dashboard/ProgramBand";
import { UpcomingMeetings } from "@/components/dashboard/UpcomingMeetings";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { getDashboardData } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

function parseFy(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const fy = Number(value);
  return Number.isInteger(fy) && fy >= 2000 && fy <= 2100 ? fy : undefined;
}

/**
 * The dashboard opens straight onto the program band, directly under the top bar: no greeting,
 * no date line, no year picker. The band names the fiscal year it is showing, and `?fy=` still
 * answers for anyone arriving from a report on an earlier year.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const [{ fy }, user] = await Promise.all([searchParams, requireUser()]);
  const data = await getDashboardData(await getDb(), { fy: parseFy(fy), user: toPolicyUser(user) });

  return (
    // `relative` keeps the sr-only title from inflating the page inside the scrolling column.
    <div className="relative grid gap-6 xl:grid-cols-12">
      <h1 className="sr-only">Dashboard</h1>
      <ProgramBand kpis={data.kpis} fiscalYear={data.fiscalYear} asOf={data.asOf} scoped={data.scoped} className="xl:col-span-12" />
      {/* One height for the pair: the upcoming list is cut to fit it and the map fills it. */}
      <UpcomingMeetings meetings={data.upcoming} total={data.upcomingTotal} now={data.asOf} className="xl:col-span-5 xl:h-[35rem]" />
      <WorldMap reach={data.reach} className="xl:col-span-7 xl:h-[35rem]" />
      <Analytics analytics={data.analytics} fy={data.fiscalYear} className="xl:col-span-12" />
    </div>
  );
}
