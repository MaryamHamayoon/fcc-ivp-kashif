import type { Metadata } from "next";
import { CountriesTable } from "@/components/countries/CountriesTable";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTitle } from "@/components/common/PageTitle";
import { getDb } from "@/lib/db/client";
import { listCountriesSummary } from "@/lib/services/directory";

export const metadata: Metadata = { title: "Countries" };
export const dynamic = "force-dynamic";

export default async function CountriesPage() {
  const countries = await listCountriesSummary(await getDb());

  return (
    <div className="relative space-y-6">
      <PageTitle>Countries</PageTitle>
      {countries.length === 0 ? (
        <EmptyState title="No engagements recorded yet." description="Countries appear here once a meeting is confirmed, completed or closed." />
      ) : (
        <CountriesTable countries={countries} />
      )}
    </div>
  );
}
